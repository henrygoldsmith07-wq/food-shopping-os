import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  availableStrategies, crawlPage, directFetch, firecrawlConfigured, firecrawlFetch,
  jinaFetch, monidConfigured, monidFetch, runStrategy,
} from '../src/server/crawler.js';
import { clearRobotsCache, isScrapeAllowed } from '../src/server/robots.js';
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

  it('puts Monid at the front of the ladder once its key exists', () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    expect(availableStrategies()).toEqual(['monid', 'direct', 'jina']);
    expect(monidConfigured()).toBe(true);
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

describe('a robots.txt we are not allowed to read', () => {
  it('treats 403 as a refusal, not as an absent robots.txt', async () => {
    // The dangerous reading. "You may not have this file" is not "there is no
    // file", and turning a refusal into permission to crawl everything is the
    // one direction this check must never fail in.
    const fetchImpl = vi.fn(async () => res('go away', { status: 403, type: 'text/plain' }));
    await expect(isScrapeAllowed('https://a.test/search', { fetchImpl }))
      .resolves.toMatchObject({ allowed: false, reason: 'robots-forbidden' });
  });

  it('treats 401 the same way', async () => {
    const fetchImpl = vi.fn(async () => res('auth', { status: 401, type: 'text/plain' }));
    await expect(isScrapeAllowed('https://b.test/search', { fetchImpl }))
      .resolves.toMatchObject({ allowed: false, reason: 'robots-forbidden' });
  });

  it('still reads a plain 404 as no robots.txt, which permits crawling', async () => {
    const fetchImpl = vi.fn(async () => res('nope', { status: 404, type: 'text/plain' }));
    await expect(isScrapeAllowed('https://c.test/search', { fetchImpl }))
      .resolves.toMatchObject({ allowed: true, reason: 'no-robots-file' });
  });

  it('keeps refusing on the cached second call', async () => {
    // A refusal that only lasted until the cache warmed would be worse than
    // no check at all, because it would look like it was working.
    const fetchImpl = vi.fn(async () => res('go away', { status: 403, type: 'text/plain' }));
    await isScrapeAllowed('https://d.test/search', { fetchImpl });
    const second = await isScrapeAllowed('https://d.test/other', { fetchImpl });
    expect(second).toMatchObject({ allowed: false, cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never fetches the page when robots.txt forbade us', async () => {
    const retailer = { id: 't', name: 'T', search: () => 'https://e.test/search?q=milk' };
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res('go away', { status: 403, type: 'text/plain' })
      : res(PRICED)));
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl, allowModel: false });
    expect(out.status).toBe('declined');
    expect(fetchImpl.mock.calls.every(([url]) => String(url).endsWith('/robots.txt'))).toBe(true);
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

  it('monid starts a run and polls it to completion', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    let sent = null;
    const fetchImpl = vi.fn(async (url, init) => {
      if (init.method === 'POST') {
        sent = { url: String(url), body: JSON.parse(init.body), auth: init.headers.authorization };
        return json({ runId: 'r1' });
      }
      return json({ status: 'COMPLETED', output: { items: [{ html: PRICED }] } });
    });
    const page = await monidFetch('https://a.test/s', { fetchImpl });
    expect(sent.url).toBe('https://api.monid.ai/v1/run');
    expect(sent.auth).toBe('Bearer mk-test');
    expect(sent.body.provider).toBe('apify');
    expect(sent.body.input.body).toEqual({
      startUrls: [{ url: 'https://a.test/s' }], maxCrawlResults: 1,
    });
    expect(page).toMatchObject({ via: 'monid', html: PRICED, markdown: null });
  });

  it('monid reads the page wherever the endpoint parked it', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    // No `output` envelope, `id` instead of `runId`, markdown rather than html.
    const fetchImpl = vi.fn(async (url, init) => (init.method === 'POST'
      ? json({ id: 'r2' })
      : json({ status: 'SUCCEEDED', result: { markdown: '# Milk £1.45' } })));
    await expect(monidFetch('https://a.test/s', { fetchImpl }))
      .resolves.toMatchObject({ via: 'monid', html: null, markdown: '# Milk £1.45' });
  });

  it('monid surfaces a failed run rather than returning an empty page', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    const fetchImpl = vi.fn(async (url, init) => (init.method === 'POST'
      ? json({ runId: 'r3' })
      : json({ status: 'FAILED', error: 'endpoint timed out' })));
    await expect(monidFetch('https://a.test/s', { fetchImpl }))
      .rejects.toMatchObject({ code: 'render-failed' });
  });

  it('monid reports a broken input template as configuration, not as an answer', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_SCRAPE_INPUT_JSON', '{oops');
    const fetchImpl = vi.fn();
    await expect(monidFetch('https://a.test/s', { fetchImpl }))
      .rejects.toMatchObject({ code: 'bad-config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('monid refuses to run without a key instead of calling unauthenticated', async () => {
    const fetchImpl = vi.fn();
    await expect(monidFetch('https://a.test/s', { fetchImpl }))
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

  it('escalates through monid when direct returned only a shell', async () => {
    vi.stubEnv('MONID_API_KEY', 'mk-test');
    vi.stubEnv('MONID_POLL_MS', '0');
    const fetchImpl = vi.fn(async (url, init) => {
      if (init?.method === 'POST') return json({ runId: 'r4' });
      if (String(url).includes('api.monid.ai')) {
        return json({ status: 'COMPLETED', output: { items: [{ html: PRICED }] } });
      }
      return res(SHELL);
    });
    const out = await crawlPage('https://a.test/s', {
      fetchImpl,
      strategies: ['direct', 'monid'],
      accept: (page) => deterministicPass(page, 'milk').rows.length > 0,
    });
    expect(out).toMatchObject({ ok: true, via: 'monid' });
    expect(out.attempts[0]).toMatchObject({ strategy: 'direct', ok: true, accepted: false });
    expect(out.attempts[1]).toMatchObject({ strategy: 'monid', ok: true, accepted: true });
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

describe('a shop having a bad second is not a shop saying no', () => {
  const ok = () => new Response('<html><body>£1.45 Milk</body></html>', {
    status: 200, headers: { 'content-type': 'text/html' },
  });

  it('tries once more after a 5xx, and takes the answer', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? new Response('busy', { status: 503 }) : ok();
    });
    const out = await crawlPage('https://shop.test/search?q=milk', {
      fetchImpl, strategies: ['direct'], retryDelayMs: 0,
    });
    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
    expect(out.attempts.at(-1)).toMatchObject({ strategy: 'direct', ok: true, retried: true });
  });

  it('tries once more after a timeout', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('slow'), { name: 'TimeoutError' });
      return ok();
    });
    const out = await crawlPage('https://shop.test/search?q=milk', {
      fetchImpl, strategies: ['direct'], retryDelayMs: 0,
    });
    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('never retries a refusal — 403 and 429 are answers, not stumbles', async () => {
    for (const status of [401, 403, 429]) {
      const fetchImpl = vi.fn(async () => new Response('no', { status }));
      const out = await crawlPage('https://shop.test/search?q=milk', {
        fetchImpl, strategies: ['direct'], retryDelayMs: 0,
      });
      expect(out.ok, String(status)).toBe(false);
      expect(fetchImpl, String(status)).toHaveBeenCalledTimes(1);
    }
  });

  it('gives up after the second failure rather than hammering', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }));
    const out = await crawlPage('https://shop.test/search?q=milk', {
      fetchImpl, strategies: ['direct'], retryDelayMs: 0,
    });
    expect(out.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
