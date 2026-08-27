/**
 * A catalogue of real products at real shops, built from checks that happened.
 *
 * The obvious way to build this would be to crawl every UK grocer and store
 * their whole range. That is not on the table, and not only because the shops'
 * robots.txt files forbid it: a full catalogue extraction is a different act
 * from looking up the eight things on someone's list, at a scale that would
 * get this app's traffic blocked, and the resulting file would be a copy of
 * somebody's database rather than a record of anything the user did. It would
 * also be wrong within days, because it would be a snapshot of prices frozen
 * into a source file.
 *
 * So this grows the other way round: every live check the user runs already
 * visits several shops and reads each one's own product name, pack size and
 * price. That was being reduced to a single cheapest number and thrown away.
 * Kept instead, it accumulates into exactly the thing worth having — the same
 * product across several shops, with what each calls it, what size each sells,
 * what each charges, and what that works out at per unit.
 *
 * The per-unit figure is the point. "Tesco £1.45, Aldi £0.85" says Aldi is
 * cheaper and is useless: the Tesco bottle is 2.27L and the Aldi one is 1.13L,
 * so Tesco is 64p a litre against Aldi's 75p. A price comparison without pack
 * sizes gets the answer backwards, and gets it backwards most often on exactly
 * the products people buy every week.
 *
 * Every row is dated and attributed to the shop it was read from. Nothing here
 * is a quote, an average, or a national price — it is what one shop's page
 * said on one day, which is the only thing this app is ever in a position to
 * claim.
 */

import { shoppingNameKey } from './shopping.js';
import { compareUnitPrices, unitPriceOf } from './measure.js';

const STORAGE_KEY = 'forq.productCatalogue.v1';
/** Products kept. Beyond this the least recently seen fall off. */
const MAX_PRODUCTS = 400;

const today = (date = new Date()) => date.toISOString().slice(0, 10);

const read = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
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
    // Quota or private browsing. The catalogue is an accumulation of things
    // that can be observed again; losing it costs a re-check, not data.
  }
};

export const loadProductCatalogue = () => read();

export const clearProductCatalogue = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear is the same outcome as a cleared store.
  }
};

const prune = (store) => {
  const keys = Object.keys(store);
  if (keys.length <= MAX_PRODUCTS) return store;
  const kept = keys
    .map((key) => ({ key, seen: store[key]?.lastSeen || '' }))
    .sort((a, b) => b.seen.localeCompare(a.seen))
    .slice(0, MAX_PRODUCTS)
    .map((entry) => entry.key);
  return Object.fromEntries(kept.map((key) => [key, store[key]]));
};

/**
 * Fold one checked item into the catalogue.
 *
 * One row per shop, replaced rather than appended: this is a catalogue of what
 * each shop sells, not a price history — that already exists next door, and
 * two stores of the same observations would drift apart.
 */
export const recordProduct = (store, name, entry, date = today()) => {
  const key = shoppingNameKey(name);
  const rows = entry?.perRetailer || [];
  if (!key || !rows.length) return store;

  const existing = store[key] || { name, firstSeen: date, shops: {} };
  const shops = { ...existing.shops };
  for (const row of rows) {
    if (typeof row?.price !== 'number' || row.price <= 0 || !row.retailerId) continue;
    shops[row.retailerId] = {
      retailer: row.retailer || row.retailerId,
      // What the shop itself calls it, kept apart from what the shopper calls
      // it. "Milk" is the request; "Tesco British Semi Skimmed Milk 2.27L" is
      // the product, and only the second one identifies what was priced.
      productName: row.name || null,
      amount: row.packSize || null,
      price: Math.round(row.price * 100) / 100,
      method: row.method || null,
      url: row.url || null,
      seenAt: date,
    };
  }
  if (!Object.keys(shops).length) return store;
  return {
    ...store,
    [key]: {
      name: existing.name || name,
      firstSeen: existing.firstSeen || date,
      lastSeen: date,
      shops,
    },
  };
};

/** Persist a whole run of checks in one write. */
export const recordProducts = (byKey = {}, { date = today() } = {}) => {
  let store = read();
  for (const entry of Object.values(byKey)) {
    if (!entry?.name || entry.error) continue;
    store = recordProduct(store, entry.name, entry, date);
  }
  write(prune(store));
  return store;
};

/**
 * One product across its shops, ranked by what it actually costs per unit.
 *
 * `compareUnitPrices` does the ranking, which matters for one reason: it
 * refuses to rank across scales. Six eggs and 500g of eggs are both eggs and
 * neither is cheaper than the other, so a mixed set comes back flagged rather
 * than ordered by a number that would mean nothing.
 */
export const productRows = (entry) => {
  const rows = Object.entries(entry?.shops || {}).map(([retailerId, shop]) => ({
    retailerId,
    retailer: shop.retailer,
    productName: shop.productName,
    amount: shop.amount,
    price: shop.price,
    qty: shop.amount,
    url: shop.url,
    method: shop.method,
    seenAt: shop.seenAt,
    unit: unitPriceOf(shop.price, shop.amount, { ingredient: entry?.name }),
  }));
  const comparison = compareUnitPrices(rows, { ingredient: entry?.name });
  const byPrice = [...rows].sort((a, b) => a.price - b.price);
  return {
    name: entry?.name || null,
    shops: rows.length,
    // Cheapest by ticket price and cheapest per unit are different questions,
    // and the gap between the two answers is the whole reason to keep sizes.
    cheapest: byPrice[0] || null,
    bestValue: comparison.mixedScales ? null : comparison.best || null,
    ranked: comparison.mixedScales ? byPrice : comparison.ranked,
    mixedScales: comparison.mixedScales,
    // True when the cheapest ticket is not the best value — the case a
    // price-only comparison gets exactly backwards.
    ticketMisleads: Boolean(
      !comparison.mixedScales
      && comparison.best
      && byPrice[0]
      && comparison.best.retailerId !== byPrice[0].retailerId,
    ),
    margin: comparison.mixedScales ? null : comparison.margin,
    unpriceable: comparison.incomparable.length,
    lastSeen: entry?.lastSeen || null,
  };
};

/** Products seen at more than one shop — the ones worth comparing at all. */
export const crossShopProducts = (store = {}) => Object.entries(store)
  .map(([key, entry]) => ({ key, ...productRows(entry) }))
  .filter((row) => row.shops > 1)
  .sort((a, b) => b.shops - a.shops || String(a.name).localeCompare(String(b.name)));

/** How much of a catalogue this is yet, said plainly. */
export const catalogueStats = (store = {}) => {
  const entries = Object.values(store);
  const retailers = new Set();
  let rows = 0;
  let comparable = 0;
  for (const entry of entries) {
    const shops = Object.keys(entry?.shops || {});
    rows += shops.length;
    for (const id of shops) retailers.add(id);
    if (shops.length > 1) comparable += 1;
  }
  return {
    products: entries.length,
    rows,
    retailers: retailers.size,
    comparable,
    lastSeen: entries.map((entry) => entry?.lastSeen || '').sort().at(-1) || null,
  };
};
