/**
 * Getting a supermarket search page that actually contains prices.
 *
 * A plain fetch is enough for a server-rendered shop and useless for the rest.
 * Most UK grocery search pages are client-rendered: the HTML that arrives is an
 * empty shell, the products appear only after JavaScript runs, and no amount of
 * better parsing will find a price that was never in the document. That, not
 * the parsers, is why a direct-fetch-only scraper misses.
 *
 * So fetching is a ladder rather than a single attempt:
 *
 *   monid      — a scraping endpoint run through the Monid API (api.monid.ai).
 *                Free on this workspace, so when MONID_API_KEY is set it
 *                leads: it renders JavaScript and returns real HTML, which
 *                keeps the structured passes working. A run takes seconds to
 *                minutes, so without a key the ladder simply starts at direct.
 *   direct     — plain fetch. Free, instant, works on server-rendered shops.
 *   firecrawl  — headless render via Firecrawl. Needs FIRECRAWL_API_KEY and
 *                costs credits, so it is only reached when the rungs before
 *                it found nothing. Returns real HTML, so structured parsing
 *                still works.
 *   jina       — r.jina.ai. Keyless, renders JavaScript, returns markdown
 *                rather than HTML, so only the text pass can read it. Last
 *                resort, and free.
 *
 * The caller decides when a strategy has failed — "fetched 200 OK" and "found
 * a price" are different questions, and only the second one matters.
 */

const DEFAULT_ORDER = ['monid', 'direct', 'firecrawl', 'jina'];

export const USER_AGENT = process.env.SCRAPER_USER_AGENT
  || 'ForqBot/1.0 (+https://github.com/henrygoldsmith07-wq/food-shopping-os; price comparison for personal shopping lists)';

const PAGE_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 9000);
const RENDER_TIMEOUT_MS = Number(process.env.SCRAPER_RENDER_TIMEOUT_MS || 25000);
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export const firecrawlConfigured = () => Boolean(process.env.FIRECRAWL_API_KEY);
export const monidConfigured = () => Boolean(process.env.MONID_API_KEY);
export const jinaEnabled = () => process.env.JINA_READER_ENABLED !== 'false';

/** A fetch error the orchestrator can turn into a per-shop status. */
const failure = (code, message) => Object.assign(new Error(message || code), { code });

const cap = (value) => {
  const text = String(value || '');
  return text.length > MAX_PAGE_BYTES ? text.slice(0, MAX_PAGE_BYTES) : text;
};

const classify = (status) => {
  if (status === 429) return 'rate-limited';
  if (status === 403 || status === 401) return 'blocked';
  return `http-${status}`;
};

/** Which strategies are available, in order, given the configuration. */
export const availableStrategies = () => {
  const configured = String(process.env.PRICE_SCRAPER_STRATEGIES || '')
    .split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const order = configured.length ? configured : DEFAULT_ORDER;
  return order.filter((name) => {
    if (name === 'firecrawl') return firecrawlConfigured();
    if (name === 'monid') return monidConfigured();
    if (name === 'jina') return jinaEnabled();
    return name === 'direct';
  });
};

/** Plain fetch, as a browser would. Free and instant; leads when Monid is not configured. */
export const directFetch = async (url, { fetchImpl = fetch, signal } = {}) => {
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-GB,en;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
    signal: signal || AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!response.ok) throw failure(classify(response.status), `direct fetch ${response.status}`);
  const type = response.headers?.get?.('content-type') || '';
  if (type && !/html|xml|text\/plain|json/i.test(type)) throw failure('not-html', 'response was not a document');
  return { html: cap(await response.text()), markdown: null, via: 'direct' };
};

/**
 * Firecrawl's scrape endpoint: a headless browser that returns the rendered
 * page. Asks for rawHtml as well as markdown so the structured passes — the
 * ones whose prices come from the shop rather than from a guess — still apply.
 *
 * The response is read defensively: Firecrawl has moved these field names
 * between versions, and a price feature should not break on a rename.
 */
export const firecrawlFetch = async (url, { fetchImpl = fetch, signal } = {}) => {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw failure('not-configured', 'Firecrawl has no API key');
  const base = (process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev/v2').replace(/\/+$/, '');
  const response = await fetchImpl(`${base}/scrape`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'rawHtml'],
      onlyMainContent: false,
      waitFor: Number(process.env.FIRECRAWL_WAIT_MS || 2500),
      timeout: RENDER_TIMEOUT_MS,
  }),
    signal: signal || AbortSignal.timeout(RENDER_TIMEOUT_MS + 5000),
    cache: 'no-store',
  });
  if (!response.ok) throw failure(classify(response.status), `firecrawl ${response.status}`);
  const body = await response.json().catch(() => null);
  if (!body || body.success === false) {
    throw failure('render-failed', body?.error || 'Firecrawl returned no page');
  }
  const data = body.data || body;
  const html = data.rawHtml || data.html || null;
  const markdown = data.markdown || data.content || null;
  if (!html && !markdown) throw failure('empty', 'Firecrawl returned an empty page');
  return { html: html ? cap(html) : null, markdown: markdown ? cap(markdown) : null, via: 'firecrawl' };
};

/**
 * Pull page content out of a completed run without trusting one field name.
 * Endpoints return different envelopes — a bare HTML string, an items array,
 * a nested result object — so walk the JSON once and take the first strings
 * that look like a document: HTML first so the structured passes keep
 * working, then markdown/text as the text-only fallback.
 */
const HTML_KEYS = ['html', 'rawhtml'];
const TEXT_KEYS = ['markdown', 'text', 'content'];

const contentFrom = (value, found = { html: null, markdown: null }, depth = 0) => {
  if (found.html || depth > 6) return found;
  if (Array.isArray(value)) {
    for (const entry of value) {
      contentFrom(entry, found, depth + 1);
      if (found.html) break;
    }
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry !== 'string' || !entry) continue;
      const name = key.toLowerCase();
      if (!found.html && HTML_KEYS.includes(name)) found.html = entry;
      else if (!found.markdown && TEXT_KEYS.includes(name)) found.markdown = entry;
    }
    if (!found.html) {
      for (const entry of Object.values(value)) {
        if (entry && typeof entry === 'object') {
          contentFrom(entry, found, depth + 1);
          if (found.html) break;
        }
      }
    }
  }
  return found;
};

/**
 * The body sent to the configured Monid endpoint. Endpoints have their own
 * input schemas (that is what `monid inspect` reports), so the template is
 * overridable; `{{url}}` is where the shop's search page goes.
 */
const monidInput = (url) => {
  const template = process.env.MONID_SCRAPE_INPUT_JSON
    || '{"startUrls":[{"url":"{{url}}"}],"maxCrawlResults":1}';
  try {
    return JSON.parse(template.replace('{{url}}', () => url));
  } catch {
    throw failure('bad-config', 'MONID_SCRAPE_INPUT_JSON is not valid JSON');
  }
};

/**
 * Monid's run API. Fire-and-poll: POST /v1/run starts the configured
 * endpoint, then GET /v1/runs/:id until it finishes. A run takes seconds
 * to minutes, and it never retries on its own — a failed or timed-out run
 * just hands the shop to the next rung down the ladder.
 */
export const monidFetch = async (url, { fetchImpl = fetch, signal } = {}) => {
  const key = process.env.MONID_API_KEY;
  if (!key) throw failure('not-configured', 'Monid has no API key');
  const base = (process.env.MONID_API_BASE_URL || 'https://api.monid.ai').replace(/\/+$/, '');
  const provider = process.env.MONID_SCRAPE_PROVIDER || 'apify';
  const endpoint = process.env.MONID_SCRAPE_ENDPOINT || '/apify/website-content-crawler';
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const runTimeoutMs = Number(process.env.MONID_RUN_TIMEOUT_MS || 60000);
  const pollMs = Math.max(0, Number(process.env.MONID_POLL_MS || 2000));
  const requestSignal = signal || AbortSignal.timeout(runTimeoutMs + 5000);

  const start = await fetchImpl(`${base}/v1/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider, endpoint, input: { body: monidInput(url) } }),
    signal: requestSignal,
    cache: 'no-store',
  });
  if (!start.ok) throw failure(classify(start.status), `monid ${start.status}`);
  const started = await start.json().catch(() => null);
  const runId = started?.runId || started?.id || started?.run?.id;
  if (!runId) throw failure('render-failed', 'Monid returned no run id');

  const deadline = Date.now() + runTimeoutMs;
  for (;;) {
    if (signal?.aborted) throw failure('aborted', 'Monid run aborted');
    await new Promise((resolve) => { setTimeout(resolve, pollMs); });
    if (Date.now() > deadline) {
      throw failure('timeout', `Monid run ${runId} did not finish in ${runTimeoutMs}ms`);
    }
    const poll = await fetchImpl(`${base}/v1/runs/${encodeURIComponent(runId)}`, {
      headers, signal: requestSignal, cache: 'no-store',
    });
    if (!poll.ok) throw failure(classify(poll.status), `monid run ${poll.status}`);
    const run = await poll.json().catch(() => null);
    const status = String(run?.status || run?.state || '').toUpperCase();
    if (/COMPLETE|SUCCEED|DONE/.test(status)) {
      const content = contentFrom(run?.output ?? run?.result ?? run);
      const html = content.html ? cap(content.html) : null;
      const markdown = content.markdown ? cap(content.markdown) : null;
      if (!html && !markdown) throw failure('empty', 'Monid run finished without page content');
      return { html, markdown, via: 'monid' };
    }
    if (/FAIL|ERROR|ABORT|CANCEL|TIMEOUT/.test(status)) {
      throw failure('render-failed', run?.error || `Monid run ${status.toLowerCase()}`);
    }
  }
};

/**
 * Jina Reader. Keyless, renders JavaScript, and returns markdown — so the
 * structured passes cannot run on it and only the text pass applies. That is
 * why it sits last: its answers are the least verifiable of the three.
 */
export const jinaFetch = async (url, { fetchImpl = fetch, signal } = {}) => {
  const base = (process.env.JINA_READER_BASE_URL || 'https://r.jina.ai').replace(/\/+$/, '');
  const headers = {
    accept: 'text/plain',
    'user-agent': USER_AGENT,
    // Ask for the whole page: a grocery results grid is not "main content".
    'x-target-selector': 'body',
  };
  if (process.env.JINA_API_KEY) headers.authorization = `Bearer ${process.env.JINA_API_KEY}`;
  const response = await fetchImpl(`${base}/${url}`, {
    headers,
    redirect: 'follow',
    cache: 'no-store',
    signal: signal || AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
  if (!response.ok) throw failure(classify(response.status), `jina ${response.status}`);
  const markdown = cap(await response.text());
  if (!markdown.trim()) throw failure('empty', 'Jina Reader returned an empty page');
  return { html: null, markdown, via: 'jina' };
};

const STRATEGIES = { direct: directFetch, firecrawl: firecrawlFetch, monid: monidFetch, jina: jinaFetch };

/** Run one named strategy. Unknown names are a configuration error, not a crash. */
export const runStrategy = async (name, url, options = {}) => {
  const strategy = STRATEGIES[name];
  if (!strategy) throw failure('unknown-strategy', `No fetch strategy named "${name}"`);
  return strategy(url, options);
};

/**
 * Walk the ladder until `accept` is satisfied.
 *
 * `accept(page)` is what makes this worth having: it lets the caller say
 * "this page had no prices in it", which is the real failure mode, rather than
 * stopping at the first response that happened to return HTTP 200.
 */
/** Codes worth one more go: the shop faltered rather than refused. */
const TRANSIENT = /^(?:timeout|unreachable|http-5\d\d)$/;

export const crawlPage = async (url, {
  fetchImpl = fetch, signal, accept = () => true, strategies = null, onAttempt,
  retryDelayMs = 600,
} = {}) => {
  const order = strategies || availableStrategies();
  const attempts = [];
  for (const name of order) {
    if (signal?.aborted) break;
    try {
      const page = await runStrategy(name, url, { fetchImpl, signal });
      const accepted = accept(page);
      attempts.push({ strategy: name, ok: true, accepted });
      onAttempt?.({ strategy: name, ok: true, accepted });
      if (accepted) return { ...page, attempts, ok: true };
    } catch (error) {
      const code = error?.code || (error?.name === 'TimeoutError' ? 'timeout' : 'unreachable');
      attempts.push({ strategy: name, ok: false, code });
      onAttempt?.({ strategy: name, ok: false, code });
      // A timeout or a 5xx is the shop having a bad second, not the shop
      // saying no. One retry after a pause converts a fair share of those
      // into answers, and costs nothing when the shop is genuinely down.
      // A refusal — 401, 403, 429 — is never retried: it is an answer.
      if (TRANSIENT.test(code) && !signal?.aborted) {
        await new Promise((resolve) => { setTimeout(resolve, retryDelayMs); });
        try {
          const page = await runStrategy(name, url, { fetchImpl, signal });
          const accepted = accept(page);
          attempts.push({ strategy: name, ok: true, accepted, retried: true });
          onAttempt?.({ strategy: name, ok: true, accepted, retried: true });
          if (accepted) return { ...page, attempts, ok: true };
        } catch (retryError) {
          const retryCode = retryError?.code
            || (retryError?.name === 'TimeoutError' ? 'timeout' : 'unreachable');
          attempts.push({ strategy: name, ok: false, code: retryCode, retried: true });
          onAttempt?.({ strategy: name, ok: false, code: retryCode, retried: true });
        }
      }
      // A shop that blocks us blocks us; escalating to a renderer is the whole
      // point, so keep going rather than giving up on the first refusal.
    }
  }
  return { html: null, markdown: null, via: null, attempts, ok: false };
};
