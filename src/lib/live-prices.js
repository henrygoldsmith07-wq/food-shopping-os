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

const STORAGE_KEY = 'forq.livePrices.v1';
const TTL_MS = 3 * 60 * 60 * 1000;
export const LIVE_PRICE_TTL_MS = TTL_MS;

/** How much a row deserves to be trusted, in words rather than a score. */
export const methodLabel = (method) => ({
  'json-ld': 'from the shop’s own product data',
  microdata: 'from the shop’s page markup',
  text: 'read off the page text',
  'ai-extracted': 'read by AI — check before relying on it',
}[method] || 'read from the shop’s page');

/**
 * How the page was fetched. Only worth showing when it was not a plain fetch:
 * "we had to render this shop's JavaScript to see it" is useful context for a
 * price that a direct fetch would have missed entirely.
 */
export const viaLabel = (via) => ({
  firecrawl: 'page rendered to load prices',
  jina: 'page rendered to load prices',
}[via] || null);

export const methodTone = (method) => ({
  'json-ld': 'good',
  microdata: 'good',
  text: 'warn',
  'ai-extracted': 'warn',
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
 * Rank the shops for one item, cheapest first.
 *
 * The gap is the point. "Tesco £1.45, Asda £1.50" is two facts; "Asda is 3p
 * (3.4%) dearer" is the decision. Ties share a rank, because two shops at the
 * same price are not first and second.
 */
export const rankShops = (perRetailer = []) => {
  const rows = [...perRetailer]
    .filter((row) => typeof row?.price === 'number')
    .sort((a, b) => a.price - b.price);
  if (!rows.length) return [];
  const cheapest = rows[0].price;
  const dearest = rows.at(-1).price;
  let rank = 0;
  let previous = null;
  return rows.map((row, index) => {
    if (previous === null || row.price !== previous) rank = index + 1;
    previous = row.price;
    return {
      ...row,
      rank,
      isCheapest: row.price === cheapest,
      isDearest: rows.length > 1 && row.price === dearest && row.price !== cheapest,
      over: Math.round((row.price - cheapest) * 100) / 100,
      overPct: cheapest > 0 ? Math.round(((row.price - cheapest) / cheapest) * 1000) / 10 : null,
    };
  });
};

/** What the whole ranked set is worth: the spread between best and worst. */
export const rankingSpread = (ranked = []) => {
  if (ranked.length < 2) return null;
  const cheapest = ranked[0];
  const dearest = ranked.at(-1);
  return {
    cheapest,
    dearest,
    saving: Math.round((dearest.price - cheapest.price) * 100) / 100,
    pct: cheapest.price > 0
      ? Math.round(((dearest.price - cheapest.price) / cheapest.price) * 1000) / 10
      : null,
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
      url: entry.url || null,
    }));

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
