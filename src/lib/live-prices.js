/**
 * Live shop prices, client side.
 *
 * The companion to observed-prices.js, and deliberately kept separate from it.
 * Observed prices are dated community reports; these are read from a shop's
 * own search page at the moment you ask. Both can be wrong, but they are wrong
 * in different ways, so the app never merges them into one number.
 *
 * What this module guarantees:
 *  - nothing is fetched until the user asks for it
 *  - results are cached for 3h, because a scrape is expensive for the shop too
 *  - every price keeps the URL it came from, so it can be checked
 *  - a price extracted by a language model is labelled as such, always
 */

import { shoppingNameKey } from './shopping.js';
import { parseQuantity, unitPriceOf } from './measure.js';

const STORAGE_KEY = 'forq.livePrices.v1';
const TTL_MS = 3 * 60 * 60 * 1000;
export const LIVE_PRICE_TTL_MS = TTL_MS;

/** How much a row deserves to be trusted, in words rather than a score. */
export const methodLabel = (method) => ({
  'json-ld': 'from the shop’s own product data',
  microdata: 'from the shop’s page markup',
  text: 'read off the page text',
  'ai-extracted': 'read by AI — check before relying on it',
  'google-shopping': 'from the store’s listing on Google Shopping',
}[method] || 'read from the shop’s page');

/**
 * How the page was fetched. Only worth showing when it was not a plain fetch:
 * "we had to render this shop's JavaScript to see it" is useful context for a
 * price that a direct fetch would have missed entirely.
 */
export const viaLabel = (via) => ({
  firecrawl: 'page rendered to load prices',
  jina: 'page rendered to load prices',
  monid: 'page fetched through Monid',
}[via] || null);

export const methodTone = (method) => ({
  'json-ld': 'good',
  microdata: 'good',
  text: 'warn',
  'ai-extracted': 'warn',
  'google-shopping': 'warn',
}[method] || 'muted');

/** Minutes since a check, for copy that ages honestly. */
export const checkAge = (checkedAt, now = Date.now()) => {
  const stamp = checkedAt ? new Date(checkedAt).getTime() : NaN;
  if (!Number.isFinite(stamp)) return { minutes: null, label: 'time unknown', stale: true };
  const minutes = Math.max(0, Math.round((now - stamp) / 60000));
  if (minutes < 1) return { minutes, label: 'checked just now', stale: false };
  if (minutes < 60) return { minutes, label: `checked ${minutes} min ago`, stale: false };
  const hours = Math.round(minutes / 60);
  return { minutes, label: `checked ${hours}h ago`, stale: minutes > TTL_MS / 60000 };
};

const loadCache = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    for (const [key, value] of Object.entries(parsed)) {
      if (!value?.checkedAt || now - new Date(value.checkedAt).getTime() > TTL_MS) delete parsed[key];
    }
    return parsed;
  } catch {
    return {};
  }
};

const saveCache = (cache) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Quota or private browsing — a missing cache costs a refetch, nothing more.
  }
};

/**
 * The most recent live results still inside their 3h window.
 *
 * Exposed so the price resolver can read what the last check found without the
 * scraper UI having to lift its state up. Anything older than the window has
 * already aged out of here and is carried by the dated history store instead,
 * which is the right split: this is "live", that is "an earlier check".
 */
export const loadLivePriceCache = () => loadCache();

export const clearLivePriceCache = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear is the same outcome as a cleared cache.
  }
};

/** What the backend will actually attempt, before attempting it. */
export const fetchScraperStatus = async ({ signal } = {}) => {
  const response = await fetch('/api/integrations/scrape-prices', { signal, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Price checking unavailable (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
};

/** Check one product across the shops. Throws with `.status` on failure. */
export const checkLivePrice = async (query, { retailerIds = [], signal } = {}) => {
  const response = await fetch('/api/integrations/scrape-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, retailerIds }),
    signal,
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Price check failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
};

/** Cheapest row per shop, so one shop cannot fill the whole table. */
export const bestPerRetailer = (result) => {
  const byRetailer = new Map();
  for (const row of result?.cheapest || []) {
    const existing = byRetailer.get(row.retailerId);
    if (!existing || row.price < existing.price) byRetailer.set(row.retailerId, row);
  }
  return [...byRetailer.values()].sort((a, b) => a.price - b.price);
};

/**
 * Rank the shops for one item — by what it actually costs per unit.
 *
 * Ticket price is the wrong comparison and it is wrong in a specific,
 * everyday direction: the shop selling the small pack looks cheapest. A 1.13L
 * bottle at 85p beats a 2.27L bottle at £1.45 on the shelf edge and loses by
 * 15% a litre. Ranking on the ticket does not merely fail to help, it hands
 * back the wrong answer with a number attached.
 *
 * So the ranking is per unit wherever the sizes allow it, and says which basis
 * it used. Two cases fall back to the ticket, both flagged rather than
 * silently papered over:
 *
 *  - **No sizes.** Some shops publish a price and no quantity. Nothing can be
 *    normalised, so the ticket is all there is.
 *  - **Mixed scales.** Six eggs against 500g of eggs. Both are eggs, neither
 *    is cheaper, and a ranking that mixes per-item with per-100g is a number
 *    that means nothing.
 *
 * The gap is still the point. "Tesco £1.45, Asda £1.50" is two facts; "Asda
 * is 8% dearer a litre" is the decision. Ties share a rank, because two shops
 * at the same value are not first and second.
 */
export const rankShops = (perRetailer = [], { name } = {}) => {
  const rows = [...perRetailer].filter((row) => typeof row?.price === 'number' && row.price > 0);
  if (!rows.length) {
    return { rows: [], basis: 'none', unitLabel: null, mixedScales: false, ticketMisleads: false };
  }

  const withUnit = rows.map((row) => {
    const size = row.packSize || row.amount;
    const ingredient = name || row.name;
    const parsed = parseQuantity(size, { ingredient });
    return {
      ...row,
      unit: unitPriceOf(row.price, parsed || size, { ingredient }),
      // The displayed figure is rounded to the penny, which is right for
      // reading and wrong for arithmetic: 6.39p and 7.52p per 100ml both round
      // to a two-decimal price, and the gap between the rounded pair reads as
      // 33% where the real one is 18%. Ordering and percentages use this.
      exact: parsed?.amount > 0 ? row.price / parsed.amount : null,
    };
  });
  const priced = withUnit.filter((row) => row.unit && row.exact !== null);
  const scales = new Set(priced.map((row) => `${row.unit.dim}:${row.unit.unit}`));
  // Every shop must be comparable, not most of them: ranking eight shops per
  // litre and appending a ninth on its ticket price puts an incomparable row
  // in an ordered list, which is exactly the confusion this is meant to end.
  const byUnit = priced.length === withUnit.length && scales.size === 1;
  const basis = byUnit ? 'unit' : 'price';

  const value = (row) => (byUnit ? row.exact : row.price);
  const sorted = [...withUnit].sort((a, b) => value(a) - value(b) || a.price - b.price);
  const best = value(sorted[0]);
  const worst = value(sorted.at(-1));
  // The cheapest row's displayed figure, so the money gap is quoted in the
  // same units the reader sees rather than in raw per-millilitre fractions.
  const bestShown = byUnit ? sorted[0].unit.value : sorted[0].price;

  let rank = 0;
  let previous = null;
  const ranked = sorted.map((row, index) => {
    const current = value(row);
    if (previous === null || current !== previous) rank = index + 1;
    previous = current;
    return {
      ...row,
      rank,
      basis,
      isCheapest: current === best,
      isDearest: sorted.length > 1 && current === worst && current !== best,
      // The gap on the basis actually used, so the percentage and the order
      // can never disagree.
      // The money gap stays in the reader's units: per-litre pennies, not the
      // raw per-millilitre fraction the ordering is computed from.
      over: Math.round(((byUnit ? row.unit.value : row.price) - bestShown) * 100) / 100,
      overPct: best > 0 ? Math.round(((current - best) / best) * 1000) / 10 : null,
    };
  });

  const cheapestByTicket = [...withUnit].sort((a, b) => a.price - b.price)[0];
  return {
    rows: ranked,
    basis,
    unitLabel: byUnit ? sorted[0].unit.unit : null,
    mixedScales: scales.size > 1,
    // True when the shop with the cheaper ticket is not the better buy — the
    // case a price-only comparison gets backwards, worth saying out loud.
    ticketMisleads: Boolean(byUnit && cheapestByTicket && ranked[0]
      && cheapestByTicket.retailerId !== ranked[0].retailerId),
    cheapestByTicket: cheapestByTicket || null,
  };
};

/**
 * What the whole ranked set is worth: the spread between best and worst.
 *
 * Reported on the basis the ranking used. A saving quoted per litre against an
 * order computed per litre is one claim; quoting a ticket saving over a value
 * ranking would be two, and the reader would have to work out which.
 */
export const rankingSpread = (ranking) => {
  const rows = Array.isArray(ranking) ? ranking : ranking?.rows || [];
  if (rows.length < 2) return null;
  const basis = Array.isArray(ranking) ? 'price' : ranking.basis;
  const best = rows[0];
  const worst = rows.at(-1);
  // Quoted in the reader's units — rounded pennies per 100ml — but measured
  // from the unrounded figures, or a 6.39p-to-7.52p gap reads as 33%.
  const shown = (row) => (basis === 'unit' ? row.unit.value : row.price);
  const exact = (row) => (basis === 'unit' ? row.exact : row.price);
  const low = exact(best);
  const high = exact(worst);
  return {
    basis,
    unitLabel: basis === 'unit' ? best.unit.unit : null,
    cheapest: best,
    dearest: worst,
    saving: Math.round((shown(worst) - shown(best)) * 100) / 100,
    pct: low > 0 ? Math.round(((high - low) / low) * 1000) / 10 : null,
  };
};

/** Shops that were asked but could not answer, with the reason they gave. */
export const unansweredShops = (result) =>
  (result?.results || [])
    .filter((entry) => entry.status !== 'ok')
    .map((entry) => ({
      retailer: entry.retailer,
      retailerId: entry.retailerId,
      status: entry.status,
      note: entry.note,
      // A shop that refused us has not refused the person holding the phone.
      // Every shop keeps a working link to its own search for this item, so
      // "we could not read this" never means "you cannot look".
      url: entry.url || null,
    }));

/**
 * Every shop, for one item, with somewhere to go — priced or not.
 *
 * The scraper's job is to save the trip; when it cannot, the next best thing
 * is the trip made short. A shop whose robots.txt refuses our reader has no
 * objection to a person opening the same page, and that page is one tap away
 * if the app keeps the link rather than only the apology.
 */
export const shopLinksFor = (result) => (result?.results || []).map((entry) => {
  const priced = (entry.rows || [])[0] || null;
  return {
    retailer: entry.retailer,
    retailerId: entry.retailerId,
    status: entry.status,
    price: priced?.price ?? null,
    // The product's own page when the shop published one, its search results
    // otherwise. Labelled, because "the product" and "a list of maybes" are
    // different promises.
    url: priced?.url || entry.url || null,
    isProductLink: Boolean(priced?.isProductLink),
    productName: priced?.name || null,
  };
}).filter((row) => row.url);

/** Check a batch of products in one request. Returns `checks` and `remaining`. */
export const checkLivePriceBatch = async (items, { retailerIds = [], signal } = {}) => {
  const response = await fetch('/api/integrations/scrape-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items, retailerIds }),
    signal,
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Price check failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
};

/** Shape one scrape result into the entry the UI and history both consume. */
export const entryFromResult = (name, result) => ({
  name,
  best: result.best || null,
  strategiesUsed: result.strategiesUsed || [],
  perRetailer: bestPerRetailer(result),
  unanswered: unansweredShops(result),
  shopLinks: shopLinksFor(result),
  shopsChecked: result.shopsChecked || 0,
  shopsAnswered: result.shopsAnswered || 0,
  aiUsed: Boolean(result.aiUsed),
  checkedAt: result.checkedAt || new Date().toISOString(),
});

/** How many items go up in one request. The route caps this at 12. */
export const BATCH_SIZE = 4;

const chunk = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/**
 * Check every item on the list, cache-first.
 *
 * The whole list is checked, not a sample of it: a comparison that silently
 * covers six of your twenty items is worse than useless, because it looks
 * complete. What keeps that affordable is the 3h cache and batching — only
 * items without a fresh cached answer go to the network, and those go up
 * several per request rather than one at a time.
 *
 * `onProgress` reports {done, total, name} as it goes, because checking a long
 * list against every shop takes long enough that silence reads as a hang.
 */
export const checkLivePricesForList = async (items = [], {
  retailerIds = [], signal, force = false, onProgress, batchSize = BATCH_SIZE,
} = {}) => {
  const names = [...new Set(items.map((item) => item?.name).filter(Boolean))];
  if (!names.length) {
    return { byKey: {}, checkedAt: new Date().toISOString(), fromCache: 0, fetched: 0, total: 0 };
  }

  const cache = loadCache();
  const byKey = {};
  let fromCache = 0;
  let fetched = 0;
  const pending = [];

  for (const name of names) {
    const key = shoppingNameKey(name);
    if (!key) continue;
    const cached = cache[key];
    const fresh = !force && cached && Date.now() - new Date(cached.checkedAt).getTime() < TTL_MS;
    if (fresh) {
      byKey[key] = { ...cached, cached: true };
      fromCache += 1;
    } else {
      pending.push(name);
    }
  }

  const total = names.length;
  onProgress?.({ done: fromCache, total, name: null });

  let queue = [...pending];
  let guard = 0;
  while (queue.length && !signal?.aborted) {
    // The server returns `remaining` when a batch outruns its time budget, so
    // those items go back on the queue rather than being quietly dropped.
    // The guard stops a server that always defers from looping forever.
    guard += 1;
    if (guard > names.length + 10) break;
    const batches = chunk(queue, batchSize);
    const deferred = [];
    for (const batch of batches) {
      if (signal?.aborted) break;
      try {
        const body = await checkLivePriceBatch(batch, { retailerIds, signal });
        for (const result of body.checks || []) {
          const name = result.query;
          const key = shoppingNameKey(name);
          if (!key) continue;
          const entry = entryFromResult(name, result);
          cache[key] = entry;
          byKey[key] = { ...entry, cached: false };
          fetched += 1;
        }
        saveCache(cache);
        deferred.push(...(body.remaining || []));
        onProgress?.({ done: fromCache + fetched, total, name: batch.at(-1) });
      } catch (error) {
        // Signed out, rate limited or switched off is a whole-run problem.
        if (error.status === 401 || error.status === 429 || error.status === 503) throw error;
        // One failed batch should not lose the rest of the list.
        for (const name of batch) {
          const key = shoppingNameKey(name);
          if (key) byKey[key] = { name, error: error.message || 'Price check failed', checkedAt: new Date().toISOString() };
        }
        onProgress?.({ done: fromCache + fetched, total, name: batch.at(-1) });
      }
    }
    queue = deferred;
  }

  return {
    byKey,
    checkedAt: new Date().toISOString(),
    fromCache,
    fetched,
    total,
    aborted: Boolean(signal?.aborted),
  };
};
