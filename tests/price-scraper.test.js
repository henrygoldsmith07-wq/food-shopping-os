import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  condenseHtml, decodeEntities, extractJsonLd, mergeCandidates, parseMoney,
  parsePackSize, parseUnitPrice, priceRelevantText, productsFromJsonLd,
  productsFromMicrodata, productsFromText, relevanceScore,
} from '../src/server/scrape-parse.js';
import {
  clearRobotsCache, groupFor, isScrapeAllowed, parseRobots, pathAllowed,
} from '../src/server/robots.js';
import {
  cheapestAcross, extractWithModel, parseModelJson, scrapePrices, scrapeRetailer,
  scrapeableRetailers, verifyAgainstPage,
} from '../src/server/price-scraper.js';

const html = (body, head = '') => `<html><head>${head}</head><body>${body}</body></html>`;

const jsonLd = (payload) =>
  `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;

const res = (body, { status = 200, type = 'text/html' } = {}) =>
  new Response(body, { status, headers: { 'content-type': type } });

const allowAllRobots = 'User-agent: *\nAllow: /\n';

/** A fetch that serves robots.txt then one page for every retailer. */
const stubFetch = (page, { robots = allowAllRobots, pageStatus = 200 } = {}) =>
  vi.fn(async (url) => {
    if (String(url).endsWith('/robots.txt')) return res(robots, { type: 'text/plain' });
    return res(page, { status: pageStatus });
  });

beforeEach(() => {
  clearRobotsCache();
  vi.unstubAllEnvs();
});

describe('reading money off a page', () => {
  it('understands the shapes a UK shelf edge actually uses', () => {
    expect(parseMoney('£2.50')).toBe(2.5);
    expect(parseMoney('85p')).toBe(0.85);
    expect(parseMoney('1,299.99')).toBe(1299.99);
    expect(parseMoney(3.4)).toBe(3.4);
    expect(parseMoney('out of stock')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });

  it('refuses a number too large to be a grocery price', () => {
    expect(parseMoney('99999999')).toBeNull();
  });

  it('reads unit prices without confusing them for the pack price', () => {
    expect(parseUnitPrice('£1.50/kg')).toEqual({ value: 1.5, unit: 'kg' });
    expect(parseUnitPrice('35p per 100g')).toEqual({ value: 0.35, unit: '100g' });
    expect(parseUnitPrice('£2.00')).toBeNull();
  });

  it('picks the pack size out of a product name', () => {
    expect(parsePackSize('Tesco Semi Skimmed Milk 2.27L')).toBe('2.27l');
    expect(parsePackSize('Coke Zero 6 x 330ml')).toBe('6x330ml');
    expect(parsePackSize('Bananas Loose')).toBeNull();
  });

  it('decodes the entities retailer markup is full of', () => {
    expect(decodeEntities('Ben &amp; Jerry&#39;s &pound;4.50')).toBe("Ben & Jerry's £4.50");
  });
});

describe('structured extraction — the shop stating its own price', () => {
  const page = html('', jsonLd({
    '@type': 'ItemList',
    itemListElement: [
      { '@type': 'Product', name: 'Semi Skimmed Milk 2.27L', offers: { '@type': 'Offer', price: '1.45', priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: 'https://shop.test/p/1' } },
      { '@type': 'Product', name: 'Whole Milk 4 Pint', offers: { price: '2.15', priceCurrency: 'GBP', availability: 'https://schema.org/OutOfStock' } },
    ],
  }));

  it('finds products nested inside an ItemList, not only at the top level', () => {
    const rows = productsFromJsonLd(page);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Semi Skimmed Milk 2.27L', price: 1.45, currency: 'GBP', method: 'json-ld', confidence: 'high', inStock: true });
    expect(rows[1].inStock).toBe(false);
  });

  it('survives a retailer shipping malformed JSON-LD', () => {
    const broken = html('', '<script type="application/ld+json">{ not json </script>');
    expect(extractJsonLd(broken)).toEqual([]);
    expect(productsFromJsonLd(broken)).toEqual([]);
  });

  it('ignores a Product with no price rather than inventing one', () => {
    const noPrice = html('', jsonLd({ '@type': 'Product', name: 'Milk' }));
    expect(productsFromJsonLd(noPrice)).toEqual([]);
  });

  it('reads the low price off an AggregateOffer rather than skipping the product', () => {
    // Big retailers list a product once and price it as a range across pack
    // sizes. Reading nothing there loses the shops that publish the most.
    const aggregate = html('', jsonLd({
      '@type': 'Product',
      name: 'Heinz Baked Beans 415g',
      offers: {
        '@type': 'AggregateOffer', lowPrice: '1.40', highPrice: '1.75', priceCurrency: 'GBP',
      },
    }));
    expect(productsFromJsonLd(aggregate)).toMatchObject([
      { name: 'Heinz Baked Beans 415g', price: 1.4, currency: 'GBP', method: 'json-ld' },
    ]);
  });

  it('unwraps a ListItem around a product, which is how a search page lists them', () => {
    const listed = html('', jsonLd({
      '@type': 'ItemList',
      itemListElement: [{
        '@type': 'ListItem',
        position: 1,
        item: { '@type': 'Product', name: 'Hovis Soft White 800g', offers: { price: '1.35', priceCurrency: 'GBP' } },
      }],
    }));
    expect(productsFromJsonLd(listed)).toMatchObject([{ name: 'Hovis Soft White 800g', price: 1.35 }]);
  });

  it('reads itemprop microdata as a second-best source', () => {
    const page2 = html('<div><span itemprop="name">Organic Milk 1L</span><meta itemprop="price" content="1.85"></div>');
    expect(productsFromMicrodata(page2)).toMatchObject([
      { name: 'Organic Milk 1L', price: 1.85, method: 'microdata', confidence: 'medium' },
    ]);
  });

  it('reads a microdata price written as text, not only as a content attribute', () => {
    const inline = html('<li itemscope><span itemprop="name">Cathedral City 350g</span><span itemprop="price">£3.50</span></li>');
    expect(productsFromMicrodata(inline)).toMatchObject([{ name: 'Cathedral City 350g', price: 3.5 }]);
  });

  it('reads a data-price attribute, the shape a shop uses when it ships no schema', () => {
    const dataAttr = html('<div data-price="2.25"><span itemprop="name">Lurpak 250g</span></div>');
    expect(productsFromMicrodata(dataAttr)).toMatchObject([{ name: 'Lurpak 250g', price: 2.25 }]);
  });
});

describe('text extraction — a guess, labelled as one', () => {
  it('takes the name from the line above when the price line has no words', () => {
    const rows = productsFromText('Whole Milk 4 Pint\n£2.15 — £0.94/litre', { query: 'milk' });
    expect(rows).toMatchObject([{ name: 'Whole Milk 4 Pint', price: 2.15, confidence: 'low', method: 'text' }]);
    expect(rows[0].unitPrice).toEqual({ value: 0.94, unit: 'l' });
  });

  it('drops prices that have nothing to do with what was searched for', () => {
    const rows = productsFromText('Chocolate Digestives\n£1.10\nSemi Skimmed Milk\n£1.45', { query: 'milk' });
    expect(rows.map((row) => row.name)).toEqual(['Semi Skimmed Milk']);
  });

  it('strips scripts and styles before anything is read or sent', () => {
    const noisy = html('<style>.a{color:red}</style><script>var price="£99.99"</script><p>Milk £1.45</p>');
    const text = condenseHtml(noisy);
    expect(text).not.toContain('99.99');
    expect(text).toContain('Milk £1.45');
  });

  it('keeps only price-bearing lines and their labels for the model prompt', () => {
    const text = 'Cookie banner\nAccept all\nSemi Skimmed Milk\n£1.45\nFooter links';
    const trimmed = priceRelevantText(text);
    expect(trimmed).toContain('Semi Skimmed Milk');
    expect(trimmed).toContain('£1.45');
    expect(trimmed).not.toContain('Cookie banner');
  });

  it('keeps a price whose currency sits in a sibling element', () => {
    const trimmed = priceRelevantText('Semi Skimmed Milk\nGBP 1.45\nAbout us');
    expect(trimmed).toContain('GBP 1.45');
    expect(trimmed).toContain('Semi Skimmed Milk');
    expect(trimmed).not.toContain('About us');
  });

  it('reads a currency code, not only a symbol', () => {
    // Plenty of pages render the symbol in its own element, so the flattened
    // text reads "GBP 1.45". This used to need the model; it no longer does.
    expect(productsFromText('Semi Skimmed Milk\nGBP 1.45', { query: 'milk' }))
      .toMatchObject([{ price: 1.45, currency: 'GBP', method: 'text' }]);
    expect(productsFromText('Semi Skimmed Milk\n1.45 GBP', { query: 'milk' }))
      .toMatchObject([{ price: 1.45 }]);
  });

  it('still refuses a bare number with no currency marker at all', () => {
    // "1.45" alone could be a weight, a rating or a page number. Guessing it
    // is a price is exactly the kind of confident wrong answer to avoid.
    expect(productsFromText('Semi Skimmed Milk\nUnit size 1.45', { query: 'milk' })).toEqual([]);
  });
});

describe('merging the passes', () => {
  it('prefers the shop’s own data over a guess for the same product', () => {
    const merged = mergeCandidates([
      [{ name: 'Milk 2L', price: 1.99, confidence: 'low', method: 'text' }],
      [{ name: 'Milk 2L', price: 1.45, confidence: 'high', method: 'json-ld' }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ price: 1.45, confidence: 'high' });
  });

  it('keeps the cheaper reading when confidence ties, and sorts cheapest first', () => {
    const merged = mergeCandidates([[
      { name: 'Milk', price: 2.2, confidence: 'high' },
      { name: 'Milk', price: 1.4, confidence: 'high' },
      { name: 'Bread', price: 0.9, confidence: 'high' },
    ]]);
    expect(merged.map((row) => row.price)).toEqual([0.9, 1.4]);
  });

  it('scores relevance so a suggestions rail does not become the answer', () => {
    expect(relevanceScore('Semi Skimmed Milk', 'semi milk')).toBe(1);
    expect(relevanceScore('Chocolate Digestives', 'semi milk')).toBe(0);
  });
});

describe('robots.txt is honoured, not assumed', () => {
  it('applies longest-match precedence with Allow winning a tie', () => {
    const groups = parseRobots('User-agent: *\nDisallow: /search\nAllow: /search/public\nCrawl-delay: 2');
    const group = groupFor(groups, 'ForqBot');
    expect(pathAllowed(group, '/search?q=milk')).toBe(false);
    expect(pathAllowed(group, '/search/public')).toBe(true);
    expect(group.crawlDelay).toBe(2);
  });

  it('gives a named agent its own rules rather than the wildcard block', () => {
    const groups = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: ForqBot\nDisallow: /private');
    expect(pathAllowed(groupFor(groups, 'ForqBot/1.0'), '/search')).toBe(true);
    expect(pathAllowed(groupFor(groups, 'ForqBot/1.0'), '/private/x')).toBe(false);
    expect(pathAllowed(groupFor(groups, 'OtherBot'), '/search')).toBe(false);
  });

  it('reads an empty Disallow as permission, per the spec', () => {
    expect(pathAllowed(groupFor(parseRobots('User-agent: *\nDisallow:'), 'x'), '/anything')).toBe(true);
  });

  it('treats a missing robots.txt as permission and an unreachable one as refusal', async () => {
    const missing = vi.fn(async () => res('nope', { status: 404, type: 'text/plain' }));
    await expect(isScrapeAllowed('https://a.test/search', { fetchImpl: missing }))
      .resolves.toMatchObject({ allowed: true, reason: 'no-robots-file' });
    clearRobotsCache();
    const down = vi.fn(async () => { throw new Error('network'); });
    await expect(isScrapeAllowed('https://b.test/search', { fetchImpl: down }))
      .resolves.toMatchObject({ allowed: false, reason: 'robots-unreachable' });
  });

  it('refuses a non-http scheme outright', async () => {
    await expect(isScrapeAllowed('file:///etc/passwd', { fetchImpl: vi.fn() }))
      .resolves.toMatchObject({ allowed: false, reason: 'unsupported-protocol' });
  });
});

describe('scraping one retailer', () => {
  const retailer = { id: 'test', name: 'Test Shop', search: (query) => `https://shop.test/search?q=${encodeURIComponent(query)}` };
  const milkPage = html('', jsonLd({ '@type': 'Product', name: 'Semi Skimmed Milk 2.27L', offers: { price: '1.45', priceCurrency: 'GBP' } }));

  it('reports a price with the page it was read from', async () => {
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl: stubFetch(milkPage), allowModel: false });
    expect(out.status).toBe('ok');
    expect(out.rows[0]).toMatchObject({
      price: 1.45, retailer: 'Test Shop', method: 'json-ld', source: 'scraped', url: 'https://shop.test/search?q=milk',
    });
  });

  it('declines rather than fetches when robots.txt says no', async () => {
    const fetchImpl = stubFetch(milkPage, { robots: 'User-agent: *\nDisallow: /search' });
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl, allowModel: false });
    expect(out.status).toBe('declined');
    expect(out.rows).toEqual([]);
    // The page itself was never requested.
    expect(fetchImpl.mock.calls.every(([url]) => String(url).endsWith('/robots.txt'))).toBe(true);
  });

  it.each([
    [403, 'blocked'],
    [429, 'rate-limited'],
    [500, 'unreachable'],
  ])('turns HTTP %i into the status "%s" instead of throwing', async (status, expected) => {
    const out = await scrapeRetailer(retailer, 'milk', {
      fetchImpl: stubFetch('nope', { pageStatus: status }), allowModel: false,
    });
    expect(out.status).toBe(expected);
    expect(out.note).toBeTruthy();
    expect(out.rows).toEqual([]);
  });

  it('says no-match rather than returning an unrelated product', async () => {
    const biscuits = html('', jsonLd({ '@type': 'Product', name: 'Chocolate Digestives', offers: { price: '1.10', priceCurrency: 'GBP' } }));
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl: stubFetch(biscuits), allowModel: false });
    expect(out.status).toBe('no-match');
    expect(out.rows).toEqual([]);
  });
});

describe('the model is a fallback, and its answers are checked', () => {
  const retailer = { id: 'test', name: 'Test Shop', search: () => 'https://shop.test/search?q=milk' };
  // No JSON-LD, no microdata, and no currency marker anywhere: a bare number
  // in a table cell. The deterministic passes correctly refuse it, which is
  // the only situation the model is asked about.
  const opaquePage = html('<table><tr><td>Semi Skimmed Milk 2.27L</td></tr><tr><td>Unit size</td><td>1.45</td></tr></table>');

  const modelFetch = (content) => vi.fn(async (url, init) => {
    const target = String(url);
    if (target.endsWith('/robots.txt')) return res(allowAllRobots, { type: 'text/plain' });
    if (target.includes('/models')) {
      return res(JSON.stringify({ data: [{ id: 'nvidia/nemotron-3-ultra-550b' }, { id: 'deepseek-ai/deepseek-v4-pro' }] }), { type: 'application/json' });
    }
    if (target.includes('/chat/completions')) {
      void init;
      return res(JSON.stringify({ choices: [{ message: { content } }] }), { type: 'application/json' });
    }
    return res(opaquePage);
  });

  it('pulls JSON out of a fenced or chatty reply', () => {
    expect(parseModelJson('```json\n{"products":[{"name":"Milk","price":1.45}]}\n```'))
      .toEqual({ products: [{ name: 'Milk', price: 1.45 }] });
    expect(parseModelJson('Sure! {"products":[]} hope that helps'))
      .toEqual({ products: [] });
    expect(parseModelJson('no json here')).toBeNull();
  });

  it('drops a model price that does not appear on the page', () => {
    const rows = [{ name: 'Milk', price: 1.45 }, { name: 'Milk', price: 9.99 }];
    expect(verifyAgainstPage(rows, 'Semi Skimmed Milk £1.45 per bottle')).toEqual([{ name: 'Milk', price: 1.45 }]);
  });

  it('does not match a price inside a longer number', () => {
    expect(verifyAgainstPage([{ name: 'Milk', price: 1.45 }], 'order 11.4567 items')).toEqual([]);
  });

  it('asks the model only when both deterministic passes came back empty', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'test-key');
    const fetchImpl = modelFetch('{"products":[{"name":"Semi Skimmed Milk 2.27L","price":1.45}]}');
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl });
    expect(out.status).toBe('ok');
    expect(out.rows[0]).toMatchObject({ price: 1.45, method: 'ai-extracted', confidence: 'low' });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/chat/completions'))).toBe(true);
  });

  it('never calls the model when the page already stated its prices', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'test-key');
    const structured = html('', jsonLd({ '@type': 'Product', name: 'Semi Skimmed Milk', offers: { price: '1.45', priceCurrency: 'GBP' } }));
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith('/robots.txt')) return res(allowAllRobots, { type: 'text/plain' });
      if (String(url).includes('/chat/completions')) throw new Error('the model should not have been asked');
      if (String(url).includes('/models')) return res(JSON.stringify({ data: [] }), { type: 'application/json' });
      return res(structured);
    });
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl });
    expect(out.rows[0].method).toBe('json-ld');
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/chat/completions'))).toBe(false);
  });

  it('keeps the deterministic answer when every model in the ladder refuses', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'test-key');
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith('/robots.txt')) return res(allowAllRobots, { type: 'text/plain' });
      if (String(url).includes('/models')) return res(JSON.stringify({ data: [{ id: 'nvidia/nemotron-3-ultra' }] }), { type: 'application/json' });
      if (String(url).includes('/chat/completions')) return res('rate limited', { status: 429, type: 'text/plain' });
      return res(opaquePage);
    });
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl });
    expect(out.status).toBe('no-match');
    expect(out.rows).toEqual([]);
  });

  it('says nothing rather than guessing when no AI key is configured', async () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(extractWithModel('Milk £1.45', 'milk', { fetchImpl: vi.fn() }))
      .resolves.toEqual({ rows: [], model: null });
  });
});

describe('checking a product across shops', () => {
  const page = html('', jsonLd({ '@type': 'Product', name: 'Semi Skimmed Milk 2.27L', offers: { price: '1.45', priceCurrency: 'GBP' } }));

  it('reports every shop it asked, answered or not', async () => {
    const out = await scrapePrices('milk', {
      retailerIds: ['tesco', 'asda'], fetchImpl: stubFetch(page), allowModel: false, gapMs: 0,
    });
    expect(out.shopsChecked).toBe(2);
    expect(out.shopsAnswered).toBe(2);
    expect(out.results.map((row) => row.retailer)).toEqual(['Tesco', 'Asda']);
    expect(out.best.price).toBe(1.45);
  });

  it('sorts across shops so the cheapest is genuinely the cheapest', () => {
    const results = [
      { rows: [{ price: 2.1, retailerId: 'a' }] },
      { rows: [{ price: 1.4, retailerId: 'b' }, { price: 3, retailerId: 'b' }] },
    ];
    expect(cheapestAcross(results).map((row) => row.price)).toEqual([1.4, 2.1, 3]);
  });

  it('stays silent when the feature is switched off', async () => {
    vi.stubEnv('PRICE_SCRAPER_ENABLED', 'false');
    const fetchImpl = vi.fn();
    const out = await scrapePrices('milk', { fetchImpl, gapMs: 0 });
    expect(out.status).toBe('disabled');
    expect(out.results).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honours an allowlist of retailers from the environment', () => {
    vi.stubEnv('PRICE_SCRAPER_RETAILERS', 'tesco,aldi');
    expect(scrapeableRetailers().map((row) => row.id)).toEqual(['tesco', 'aldi']);
  });

  it('a shop that fails does not take the other shops down with it', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) return res(allowAllRobots, { type: 'text/plain' });
      if (target.includes('tesco')) throw new Error('connection reset');
      return res(page);
    });
    const out = await scrapePrices('milk', {
      retailerIds: ['tesco', 'asda'], fetchImpl, allowModel: false, gapMs: 0,
    });
    expect(out.results[0]).toMatchObject({ retailer: 'Tesco', status: 'unreachable' });
    expect(out.results[1]).toMatchObject({ retailer: 'Asda', status: 'ok' });
    expect(out.best.retailer).toBe('Asda');
  });

  it('returns on the budget even with shops still in flight', async () => {
    vi.stubEnv('PRICE_SCRAPER_MARKET', 'off');
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) return res(allowAllRobots, { type: 'text/plain' });
      // Far longer than the budget: the check must come back on time with the
      // shop reported honestly, not wait for the straggler.
      await new Promise((resolve) => { setTimeout(resolve, 5000); });
      return res(page);
    });
    const started = Date.now();
    const out = await scrapePrices('milk', {
      retailerIds: ['tesco', 'asda'], fetchImpl, allowModel: false, gapMs: 0,
      budgetMs: 150,
    });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(out.shopsChecked).toBe(2);
    expect(out.results.every((result) => result.status === 'no-match')).toBe(true);
  });

  it('a budget also stops the query ladder inside a shop', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) return res(allowAllRobots, { type: 'text/plain' });
      await new Promise((resolve) => { setTimeout(resolve, 120); });
      return res(page);
    });
    const out = await scrapeRetailer({
      id: 'tesco', name: 'Tesco',
      search: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`,
    }, 'milk', { fetchImpl, allowModel: false, deadline: Date.now() + 60 });
    // Rung one ran; the budget spent itself during it, so the broader rungs
    // were never asked.
    expect(out.query).toBe('milk');
    const pageFetches = fetchImpl.mock.calls
      .filter(([url]) => !String(url).endsWith('/robots.txt'));
    expect(pageFetches).toHaveLength(1);
  });
});
