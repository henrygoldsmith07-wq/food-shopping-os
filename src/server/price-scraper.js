/**
 * Checking shop prices on the open web.
 *
 * For each retailer the app already knows about, this fetches the public
 * search page for a product, reads whatever prices the page states, and
 * reports them per shop. Three things keep it honest:
 *
 *   - robots.txt is checked before every fetch, and a refusal is reported as a
 *     refusal rather than silently dropped.
 *   - Deterministic parsing runs first. The language model is only asked when
 *     the page yields no structured data, and anything it returns is marked
 *     `ai-extracted` with lower confidence.
 *   - Nothing is fabricated. A shop that fails, blocks or returns nothing is
 *     reported with the reason. An empty result is a valid answer.
 *
 * Every row carries the URL it came from, so any number shown in the app can
 * be clicked through and checked against the shelf.
 */

import { RETAILERS, retailerById } from '../data/retailers.js';
import { freeChat, isOpenRouterConfigured } from './openrouter.js';
import { isScrapeAllowed } from './robots.js';
import {
  condenseHtml, mergeCandidates, priceRelevantText, productsFromJsonLd,
  productsFromMicrodata, productsFromText, relevanceScore,
} from './scrape-parse.js';

const USER_AGENT = process.env.SCRAPER_USER_AGENT
  || 'ForqBot/1.0 (+https://github.com/henrygoldsmith07-wq/food-shopping-os; price comparison for personal shopping lists)';
const PAGE_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 9000);
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS_PER_RETAILER = 8;
const MIN_RELEVANCE = 0.34;

export const scraperEnabled = () => process.env.PRICE_SCRAPER_ENABLED !== 'false';

/** Retailers the scraper is allowed to visit, honouring an env allowlist. */
export const scrapeableRetailers = (ids = []) => {
  const configured = String(process.env.PRICE_SCRAPER_RETAILERS || '')
    .split(',').map((entry) => entry.trim()).filter(Boolean);
  const pool = configured.length
    ? configured.map((id) => retailerById(id)).filter(Boolean)
    : RETAILERS;
  if (!ids.length) return pool;
  const wanted = new Set(ids.map((id) => retailerById(id)?.id).filter(Boolean));
  return pool.filter((entry) => wanted.has(entry.id));
};

/**
 * Fetch a page as a browser would, with hard caps.
 *
 * The byte cap matters: a retailer search page can be several megabytes of
 * inlined state, and reading all of it into a serverless function to find one
 * price is how a function runs out of memory.
 */
const fetchPage = async (url, { fetchImpl = fetch, signal } = {}) => {
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
  if (response.status === 429) {
    const error = new Error('rate-limited');
    error.code = 'rate-limited';
    throw error;
  }
  if (response.status === 403 || response.status === 401) {
    const error = new Error('blocked');
    error.code = 'blocked';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`http-${response.status}`);
    error.code = `http-${response.status}`;
    throw error;
  }
  const type = response.headers?.get?.('content-type') || '';
  if (type && !/html|xml|text\/plain|json/i.test(type)) {
    const error = new Error('not-html');
    error.code = 'not-html';
    throw error;
  }
  const body = await response.text();
  return body.length > MAX_PAGE_BYTES ? body.slice(0, MAX_PAGE_BYTES) : body;
};

const SYSTEM_PROMPT = `You read the text of a UK supermarket search results page and report the product prices printed on it.
Rules:
- Only report a product and price that literally appear in the text. Never estimate, never infer, never complete a partial price.
- Prices are pounds sterling. "£1.50" is 1.5. "85p" is 0.85.
- Ignore delivery charges, minimum spends, membership offers, and totals.
- If the text contains no product prices, return an empty array.
Reply with JSON only, no prose, in the form:
{"products":[{"name":"...","price":0.00,"packSize":"500g or null","unitPrice":"£1.50/kg or null","offer":"offer text or null"}]}`;

/** Pull the first JSON object out of a model reply that may be fenced or chatty. */
export const parseModelJson = (text = '') => {
  const raw = String(text).trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
};

/**
 * Ask the model ladder to read a page the parsers could not.
 *
 * `freeChat` walks the ranking itself, so a rate-limited Nemotron Ultra costs
 * one retry into DeepSeek rather than the whole lookup.
 */
export const extractWithModel = async (text, query, { fetchImpl = fetch } = {}) => {
  if (!isOpenRouterConfigured() || !text.trim()) return { rows: [], model: null };
  const { text: reply, model } = await freeChat({
    system: SYSTEM_PROMPT,
    user: `Product searched for: ${query}\n\nPage text:\n${text}`,
    maxTokens: 900,
    temperature: 0,
    maxAttempts: 8,
    fetchImpl,
  });
  const parsed = parseModelJson(reply);
  const products = Array.isArray(parsed?.products) ? parsed.products : [];
  const rows = products.map((row) => {
    const price = typeof row?.price === 'number' ? row.price : Number(row?.price);
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    if (!name || !Number.isFinite(price) || price <= 0 || price > 1000) return null;
    return {
      name: name.slice(0, 200),
      price: Math.round(price * 100) / 100,
      currency: 'GBP',
      url: null,
      brand: null,
      packSize: typeof row.packSize === 'string' ? row.packSize.slice(0, 40) : null,
      unitPrice: typeof row.unitPrice === 'string' ? row.unitPrice.slice(0, 40) : null,
      offer: typeof row.offer === 'string' ? row.offer.slice(0, 120) : null,
      inStock: null,
      method: 'ai-extracted',
      confidence: 'low',
    };
  }).filter(Boolean);
  return { rows, model };
};

/**
 * Verify a model-reported price actually appears on the page.
 *
 * Without this the LLM pass is unfalsifiable. With it, a hallucinated price is
 * dropped before it can reach the user's shopping list.
 */
export const verifyAgainstPage = (rows, pageText) => {
  const haystack = String(pageText).replace(/\s+/g, ' ').toLowerCase();
  return rows.filter((row) => {
    const pounds = row.price.toFixed(2);
    const escaped = pounds.replace('.', '\\.');
    // Digit boundaries so 1.45 is not "found" inside 11.456.
    const bare = new RegExp(`(^|[^\\d.])${escaped}([^\\d]|$)`);
    const pence = new RegExp(`(^|[^\\d])${Math.round(row.price * 100)}p\\b`);
    return haystack.includes(`£${pounds}`)
      || haystack.includes(`£ ${pounds}`)
      || bare.test(haystack)
      || (row.price < 1 && pence.test(haystack));
  });
};

/** Check one retailer for one product. Never throws — failure is a status. */
export const scrapeRetailer = async (retailer, query, {
  fetchImpl = fetch, allowModel = true, signal,
} = {}) => {
  const base = {
    retailerId: retailer.id,
    retailer: retailer.name,
    query,
    rows: [],
    checkedAt: new Date().toISOString(),
  };
  const url = retailer.search(query);
  if (!url) return { ...base, status: 'no-search-url', note: 'This shop has no public product search.' };

  const permission = await isScrapeAllowed(url, { userAgent: USER_AGENT, fetchImpl }).catch(() => null);
  if (!permission?.allowed) {
    return {
      ...base,
      url,
      status: 'declined',
      note: permission?.reason === 'robots-unreachable'
        ? 'Could not read this shop’s robots.txt, so it was not fetched.'
        : 'This shop’s robots.txt asks crawlers not to fetch its search pages.',
    };
  }

  let html;
  try {
    html = await fetchPage(url, { fetchImpl, signal });
  } catch (error) {
    const code = error?.code || (error?.name === 'TimeoutError' ? 'timeout' : 'unreachable');
    return {
      ...base,
      url,
      status: code === 'rate-limited' ? 'rate-limited' : code === 'blocked' ? 'blocked' : 'unreachable',
      note: code === 'rate-limited'
        ? 'This shop rate-limited the request. Try again in a few minutes.'
        : code === 'blocked'
          ? 'This shop blocked an automated request. Open its search page directly.'
          : `Could not reach this shop (${code}).`,
    };
  }

  const structured = mergeCandidates([productsFromJsonLd(html), productsFromMicrodata(html)]);
  const pageText = condenseHtml(html);
  let rows = structured;
  let model = null;

  if (!rows.length) rows = mergeCandidates([productsFromText(pageText, { query })]);

  // Only now, with both deterministic passes empty, is the model worth asking.
  if (!rows.length && allowModel && isOpenRouterConfigured()) {
    try {
      const extracted = await extractWithModel(priceRelevantText(pageText), query, { fetchImpl });
      model = extracted.model;
      rows = mergeCandidates([verifyAgainstPage(extracted.rows, pageText)]);
    } catch {
      // The ladder is exhausted or unconfigured; the deterministic answer stands.
    }
  }

  const relevant = rows
    .map((row) => ({ ...row, relevance: relevanceScore(row.name, query) }))
    .filter((row) => row.relevance >= MIN_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance || a.price - b.price)
    .slice(0, MAX_ROWS_PER_RETAILER)
    .map((row) => ({
      ...row,
      retailerId: retailer.id,
      retailer: retailer.name,
      url: row.url || url,
      source: 'scraped',
      sourceLabel: `${retailer.name} search page`,
      checkedAt: base.checkedAt,
    }));

  return {
    ...base,
    url,
    rows: relevant,
    model,
    status: relevant.length ? 'ok' : 'no-match',
    note: relevant.length
      ? null
      : 'The shop’s search page loaded but showed no matching price. Many UK retailers price only after a store or postcode is chosen.',
  };
};

/** Cheapest first across every shop that answered. */
export const cheapestAcross = (results = []) => {
  const rows = results.flatMap((result) => result.rows || []);
  return rows.sort((a, b) => a.price - b.price);
};

/**
 * Check one product across shops, sequentially.
 *
 * Sequential on purpose: a parallel burst across eight retailers from one IP
 * is what turns a price check into something that looks like an attack, and
 * it is also what trips their rate limits.
 */
export const scrapePrices = async (query, {
  retailerIds = [], fetchImpl = fetch, allowModel = true, signal, gapMs = 250,
} = {}) => {
  const trimmed = String(query || '').trim();
  const checkedAt = new Date().toISOString();
  if (!scraperEnabled()) {
    return { query: trimmed, results: [], cheapest: [], checkedAt, status: 'disabled' };
  }
  const shops = scrapeableRetailers(retailerIds);
  const results = [];
  for (const retailer of shops) {
    if (signal?.aborted) break;
    results.push(await scrapeRetailer(retailer, trimmed, { fetchImpl, allowModel, signal }));
    if (gapMs) await new Promise((resolve) => { setTimeout(resolve, gapMs); });
  }
  const cheapest = cheapestAcross(results);
  return {
    query: trimmed,
    results,
    cheapest,
    best: cheapest[0] || null,
    checkedAt,
    shopsChecked: results.length,
    shopsAnswered: results.filter((result) => result.status === 'ok').length,
    aiUsed: results.some((result) => result.rows.some((row) => row.method === 'ai-extracted')),
    status: 'ok',
  };
};
