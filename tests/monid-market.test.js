import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  foldMarketRows, marketFallback, matchRetailer, normaliseMarketRows,
} from '../src/server/monid-market.js';
import { scrapePrices } from '../src/server/price-scraper.js';
import { clearRobotsCache } from '../src/server/robots.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const SHELL = '<html><body><div id="root"></div><p>Loading products…</p></body></html>';

const PRODUCTS = [
  {
    product_title: 'Tesco British Semi Skimmed Milk 1.13L', price: '£1.20',
    store_name: 'Tesco', product_page_url: 'https://www.tesco.com/products/1',
  },
  {
    product_title: 'ASDA British Semi Skimmed Milk 2L', price: '£1.75',
    store_name: 'Asda Groceries', product_page_url: 'https://groceries.asda.com/p/2',
  },
  {
    product_title: "Sainsbury's British Semi Skimmed Milk 1L", price: '£0.85',
    store_name: 'sainsburys.co.uk', product_page_url: 'https://www.sainsburys.co.uk/p/3',
    on_sale: true,
  },
  {
    product_title: 'Milk Frother', price: '£9.99',
    store_name: 'Budgens', product_page_url: 'https://budgens.example/p/4',
  },
];

const marketFetch = () => vi.fn(async (url, init = {}) => (init.method === 'POST'
  ? json({ runId: 'mkt1' })
  : json({ status: 'COMPLETED', output: PRODUCTS })));

beforeEach(() => {
  clearRobotsCache();
  vi.unstubAllEnvs();
});

describe('reading Google Shopping rows', () => {
  it('normalises the fields the endpoint actually returns', () => {
    const rows = normaliseMarketRows(PRODUCTS);
    expect(rows[0]).toMatchObject({
      name: 'Tesco British Semi Skimmed Milk 1.13L',
      price: 1.2,
      store: 'Tesco',
      url: 'https://www.tesco.com/products/1',
      confidence: 'medium',
    });
    expect(rows[2]).toMatchObject({ store: 'sainsburys.co.uk', offer: 'On sale' });
  });

  it('keeps its footing when the envelope or a row is not what it hoped', () => {
    expect(normaliseMarketRows({ items: PRODUCTS })).toHaveLength(4);
    expect(normaliseMarketRows([{ product_title: 'No price' }, { price: '£1' }, null]))
      .toEqual([]);
  });
});

describe('matching a listing to a shop the app knows', () => {
  it('sees through the store-name dress', () => {
    const retailers = [{ id: 'asda', name: 'Asda' }, { id: 'sainsburys', name: "Sainsbury's" }];
    expect(matchRetailer('Asda Groceries', retailers)?.id).toBe('asda');
    expect(matchRetailer('sainsburys.co.uk', retailers)?.id).toBe('sainsburys');
  });

  it('leaves an unknown store unmatched rather than guessing', () => {
    expect(matchRetailer('Budgens', [{ id: 'asda', name: 'Asda' }])).toBeNull();
    expect(matchRetailer('', [{ id: 'asda', name: 'Asda' }])).toBeNull();
  });
});

describe('folding market rows into shop results', () => {
  const results = () => ([
    { retailerId: 'tesco', retailer: 'Tesco', rows: [], status: 'no-match' },
    { retailerId: 'asda', retailer: 'Asda', rows: [{ name: 'Asda own answer', price: 2 }], status: 'ok' },
  ]);

  it('fills only a shop that came back empty, and only with the product asked for', () => {
    const scoped = results();
    const group = foldMarketRows(normaliseMarketRows(PRODUCTS), scoped, { query: 'semi skimmed milk' });
    const tesco = scoped.find((result) => result.retailerId === 'tesco');
    const asda = scoped.find((result) => result.retailerId === 'asda');
    expect(tesco.rows.map((row) => row.price)).toEqual([1.2]);
    expect(asda.rows).toHaveLength(1); // its own answer stands
    // Asda already answered for itself, so its listing belongs to the market
    // group, not a second row in a shop that spoke — and so does Sainsbury's,
    // which is not a shop this fold was checking. The frother is not semi
    // skimmed milk, however loudly Google suggests it.
    expect(group?.rows.map((row) => row.price)).toEqual([1.75, 0.85]);
  });

  it('lands untracked stores in an Other shops group instead of dropping them', () => {
    const rows = normaliseMarketRows([PRODUCTS[3]]).concat(normaliseMarketRows([PRODUCTS[0]]));
    const group = foldMarketRows(rows, results(), { query: 'semi skimmed milk' });
    // Tesco was empty and matched, so nothing is left over for the group.
    expect(group).toBeNull();
  });

  it('never overwrites a shop that already answered', () => {
    const asdaOnly = normaliseMarketRows([PRODUCTS[1]]);
    const scoped = results().filter((r) => r.retailerId === 'asda');
    const group = foldMarketRows(asdaOnly, scoped, { query: 'semi skimmed milk' });
    expect(group?.retailerId).toBe('market');
    expect(scoped[0].rows).toHaveLength(1);
  });

  it('labels where a filled price actually came from', () => {
    const scoped = results().filter((r) => r.retailerId === 'tesco');
    foldMarketRows(normaliseMarketRows([PRODUCTS[0]]), scoped, { query: 'semi skimmed milk' });
    expect(scoped[0].rows[0]).toMatchObject({
      source: 'google-shopping',
      via: 'monid',
      confidence: 'medium',
      retailerId: 'tesco',
    });
    expect(scoped[0].status).toBe('ok');
  });
});

describe('the market fallback itself', () => {
  it('does not run without a key, switched off, or when a shop already answered', async () => {
    const fetchImpl = vi.fn();
    await expect(marketFallback('milk', [{ retailerId: 'tesco', rows: [] }], { fetchImpl }))
      .resolves.toEqual({ used: false, group: null });
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('PRICE_SCRAPER_MARKET', 'off');
    await expect(marketFallback('milk', [{ retailerId: 'tesco', rows: [] }], { fetchImpl }))
      .resolves.toEqual({ used: false, group: null });
    vi.stubEnv('PRICE_SCRAPER_MARKET', 'auto');
    await expect(
      marketFallback('milk', [{ retailerId: 'tesco', rows: [{ name: 'milk', price: 1 }] }], { fetchImpl }),
    ).resolves.toEqual({ used: false, group: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks the market once and fills the silent shops', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    const fetchImpl = marketFetch();
    const results = [{ retailerId: 'tesco', retailer: 'Tesco', rows: [], status: 'no-match' }];
    const { used, group } = await marketFallback('semi skimmed milk', results, { fetchImpl });
    expect(used).toBe(true);
    // Only Tesco was being checked, so Sainsbury's listing has no shop to
    // fill — it surfaces in the Other shops group instead of vanishing.
    expect(group?.retailerId).toBe('market');
    expect(group?.rows.map((row) => row.price)).toEqual([1.75, 0.85]);
    expect(results[0].rows[0]).toMatchObject({ retailerId: 'tesco', price: 1.2 });
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'POST'
      && String(init.body).includes('google-shopping-scraper'))).toBe(true);
  });

  it('treats a failed market run as an empty answer, not an error', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    const fetchImpl = vi.fn(async (url, init = {}) => (init.method === 'POST'
      ? json({ runId: 'mkt2' })
      : json({ status: 'FAILED', error: 'no results' })));
    await expect(marketFallback('milk', [{ retailerId: 'tesco', rows: [] }], { fetchImpl }))
      .resolves.toEqual({ used: false, group: null });
  });
});

describe('scrapePrices with the market behind it', () => {
  it('turns a market-wide silence into priced rows', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      if (init.method === 'POST') return json({ runId: 'mkt3' });
      if (target.includes('api.monid.ai')) return json({ status: 'COMPLETED', output: PRODUCTS });
      return new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html' } });
    });
    const out = await scrapePrices('semi skimmed milk', {
      retailerIds: ['tesco', 'sainsburys'],
      fetchImpl,
      allowModel: false,
      strategies: ['direct'],
    });
    expect(out.marketUsed).toBe(true);
    const tesco = out.results.find((result) => result.retailerId === 'tesco');
    const sainsburys = out.results.find((result) => result.retailerId === 'sainsburys');
    expect(tesco.rows[0]).toMatchObject({ price: 1.2, source: 'google-shopping' });
    expect(sainsburys.rows[0]).toMatchObject({ price: 0.85, store: 'sainsburys.co.uk' });
    expect(out.cheapest[0]).toMatchObject({ price: 0.85 });
    expect(out.shopsChecked).toBe(2);
  });
});
