/**
 * What a thing costs, according to your own receipts and the offers you
 * entered yourself.
 *
 * There is no price feed behind any of this. Every figure comes from a shop
 * the user recorded, which is why a store with no history for an item is
 * reported as uncovered rather than quietly skipped, and why an item nobody
 * has ever bought has no price at all instead of an estimate. Offers are the
 * same: the app knows about a deal because someone typed it in.
 *
 * Split out of shopping.js to keep both readable; the whole surface is still
 * re-exported from there, so callers import from `shopping.js` as before.
 */

import { priceHistory } from './kitchen.js';

const key = (name) => String(name || '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- Price comparison, from your own receipts ---------- */

/** The cheapest you have ever paid for something, and where. */
export const cheapestFor = (name, history = []) => {
  const entry = history.find((h) => key(h.name) === key(name));
  if (!entry) return null;
  return { price: entry.best, store: entry.bestStore, times: entry.times, latest: entry.latest };
};

/** What you last paid for something at one particular shop. */
const priceAt = (entry, store) => {
  const points = entry.points.filter((p) => p.store === store);
  return points.length ? points[points.length - 1].price : null;
};

/**
 * What this list would cost at each shop you've been to, using the prices you
 * recorded there. `covered` is how many items that shop can actually price —
 * a total built from two known prices is not a comparison, and says so.
 */
export const compareStores = (items = [], shops = []) => {
  const history = priceHistory(shops);
  const stores = [...new Set(shops.map((s) => s.store))];
  return stores
    .map((store) => {
      let total = 0;
      let covered = 0;
      for (const item of items) {
        const entry = history.find((h) => key(h.name) === key(item.name));
        const price = entry ? priceAt(entry, store) : null;
        if (price === null) continue;
        covered += 1;
        total += price;
      }
      return { store, total: round2(total), covered, of: items.length };
    })
    .filter((row) => row.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.total - b.total);
};

/** Items on the list you have bought cheaper somewhere else. */
export const savingsAvailable = (items = [], shops = []) => {
  const history = priceHistory(shops);
  return items
    .map((item) => {
      const best = cheapestFor(item.name, history);
      if (!best || !item.price || best.price >= item.price) return null;
      return { name: item.name, paying: item.price, best: best.price, store: best.store, saving: round2(item.price - best.price) };
    })
    .filter(Boolean)
    .sort((a, b) => b.saving - a.saving);
};

export const priceAlertMatches = (alerts = [], shops = []) => {
  const history = priceHistory(shops);
  return alerts.map((alert) => {
    const item = history.find((entry) => key(entry.name) === key(alert.name));
    const latestByStore = new Map();
    item?.points.forEach((point) => latestByStore.set(point.store, point));
    const bestCurrent = [...latestByStore.values()].sort((a, b) => a.price - b.price)[0] || null;
    const latest = bestCurrent?.price ?? null;
    return {
      ...alert,
      latest,
      hit: latest !== null && latest <= Number(alert.target),
      store: bestCurrent?.store || null,
    };
  });
};

/* ---------- Offers you told it about ---------- */

export const OFFER_KINDS = [
  { id: 'money', label: '£ off', hint: '£1.00 off' },
  { id: 'percent', label: '% off', hint: '25% off' },
  { id: 'multibuy', label: 'Multibuy', hint: '3 for 2' },
];

const matches = (item, offer) => {
  const term = key(offer.match || offer.label);
  return term ? key(item.name).includes(term) : false;
};

/**
 * Apply the offers you've entered to a list. Only your own offers exist here —
 * the app has no deals feed and never invents one.
 */
export const applyOffers = (items = [], offers = [], { store = '', today = '' } = {}) => {
  const lines = [];
  let saved = 0;
  const hasStoreAssignments = items.some((item) => item.store);
  for (const offer of offers) {
    if (offer.store && store && key(offer.store) !== key(store)) continue;
    if (offer.expiry && today && offer.expiry < today) continue;
    const hits = items.filter((i) => matches(i, offer)
      && (!offer.store || !hasStoreAssignments || key(i.store) === key(store || offer.store)));
    if (!hits.length) continue;
    const spend = hits.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
    let off = 0;
    if (offer.kind === 'money') off = Math.min(spend, Number(offer.value) || 0);
    else if (offer.kind === 'percent') off = spend * (Math.min(100, Number(offer.value) || 0) / 100);
    else if (offer.kind === 'multibuy') {
      // "3 for 2": every third matching item is free, cheapest first.
      const group = Math.max(2, Number(offer.value) || 3);
      const prices = hits.map((i) => Number(i.price) || 0).sort((a, b) => a - b);
      const free = Math.floor(prices.length / group);
      off = prices.slice(0, free).reduce((sum, p) => sum + p, 0);
    }
    off = round2(off);
    if (off <= 0 && offer.kind !== 'multibuy') continue;
    saved += off;
    lines.push({ offer, items: hits.map((i) => i.name), saved: off });
  }
  return { lines, saved: round2(saved) };
};
