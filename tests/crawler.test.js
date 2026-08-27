import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  availableStrategies, crawlPage, directFetch, firecrawlConfigured, firecrawlFetch,
  jinaFetch, runStrategy,
} from '../src/server/crawler.js';
import { clearRobotsCache } from '../src/server/robots.js';
import { deterministicPass, scrapeRetailer } from '../src/server/price-scraper.js';

const res = (body, { status = 200, type = 'text/html' } = {}) =>
  new Response(body, { status, headers: { 'content-type': type } });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A search page that renders its products in the browser: HTTP 200, real
// markup, and not a single price anywhere in it. This is the case the whole
// escalation ladder exists for.
const SHELL = '<html><body><div id="root"></div><p>Loading products…</p></body></html>';
const PRICED = '<html><body><script type="application/ld+json">'
  + '{"@type":"Product","name":"Semi Skimmed Milk 2.27L","offers":{"price":"1.45","priceCurrency":"GBP"}}'
  + '</script></body></html>';

beforeEach(() => {
  clearRobotsCache();
  vi.unstubAllEnvs();
});

describe('which strategies are available', () => {
  it('is direct-only until a renderer is configured', () => {
    vi.stubEnv('JINA_READER_ENABLED', 'false');
    expect(availableStrategies()).toEqual(['direct']);
    expect(firecrawlConfigured()).toBe(false);
  });

  it('includes the keyless renderer by default, so it works with no signup', () => {
    expect(availableStrategies()).toEqual(['direct', 'jina']);
  });

  it('puts Firecrawl in the ladder once its key exists', () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    expect(availableStrategies()).toEqual(['direct', 'firecrawl', 'jina']);
  });

  it('honours an explicit strategy order from the environment', () => {
    vi.stubEnv('PRICE_SCRAPER_STRATEGIES', 'jina,direct');
    expect(availableStrategies()).toEqual(['jina', 'direct']);
  });

  it('refuses a strategy name it does not implement', async () => {
    await expect(runStrategy('selenium', 'https://a.test', { fetchImpl: vi.fn() }))
      .rejects.toThrow(/No fetch strategy/);
  });
});

describe('the individual fetch strategies', () => {
  it('direct returns the raw document', async () => {
    const fetchImpl = vi.fn(async () => res(PRICED));
    await expect(directFetch('https://a.test/s', { fetchImpl }))
      .resolves.toMatchObject({ via: 'direct', markdown: null });
  });

  it('direct rejects a non-document response rather than parsing a PDF', async () => {
    const fetchImpl = vi.fn(async () => res('%PDF-1.4', { type: 'application/pdf' }));
    await expect(directFetch('https://a.test/s', { fetchImpl })).rejects.toMatchObject({ code: 'not-html' });
  });

  it('firecrawl asks for rawHtml so structured parsing still applies', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    let sent = null;
    const fetchImpl = vi.fn(async (url, init) => {
      sent = { url: String(url), body: JSON.parse(init.body), auth: init.headers.authorization };
      return json({ success: true, data: { rawHtml: PRICED, markdown: '# Milk' } });
    });
    const page = await firecrawlFetch('https://a.test/s', { fetchImpl });
    expect(sent.url).toContain('/scrape');
    expect(sent.auth).toBe('Bearer fc-test');
    expect(sent.body.formats).toContain('rawHtml');
    expect(sent.body.url).toBe('https://a.test/s');
    expect(page).toMatchObject({ via: 'firecrawl', html: PRICED, markdown: '# Milk' });
  });

  it('firecrawl tolerates the field names moving between versions', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    // No `data` envelope, `html` instead of `rawHtml` — an older shape.
    const fetchImpl = vi.fn(async () => json({ success: true, html: PRICED }));
    await expect(firecrawlFetch('https://a.test/s', { fetchImpl }))
      .resolves.toMatchObject({ via: 'firecrawl', html: PRICED });
  });

  it('firecrawl surfaces a failed render rather than returning an empty page', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    const fetchImpl = vi.fn(async () => json({ success: false, error: 'render timed out' }));
    await expect(firecrawlFetch('https://a.test/s', { fetchImpl }))
      .rejects.toMatchObject({ code: 'render-failed' });
  });

  it('firecrawl refuses to run without a key instead of calling unauthenticated', async () => {
    const fetchImpl = vi.fn();
    await expect(firecrawlFetch('https://a.test/s', { fetchImpl }))
      .rejects.toMatchObject({ code: 'not-configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('jina reads keylessly and returns markdown, not html', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://r.jina.ai/https://a.test/s');
      expect(init.headers.authorization).toBeUndefined();
      return res('Semi Skimmed Milk\n£1.45', { type: 'text/plain' });
    });
    await expect(jinaFetch('https://a.test/s', { fetchImpl }))
      .resolves.toMatchObject({ via: 'jina', html: null });
  });

  it('jina sends a key when one is configured, for the higher rate limit', async () => {
    vi.stubEnv('JINA_API_KEY', 'jina-test');
    const fetchImpl = vi.fn(async (url, init) => {
      expect(init.headers.authorization).toBe('Bearer jina-test');
      return res('Milk £1.45', { type: 'text/plain' });
    });
    await jinaFetch('https://a.test/s', { fetchImpl });
  });
});

describe('escalation — the point of the ladder', () => {
  it('stops at the first strategy that yields prices, without paying for a render', async () => {
    const fetchImpl = vi.fn(async () => res(PRICED));
    const out = await crawlPage('https://a.test/s', {
      fetchImpl,
      strategies: ['direct', 'firecrawl'],
      accept: (page) => Boolean(page.html),
    });
    expect(out.via).toBe('direct');
    expect(out.attempts).toEqual([{ strategy: 'direct', ok: true, accepted: true }]);
  });

  it('escalates past a 200 OK page that contained no prices', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    const fetchImpl = vi.fn(async (url) => (String(url).includes('firecrawl')
      ? json({ success: true, data: { rawHtml: PRICED } })
      : res(SHELL)));
    const seen = [];
    const out = await crawlPage('https://a.test/s', {
      fetchImpl,
      strategies: ['direct', 'firecrawl'],
      accept: (page) => deterministicPass(page, 'milk').rows.length > 0,
      onAttempt: (attempt) => seen.push(attempt),
    });
    expect(out.via).toBe('firecrawl');
    expect(seen).toEqual([
      { strategy: 'direct', ok: true, accepted: false },
      { strategy: 'firecrawl', ok: true, accepted: true },
    ]);
  });

  it('keeps going when a shop blocks the direct fetch outright', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).includes('r.jina.ai')
      ? res('Semi Skimmed Milk 2.27L\n£1.45', { type: 'text/plain' })
      : res('go away', { status: 403 })));
    const out = await crawlPage('https://a.test/s', {
      fetchImpl,
      strategies: ['direct', 'jina'],
      accept: (page) => deterministicPass(page, 'milk').rows.length > 0,
    });
    expect(out.via).toBe('jina');
    expect(out.attempts[0]).toMatchObject({ strategy: 'direct', ok: false, code: 'blocked' });
  });

  it('reports honest failure when every strategy comes back empty', async () => {
    const fetchImpl = vi.fn(async () => res(SHELL));
    const out = await crawlPage('https://a.test/s', {
      fetchImpl,
      strategies: ['direct', 'jina'],
      accept: (page) => deterministicPass(page, 'milk').rows.length > 0,
    });
    expect(out.ok).toBe(false);
    expect(out.via).toBeNull();
    expect(out.attempts.every((attempt) => attempt.accepted === false)).toBe(true);
  });
});

describe('reading a rendered page', () => {
  it('runs all three passes on html but only the text pass on markdown', () => {
    expect(deterministicPass({ html: PRICED }, 'milk').rows[0])
      .toMatchObject({ method: 'json-ld', price: 1.45 });
    expect(deterministicPass({ html: null, markdown: 'Semi Skimmed Milk\n£1.45' }, 'milk').rows[0])
      .toMatchObject({ method: 'text', price: 1.45 });
  });
});

describe('the scraper end to end, over the ladder', () => {
  const retailer = {
    id: 'test',
    name: 'Test Shop',
    search: (query) => `https://shop.test/search?q=${encodeURIComponent(query)}`,
  };
  const robots = 'User-agent: *\nAllow: /\n';

  it('recovers a price the direct fetch could never have seen', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) return res(robots, { type: 'text/plain' });
      if (target.includes('firecrawl')) return json({ success: true, data: { rawHtml: PRICED } });
      return res(SHELL);
    });
    const out = await scrapeRetailer(retailer, 'milk', {
      fetchImpl, allowModel: false, strategies: ['direct', 'firecrawl'],
    });
    expect(out.status).toBe('ok');
    expect(out.via).toBe('firecrawl');
    expect(out.rows[0]).toMatchObject({ price: 1.45, method: 'json-ld' });
  });

  it('still says no-match when even the renderer finds nothing', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res(robots, { type: 'text/plain' })
      : res(SHELL)));
    const out = await scrapeRetailer(retailer, 'milk', {
      fetchImpl, allowModel: false, strategies: ['direct', 'jina'],
    });
    expect(out.status).toBe('no-match');
    expect(out.rows).toEqual([]);
    expect(out.attempts).toHaveLength(2);
  });

  it('never fetches at all when robots.txt declines, whatever the ladder', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res('User-agent: *\nDisallow: /search', { type: 'text/plain' })
      : res(PRICED)));
    const out = await scrapeRetailer(retailer, 'milk', {
      fetchImpl, allowModel: false, strategies: ['direct', 'firecrawl'],
    });
    expect(out.status).toBe('declined');
    // Crucially: a paid renderer is not a way around a shop that said no.
    expect(fetchImpl.mock.calls.every(([url]) => String(url).endsWith('/robots.txt'))).toBe(true);
  });
});
