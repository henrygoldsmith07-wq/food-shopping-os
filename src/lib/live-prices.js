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

/**
 * Check several list items, cache-first.
 *
 * Capped at six items per run. The route's own limit is eight, and each item
 * fans out across every shop — a whole week's list in one click would be a
 * hundred-odd page fetches, which is not a reasonable thing to do to a shop.
 */
export const checkLivePricesForList = async (items = [], {
  retailerIds = [], signal, limit = 6, force = false,
} = {}) => {
  const names = [...new Set(items.map((item) => item?.name).filter(Boolean))].slice(0, limit);
  if (!names.length) return { byKey: {}, checkedAt: new Date().toISOString(), fromCache: 0, fetched: 0 };

  const cache = loadCache();
  const byKey = {};
  let fromCache = 0;
  let fetched = 0;

  for (const name of names) {
    if (signal?.aborted) break;
    const key = shoppingNameKey(name);
    if (!key) continue;
    const cached = cache[key];
    const fresh = !force && cached && Date.now() - new Date(cached.checkedAt).getTime() < TTL_MS;
    if (fresh) {
      byKey[key] = { ...cached, cached: true };
      fromCache += 1;
      continue;
    }
    try {
      const result = await checkLivePrice(name, { retailerIds, signal });
      const entry = {
        name,
        best: result.best || null,
        perRetailer: bestPerRetailer(result),
        unanswered: unansweredShops(result),
        shopsChecked: result.shopsChecked || 0,
        shopsAnswered: result.shopsAnswered || 0,
        aiUsed: Boolean(result.aiUsed),
        checkedAt: result.checkedAt || new Date().toISOString(),
      };
      cache[key] = entry;
      saveCache(cache);
      byKey[key] = { ...entry, cached: false };
      fetched += 1;
    } catch (error) {
      // A signed-out or rate-limited user is a whole-run problem; one shop
      // failing on one item is not, so only the former stops the loop.
      if (error.status === 401 || error.status === 429 || error.status === 503) throw error;
      byKey[key] = { name, error: error.message || 'Price check failed', checkedAt: new Date().toISOString() };
    }
  }
  return { byKey, checkedAt: new Date().toISOString(), fromCache, fetched };
};
