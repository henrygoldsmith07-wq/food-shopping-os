/**
 * A record of what shops charged, built up one check at a time.
 *
 * The live price check answers "what does this cost now". Asking it repeatedly
 * over weeks answers something more useful — whether a thing is getting dearer,
 * and which shop is consistently cheapest rather than cheapest today. That only
 * works if each check is kept, so this appends every result to a local history.
 *
 * It is deliberately on-device. These are prices the user asked for, tied to
 * their shopping list, and there is no reason for them to leave the device to
 * be drawn as a line.
 *
 * One observation per item, per shop, per day: checking five times in an
 * afternoon should not draw five points and call it a trend. The latest check
 * of a day wins, because it is the most current answer for that day.
 */

import { shoppingNameKey } from './shopping.js';

const STORAGE_KEY = 'forq.livePriceHistory.v1';
/** Points per item. A year of daily checks, then the oldest fall off. */
const MAX_POINTS = 365;
/** Items tracked. Beyond this the least recently seen are dropped. */
const MAX_ITEMS = 200;

const today = (date = new Date()) => date.toISOString().slice(0, 10);

const read = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const write = (store) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota or private browsing. History is a nicety; losing it is survivable.
  }
};

export const clearLivePriceHistory = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear is the same outcome as a cleared store.
  }
};

/** Drop the least recently seen items once the store is over its cap. */
const prune = (store) => {
  const keys = Object.keys(store);
  if (keys.length <= MAX_ITEMS) return store;
  const ranked = keys
    .map((key) => ({ key, seen: store[key]?.points?.at(-1)?.date || '' }))
    .sort((a, b) => b.seen.localeCompare(a.seen))
    .slice(0, MAX_ITEMS)
    .map((entry) => entry.key);
  return Object.fromEntries(ranked.map((key) => [key, store[key]]));
};

/**
 * Fold one checked item into the history.
 *
 * `entry` is what `checkLivePricesForList` produces: a best row and the
 * cheapest row per shop. A check that found nothing records nothing — an empty
 * point would draw a line through a day we have no price for, which is worse
 * than a gap.
 */
export const recordLivePriceCheck = (store, name, entry, date = today()) => {
  const key = shoppingNameKey(name);
  const rows = entry?.perRetailer || [];
  if (!key || !rows.length) return store;
  const shops = {};
  for (const row of rows) {
    if (typeof row?.price !== 'number' || !row.retailerId) continue;
    shops[row.retailerId] = { price: row.price, retailer: row.retailer || row.retailerId };
  }
  if (!Object.keys(shops).length) return store;

  const existing = store[key] || { name, points: [] };
  const best = Math.min(...Object.values(shops).map((shop) => shop.price));
  const point = { date, shops, best: Math.round(best * 100) / 100 };
  // Same day replaces rather than appends: the newest check is the day's answer.
  const points = [...existing.points.filter((row) => row.date !== date), point]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_POINTS);
  return { ...store, [key]: { name, points } };
};

/** Persist a whole run of checks in one write. */
export const recordLivePrices = (byKey = {}, { date = today() } = {}) => {
  let store = read();
  for (const entry of Object.values(byKey)) {
    if (!entry?.name || entry.error) continue;
    store = recordLivePriceCheck(store, entry.name, entry, date);
  }
  write(prune(store));
  return store;
};

export const loadLivePriceHistory = () => read();

/** Everything charted for one item, or null when there is nothing to chart. */
export const historyFor = (store, name) => {
  const key = shoppingNameKey(name);
  const entry = key ? store?.[key] : null;
  return entry?.points?.length ? entry : null;
};

/**
 * The item's cheapest price on each day it was checked — the headline series.
 *
 * One series, so it needs no legend and no colour to identify it, which is
 * what lets it sit inside a deliberately monochrome chart system.
 */
export const bestPriceSeries = (entry) =>
  (entry?.points || []).map((point) => ({
    date: point.date,
    price: point.best,
    shop: Object.values(point.shops)
      .sort((a, b) => a.price - b.price)[0]?.retailer || null,
  }));

/**
 * One series per shop, for small multiples.
 *
 * Small multiples rather than one chart with a line per shop: with a
 * three-shade ink ramp, six overlapping lines are indistinguishable however
 * they are labelled. A grid of little charts, each captioned with its shop, is
 * readable at any number of shops and needs no palette at all.
 */
export const shopSeries = (entry, { minPoints = 1 } = {}) => {
  const points = entry?.points || [];
  const shops = new Map();
  for (const point of points) {
    for (const [retailerId, shop] of Object.entries(point.shops || {})) {
      if (!shops.has(retailerId)) {
        shops.set(retailerId, { retailerId, retailer: shop.retailer, points: [] });
      }
      shops.get(retailerId).points.push({ date: point.date, price: shop.price });
    }
  }
  return [...shops.values()]
    .filter((shop) => shop.points.length >= minPoints)
    .map((shop) => {
      const prices = shop.points.map((row) => row.price);
      const first = prices[0];
      const latest = prices.at(-1);
      return {
        ...shop,
        latest,
        first,
        min: Math.min(...prices),
        max: Math.max(...prices),
        average: Math.round((prices.reduce((sum, value) => sum + value, 0) / prices.length) * 100) / 100,
        change: prices.length > 1 ? Math.round((latest - first) * 100) / 100 : null,
        changePct: prices.length > 1 && first > 0
          ? Math.round(((latest - first) / first) * 1000) / 10
          : null,
      };
    })
    .sort((a, b) => a.average - b.average);
};

/** Movement in the item's best price since the first check. */
export const priceTrend = (entry) => {
  const series = bestPriceSeries(entry);
  if (series.length < 2) {
    return { direction: 'unknown', label: 'Checked once — check again to see a trend.', change: null, pct: null };
  }
  const first = series[0].price;
  const latest = series.at(-1).price;
  const change = Math.round((latest - first) * 100) / 100;
  const pct = first > 0 ? Math.round(((latest - first) / first) * 1000) / 10 : null;
  if (change === 0) return { direction: 'flat', label: 'No change since the first check.', change, pct };
  const span = `${series.length} checks`;
  return {
    direction: change > 0 ? 'up' : 'down',
    label: change > 0
      ? `Up ${Math.abs(pct)}% across ${span}.`
      : `Down ${Math.abs(pct)}% across ${span}.`,
    change,
    pct,
  };
};

/**
 * Which shop has been cheapest most often, across every check kept.
 *
 * "Cheapest today" is one sample and can be a promotion; this is the question
 * a shopper actually wants answered before deciding where to go.
 */
export const cheapestShopOverall = (entry) => {
  const wins = new Map();
  for (const point of entry?.points || []) {
    const rows = Object.entries(point.shops || {});
    if (!rows.length) continue;
    const [retailerId, shop] = rows.sort((a, b) => a[1].price - b[1].price)[0];
    const row = wins.get(retailerId) || { retailerId, retailer: shop.retailer, wins: 0 };
    row.wins += 1;
    wins.set(retailerId, row);
  }
  const ranked = [...wins.values()].sort((a, b) => b.wins - a.wins);
  const total = (entry?.points || []).length;
  return ranked.length ? { ...ranked[0], of: total } : null;
};
