/**
 * A market-wide fallback for the price scraper.
 *
 * Some shops will not show a headless renderer their prices, however patiently
 * it asks: several gate the grid behind a postcode, a couple refuse every
 * route, and one forbids the crawl outright in robots.txt. One Google
 * Shopping run answers for the whole market at once — the stores' own
 * listings, with product pages — so the shopping list still gets prices when
 * the shops themselves stay silent.
 *
 * The honesty rules do not change: a listing read from Google Shopping is not
 * a price read from the shop's own page, so rows carry their provenance and
 * lower confidence; a row only fills a shop that came back empty, never one
 * the scraper already answered; and everything still has to look like the
 * product the person actually asked for.
 */

import { monidRunOutput } from './crawler.js';
import { isMatch } from './search-terms.js';

const DEFAULT_PROVIDER = 'apify';
const DEFAULT_ENDPOINT = '/burbn/google-shopping-scraper';
const DEFAULT_INPUT = '{"searchQuery":"{{query}}","country":"gb","language":"en","maxResults":10}';

export const marketConfigured = () => Boolean(process.env.MONID_API_KEY);

/** 'auto' fills only a market that came back empty; 'on' always asks; 'off' never. */
export const marketMode = () => {
  const mode = String(process.env.PRICE_SCRAPER_MARKET || 'auto').trim().toLowerCase();
  return ['auto', 'on', 'off'].includes(mode) ? mode : 'auto';
};

const expand = (template, query) => JSON.parse(String(template).split('{{query}}').join(query));

const parsePrice = (value) => {
  const match = String(value ?? '').match(/(\d+(?:\.\d{1,2})?)/);
  const price = match && Number.parseFloat(match[1]);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
};

/** Google Shopping's field names, read defensively like every other versioned API. */
export const normaliseMarketRows = (output) => {
  const items = Array.isArray(output)
    ? output
    : Array.isArray(output?.items) ? output.items : [];
  return items.map((item) => {
    const name = String(item?.product_title || item?.title || '').trim();
    const price = parsePrice(item?.price ?? item?.priceValue);
    if (!name || price === null) return null;
    return {
      name: name.slice(0, 200),
      price,
      currency: 'GBP',
      url: String(item?.product_page_url || item?.url || '').trim() || null,
      store: String(item?.store_name || item?.store || '').trim() || null,
      offer: item?.on_sale ? 'On sale' : null,
      method: 'google-shopping',
      confidence: 'medium',
    };
  }).filter(Boolean);
};

/** Store names arrive in every shape ('Asda Groceries', 'sainsburys.co.uk'). */
const STORE_TOKENS = {
  tesco: ['tesco'],
  sainsburys: ['sainsburys'],
  asda: ['asda'],
  morrisons: ['morrisons'],
  iceland: ['iceland'],
  ocado: ['ocado'],
  waitrose: ['waitrose'],
  'amazon-fresh': ['amazon'],
};

export const matchRetailer = (storeName, retailers = []) => {
  const store = String(storeName || '').toLowerCase();
  if (!store) return null;
  return retailers.find((retailer) => {
    const aliases = STORE_TOKENS[retailer.id]
      || [retailer.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()];
    return aliases.some((alias) => alias && store.includes(alias));
  }) || null;
};

const marketRow = (row, retailer, checkedAt) => ({
  ...row,
  retailerId: retailer.id,
  retailer: retailer.name,
  isProductLink: Boolean(row.url),
  searchUrl: null,
  via: 'monid',
  source: 'google-shopping',
  sourceLabel: `Google Shopping${row.store ? ` (${row.store})` : ''} listing`,
  checkedAt,
});

/**
 * Attribute market rows to the shops they belong to.
 *
 * Only a shop whose own scrape came back empty is filled, and a store the app
 * does not track is not thrown away — it lands in an 'Other shops' group so
 * the cheapest list still sees it. Returns that group, if there was one;
 * matching results are filled in place.
 */
export const foldMarketRows = (rows, results, { query, checkedAt } = {}) => {
  const emptyIds = new Set(
    results.filter((result) => !(result.rows || []).length).map((result) => result.retailerId),
  );
  const otherShops = [];
  for (const row of rows) {
    if (!isMatch(row.name, query)) continue;
    const retailer = results.find(
      (result) => emptyIds.has(result.retailerId)
        && matchRetailer(row.store, [{ id: result.retailerId, name: result.retailer }]),
    );
    if (retailer) {
      retailer.rows = [...(retailer.rows || []),
        marketRow(row, { id: retailer.retailerId, name: retailer.retailer }, checkedAt)];
      retailer.status = 'ok';
      retailer.via = retailer.via || 'monid';
      retailer.note = 'Prices from the shop’s own Google Shopping listing — the shop’s page did not answer.';
    } else {
      otherShops.push(row);
    }
  }
  if (!otherShops.length) return null;
  return {
    retailerId: 'market',
    retailer: 'Other shops',
    query,
    wanted: query,
    rows: otherShops.map((row) => marketRow(row, { id: 'market', name: 'Other shops' }, checkedAt)),
    status: 'ok',
    note: 'Prices from other shops’ listings on Google Shopping.',
    via: 'monid',
    checkedAt,
  };
};

/**
 * Ask the market when the shops said nothing. Never throws: the market is a
 * bonus, and a failed or unaffordable run is reported the same way as an
 * empty one — the shops that answered already stand.
 */
export const marketFallback = async (query, results, { fetchImpl = fetch, signal } = {}) => {
  const mode = marketMode();
  if (mode === 'off' || !marketConfigured() || !String(query || '').trim() || signal?.aborted) {
    return { used: false, group: null };
  }
  const anyRows = (results || []).some((result) => (result.rows || []).length);
  if (mode === 'auto' && anyRows) return { used: false, group: null };
  try {
    const output = await monidRunOutput(
      process.env.MONID_MARKET_PROVIDER || DEFAULT_PROVIDER,
      process.env.MONID_MARKET_ENDPOINT || DEFAULT_ENDPOINT,
      expand(process.env.MONID_MARKET_INPUT_JSON || DEFAULT_INPUT, query),
      { fetchImpl, signal },
    );
    const rows = normaliseMarketRows(output);
    if (!rows.length) return { used: false, group: null };
    const group = foldMarketRows(rows, results || [], {
      query, checkedAt: new Date().toISOString(),
    });
    return { used: true, group };
  } catch {
    return { used: false, group: null };
  }
};
