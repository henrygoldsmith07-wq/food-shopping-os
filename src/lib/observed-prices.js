/**
 * Real (observed) prices for Forq.
 *
 * There is no single public live UK supermarket price API — the READMEs and
 * retailer-providers.js already say so explicitly. The honest "real" prices
 * Forq can show are:
 *   1) your own receipt prices (priceHistory / shops) — always primary, and
 *   2) community observations from Open Prices (GBP, via /api/integrations/prices)
 *
 * This module is the view layer over (2): fetching, caching, staleness and
 * the copy that keeps "observed" from being mistaken for "live".
 *
 * Observed prices are:
 *  - fetched only after an explicit user action (button click)
 *  - labelled "Community observed · <store> · <date>" and never "Live"
 *  - stale-aware: <7d fresh, 7-30d ageing, >30d old — old rows are dimmed
 *  - cached 24h in localStorage so a list fetch doesn't hammer the 120/h limit
 */

import { dayStamp, daysUntil } from './kitchen.js';
import { shoppingNameKey } from './shopping.js';

const STORAGE_KEY = 'forq.observedPrices.v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const OBSERVED_FRESH_DAYS = 7;
export const OBSERVED_STALE_DAYS = 30;

/** "2026-07-30" → days ago from today. Null when unparseable. */
export const observedAgeDays = (observedAt, today = dayStamp()) => {
  if (!observedAt) return null;
  const stamp = String(observedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
  const diff = daysUntil(stamp, today);
  // daysUntil = days from today to stamp (past = negative). Invert.
  return diff == null ? null : -diff;
};

export const observedStaleness = (observedAt, today = dayStamp()) => {
  const age = observedAgeDays(observedAt, today);
  if (age == null) return { age: null, level: 'unknown', label: 'date unknown', tone: 'muted' };
  if (age < 0) return { age, level: 'future', label: 'observed date in future', tone: 'muted' };
  if (age <= OBSERVED_FRESH_DAYS) return { age, level: 'fresh', label: age === 0 ? 'observed today' : age === 1 ? 'observed yesterday' : `observed ${age}d ago`, tone: 'good' };
  if (age <= OBSERVED_STALE_DAYS) return { age, level: 'ageing', label: `observed ${age}d ago`, tone: 'warn' };
  return { age, level: 'old', label: `observed ${age}d ago · may be out of date`, tone: 'danger' };
};

export const observedPriceLabel = (price) => {
  if (!price || typeof price.price !== 'number') return null;
  const store = price.store?.trim() ? price.store.trim() : 'Shop not named';
  const when = price.observedAt ? String(price.observedAt).slice(0, 10) : null;
  const staleness = observedStaleness(price.observedAt);
  return {
    price: price.price,
    currency: price.currency || 'GBP',
    store,
    location: price.location || null,
    observedAt: when,
    staleness,
    sourceLabel: price.sourceLabel || 'Open Prices (community observed)',
  };
};

const loadCache = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // prune expired
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (!v?.checkedAt || now - new Date(v.checkedAt).getTime() > TTL_MS) delete parsed[k];
    }
    return parsed;
  } catch { return {}; }
};

const saveCache = (cache) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* quota or private mode */ }
};

export const clearObservedPriceCache = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};

/**
 * Fetch one observed price set via the existing backend route.
 * Route is authenticated + rate-limited (120/h); callers should handle 401/429.
 */
export const fetchObservedPrice = async ({ barcode, query }, { signal } = {}) => {
  const params = new URLSearchParams();
  if (barcode) params.set('barcode', String(barcode).trim());
  if (!barcode && query) params.set('query', String(query).trim());
  if (!params.toString()) return { prices: [], sourceLabel: null, checkedAt: new Date().toISOString() };
  const res = await fetch(`/api/integrations/prices?${params.toString()}`, { signal, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `Observed prices unavailable (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body; // { prices, sourceLabel, checkedAt, source }
};

/**
 * Fetch observed prices for a shopping list, keyed by shoppingNameKey.
 * Uses a 24h local cache; respects rate limit by capping to 12 items and
 * spacing calls 180ms apart.
 */
export const fetchObservedForList = async (items = [], { signal, today = dayStamp() } = {}) => {
  const keys = [...new Set(items.map((i) => shoppingNameKey(i.name)).filter(Boolean))].slice(0, 12);
  if (!keys.length) return { byKey: {}, checkedAt: new Date().toISOString(), fromCache: 0, fetched: 0 };

  const cache = loadCache();
  const byKey = {};
  let fromCache = 0;
  let fetched = 0;

  for (const k of keys) {
    if (signal?.aborted) break;
    const name = items.find((i) => shoppingNameKey(i.name) === k)?.name || k;
    const cached = cache[k];
    const fresh = cached && Date.now() - new Date(cached.checkedAt).getTime() < TTL_MS;
    if (fresh && Array.isArray(cached.prices) && cached.prices.length) {
      const cheapest = [...cached.prices].sort((a, b) => a.price - b.price)[0];
      byKey[k] = { ...observedPriceLabel(cheapest), raw: cached.prices, checkedAt: cached.checkedAt, cached: true };
      fromCache += 1;
      continue;
    }
    // fetch by product name (barcode path is used in BarcodeAdd, not list)
    try {
      // eslint-disable-next-line no-await-in-loop -- rate-limit friendly sequential fetch
      const body = await fetchObservedPrice({ query: name.slice(0, 80) }, { signal });
      const prices = Array.isArray(body.prices) ? body.prices : [];
      cache[k] = { prices, sourceLabel: body.sourceLabel || 'Open Prices (community observed)', checkedAt: body.checkedAt || new Date().toISOString() };
      saveCache(cache);
      fetched += 1;
      if (prices.length) {
        const cheapest = [...prices].sort((a, b) => a.price - b.price)[0];
        byKey[k] = { ...observedPriceLabel(cheapest), raw: prices, checkedAt: cache[k].checkedAt, cached: false };
      }
      // small gap to stay under rate limit when the user fetches a whole list
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 180));
    } catch (error) {
      // 401 = not signed in; 429 = rate limited — surface once, don't spam per item
      if (error.status === 401 || error.status === 429) throw error;
      // otherwise keep going — one missing item shouldn't block the rest
      byKey[k] = { error: error.message || 'Observed price unavailable', raw: [], checkedAt: new Date().toISOString() };
    }
  }
  // keep today param for staleness callers even if not used here directly
  void today;
  return { byKey, checkedAt: new Date().toISOString(), fromCache, fetched };
};
