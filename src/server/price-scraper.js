/**
 * Checking shop prices on the open web.
 *
 * For each retailer the app already knows about, this fetches the public
 * search page for a product, reads whatever prices the page states, and
 * reports them per shop. Three things keep it honest:
 *
 *   - robots.txt is checked before every fetch, and a refusal is reported as a
 *     refusal rather than silently dropped.
 *   - Fetching escalates. Most UK grocery search pages render their products
 *     in the browser, so a plain fetch returns a shell with no prices in it.
 *     When a page yields nothing, the next fetch strategy up the ladder (a
 *     headless renderer) is tried before the shop is written off as empty.
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
import { USER_AGENT, availableStrategies, crawlPage } from './crawler.js';
import {
  condenseHtml, mergeCandidates, priceRelevantText, productsFromJsonLd,
  productsFromMicrodata, productsFromText,
} from './scrape-parse.js';
import { isMatch, matchScore, searchQueries } from './search-terms.js';
import { brandedQueries } from './branded-queries.js';

const MAX_ROWS_PER_RETAILER = 8;
/**
 * How many rungs of the query ladder one shop is worth.
 *
 * Three: the two broadest rungs of what they typed, and — when both of those
 * fail at a shop that is answering — one branded name from the app's own
 * catalogue. Shops index brands, so "Heinz Baked Beans" hits a product page
 * where "baked beans" competes with every own-brand tin and meal deal.
 */
const MAX_QUERY_ATTEMPTS = 3;
/** A pause before asking the same shop a second time. Sequential is not enough. */
const RETRY_GAP_MS = 400;

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

/**
 * Read one fetched page with the deterministic passes.
 *
 * A renderer that returns markdown has no JSON-LD or microdata to find, so
 * only the text pass applies there; a page that returns HTML gets all three.
 * The page text is kept alongside the rows because the model fallback and its
 * verification both need the text this page actually contained.
 */
export const deterministicPass = (page, query) => {
  const text = page.html ? condenseHtml(page.html) : String(page.markdown || '');
  const structured = page.html
    ? mergeCandidates([productsFromJsonLd(page.html), productsFromMicrodata(page.html)])
    : [];
  if (structured.length) return { rows: structured, text };
  return { rows: mergeCandidates([productsFromText(text, { query })]), text };
};

/**
 * One shop, one query. Never throws — failure is a status.
 *
 * `wanted` is what the person actually wrote; `query` is the rung of the
 * search ladder currently being tried. They differ deliberately: the search
 * may be broadened, but what counts as an answer may not.
 */
const scrapeRetailerOnce = async (retailer, query, wanted, {
  fetchImpl = fetch, allowModel = true, signal, strategies = null,
} = {}) => {
  const base = {
    retailerId: retailer.id,
    retailer: retailer.name,
    query,
    wanted,
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

  // Escalate through the fetch ladder until a page actually contains prices.
  // "Accepted" means parsed rows, not HTTP 200: a rendered shell returns 200
  // and is exactly the case the next strategy up exists to handle.
  let parsed = { rows: [], text: '' };
  const crawl = await crawlPage(url, {
    fetchImpl,
    signal,
    strategies,
    // A page is only "answered" when it holds a product the person asked
    // for. Requiring merely *some* parsed row stopped the ladder at the
    // first shell that happened to carry a recommendations rail, and never
    // escalated to the renderer that would have produced the real grid.
    accept: (page) => {
      parsed = deterministicPass(page, query);
      return parsed.rows.some((row) => isMatch(row.name, wanted));
    },
  });

  if (!crawl.attempts.length || crawl.attempts.every((attempt) => !attempt.ok)) {
    const code = crawl.attempts.find((attempt) => attempt.code)?.code || 'unreachable';
    return {
      ...base,
      url,
      attempts: crawl.attempts,
      status: code === 'rate-limited' ? 'rate-limited' : code === 'blocked' ? 'blocked' : 'unreachable',
      note: code === 'rate-limited'
        ? 'This shop rate-limited the request. Try again in a few minutes.'
        : code === 'blocked'
          ? 'This shop blocked an automated request. Open its search page directly.'
          : `Could not reach this shop (${code}).`,
    };
  }

  let rows = parsed.rows;
  const pageText = parsed.text;
  let model = null;

  // Only now, with no strategy having produced a row that answers the
  // question, is the model worth asking — and only about the last page we
  // actually managed to read. The test is "nothing relevant", not "nothing at
  // all": a page whose parsers found twenty products from the recommendations
  // rail and none of the one searched for is exactly the page a reader helps
  // with, and testing for an empty list skipped every one of them.
  const nothingRelevant = !rows.some((row) => isMatch(row.name, wanted));
  if (nothingRelevant && allowModel && isOpenRouterConfigured() && pageText.trim()) {
    try {
      const extracted = await extractWithModel(priceRelevantText(pageText), wanted, { fetchImpl });
      model = extracted.model;
      const verified = mergeCandidates([verifyAgainstPage(extracted.rows, pageText)]);
      // Keep whatever the parsers found as well. The model is a second reader
      // of the same page, not a replacement for the shop's own structured
      // data, and the relevance filter below decides between them.
      rows = verified.length ? mergeCandidates([rows, verified]) : rows;
    } catch {
      // The ladder is exhausted or unconfigured; the deterministic answer stands.
    }
  }

  const relevant = rows
    .filter((row) => isMatch(row.name, wanted))
    .map((row) => ({ ...row, relevance: matchScore(row.name, wanted) }))
    .sort((a, b) => b.relevance - a.relevance || a.price - b.price)
    .slice(0, MAX_ROWS_PER_RETAILER)
    .map((row) => ({
      ...row,
      retailerId: retailer.id,
      retailer: retailer.name,
      url: row.url || url,
      via: crawl.via,
      source: 'scraped',
      sourceLabel: `${retailer.name} search page`,
      checkedAt: base.checkedAt,
    }));

  return {
    ...base,
    url,
    rows: relevant,
    model,
    via: crawl.via,
    attempts: crawl.attempts,
    status: relevant.length ? 'ok' : 'no-match',
    note: relevant.length
      ? null
      : 'The shop’s search page loaded but showed no matching price. Many UK retailers price only after a store or postcode is chosen.',
  };
};

/**
 * Check one retailer, broadening the search if the shop found nothing.
 *
 * The retry is deliberately narrow. It happens only on `no-match` — the shop
 * answered, the page parsed, and nothing on it was the product. Every other
 * outcome is left alone: a `declined` shop has said no and asking a second
 * time is not a different question; a `blocked` or `rate-limited` shop is
 * telling us to send less traffic, not more; and an `ok` shop is finished.
 *
 * Which rung answered is reported, because "found under a broader search" is
 * a weaker claim than "found as asked" and the row's relevance score should
 * not be the only place that shows.
 */
export const scrapeRetailer = async (retailer, query, options = {}) => {
  const wanted = String(query || '').trim();
  const ladder = [
    ...searchQueries(wanted).slice(0, 2),
    ...brandedQueries(wanted, { limit: 1 }),
  ].slice(0, MAX_QUERY_ATTEMPTS);
  const tried = [];
  let last = null;
  let strategies = options.strategies || null;
  for (const rung of ladder.length ? ladder : [wanted]) {
    if (options.signal?.aborted) break;
    if (tried.length) {
      await new Promise((resolve) => { setTimeout(resolve, options.retryGapMs ?? RETRY_GAP_MS); });
    }
    tried.push(rung);
    last = await scrapeRetailerOnce(retailer, rung, wanted, { ...options, strategies });
    if (last.status !== 'no-match') break;
    // The broader query only needs the strategies that actually answered.
    // If a plain fetch was refused and only the renderer returned a page,
    // asking the shop again through the refused route is a wasted request —
    // and the query ladder must not double the traffic of a whole-list check.
    const answered = (last.attempts || []).filter((attempt) => attempt.ok).map((attempt) => attempt.strategy);
    if (!answered.length) break;
    strategies = answered;
  }
  if (!last) {
    return {
      retailerId: retailer.id,
      retailer: retailer.name,
      query: wanted,
      wanted,
      rows: [],
      checkedAt: new Date().toISOString(),
      status: 'aborted',
      note: 'The check was stopped before this shop was asked.',
    };
  }
  const broadened = last.query !== wanted && last.status === 'ok';
  return {
    ...last,
    query: wanted,
    searched: last.query,
    broadened,
    queriesTried: tried,
    // Stamped on the rows too, not only the result. The rows are what the app
    // flattens and ranks, and a price found under a widened search is a
    // weaker claim that has to survive being separated from its shop.
    rows: (last.rows || []).map((row) => ({ ...row, searched: last.query, broadened })),
  };
};

/** Cheapest first across every shop that answered. */
export const cheapestAcross = (results = []) => {
  const rows = results.flatMap((result) => result.rows || []);
  return rows.sort((a, b) => a.price - b.price);
};

/**
 * Check one product across shops.
 *
 * A few shops are checked at once, but never the same shop twice at once: the
 * workers pull from a shared queue, so each retailer still receives strictly
 * one request at a time with a gap after it. That is the part that matters —
 * a burst at one shop is what trips its rate limit and looks like an attack,
 * whereas one request each at three different shops is three ordinary
 * visitors. Checking a whole shopping list one shop at a time would take
 * minutes, which is its own kind of broken.
 */
const SHOP_CONCURRENCY = Math.max(1, Number(process.env.PRICE_SCRAPER_CONCURRENCY || 3));

export const scrapePrices = async (query, {
  retailerIds = [], fetchImpl = fetch, allowModel = true, signal, gapMs = 250,
  strategies = null, concurrency = SHOP_CONCURRENCY,
} = {}) => {
  const trimmed = String(query || '').trim();
  const checkedAt = new Date().toISOString();
  if (!scraperEnabled()) {
    return { query: trimmed, results: [], cheapest: [], checkedAt, status: 'disabled' };
  }
  const shops = scrapeableRetailers(retailerIds);
  // Indexed so results keep retailer order however the workers interleave.
  const results = new Array(shops.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= shops.length || signal?.aborted) return;
      results[index] = await scrapeRetailer(shops[index], trimmed, {
        fetchImpl, allowModel, signal, strategies,
      });
      if (gapMs) await new Promise((resolve) => { setTimeout(resolve, gapMs); });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), shops.length || 1) }, worker),
  );
  const settled = results.filter(Boolean);
  const cheapest = cheapestAcross(settled);
  return {
    query: trimmed,
    results: settled,
    cheapest,
    best: cheapest[0] || null,
    checkedAt,
    shopsChecked: settled.length,
    shopsAnswered: settled.filter((result) => result.status === 'ok').length,
    aiUsed: settled.some((result) => result.rows.some((row) => row.method === 'ai-extracted')),
    // Which fetch strategies were available, and which actually answered.
    // Worth surfacing: "eight shops, all answered by the renderer" and "eight
    // shops, all answered directly" are very different cost profiles.
    strategiesAvailable: strategies || availableStrategies(),
    strategiesUsed: [...new Set(settled.map((result) => result.via).filter(Boolean))],
    status: 'ok',
  };
};
