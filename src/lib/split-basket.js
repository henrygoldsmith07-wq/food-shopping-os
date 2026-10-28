const round2 = (n) => Math.round(n * 100) / 100;
const MIN_SAVING = 2; // a split must save at least this much to be worth a second trip
const MIN_PER_STORE = 1; // a store that supplies one cheap item is not worth a trip

/**
 * Split the list across stores using only priced, equivalent matches.
 *
 * Takes the rows from compareBaskets/optimiseLiveBasket. Each item goes to the
 * store where its matched line is cheapest. A store whose share is under
 * MIN_PER_STORE is folded back into the best single store, and stores are
 * capped at maxStores (the smallest shares merge back first). Travel/delivery
 * per store is added to the split, so the split only wins when it still saves
 * minSaving over the best single complete store. Items no store matched are
 * never guessed; a split with any of them is not offered.
 */
export const splitBasket = (rows = [], { maxStores = 2, minSaving = MIN_SAVING } = {}) => {
  const stores = (Array.isArray(rows) ? rows : []).filter((r) => r?.store && Array.isArray(r.matchedItems));
  const none = { worthIt: false, stops: [], total: 0, single: null, saving: 0, unplaced: [] };
  if (stores.length < 2) return none;
  const single = stores.filter((r) => r.complete).sort((a, b) => a.total - b.total)[0] || null;
  const perItem = new Map();
  for (const row of stores) {
    for (const m of row.matchedItems) {
      const cur = perItem.get(m.name);
      if (!cur || m.price < cur.price) perItem.set(m.name, { ...m, store: row.store });
    }
  }
  const everyItem = new Set();
  stores.forEach((r) => {
    r.matchedItems.forEach((m) => everyItem.add(m.name));
    (r.unavailableItems || []).forEach((n) => everyItem.add(n));
  });
  const unplaced = [...everyItem].filter((n) => !perItem.has(n));
  const fee = (store) => {
    const r = stores.find((x) => x.store === store);
    return (r?.delivery || 0) + (r?.travel || 0);
  };
  const groups = new Map();
  for (const line of perItem.values()) {
    if (!groups.has(line.store)) groups.set(line.store, []);
    groups.get(line.store).push(line);
  }
  const sum = (lines) => lines.reduce((s, l) => s + l.price, 0);
  const fallback = single?.store || [...groups.keys()][0];
  const fold = (store) => {
    const lines = groups.get(store) || [];
    groups.delete(store);
    const dest = groups.get(fallback) || [];
    for (const l of lines) {
      const own = stores.find((r) => r.store === fallback)?.matchedItems.find((m) => m.name === l.name);
      if (own) dest.push({ ...own, store: fallback });
      else unplaced.push(l.name);
    }
    groups.set(fallback, dest);
  };
  for (const [store, lines] of [...groups]) if (store !== fallback && sum(lines) < MIN_PER_STORE) fold(store);
  while (groups.size > Math.max(1, maxStores)) {
    const smallest = [...groups].filter(([s]) => s !== fallback).sort((a, b) => sum(a[1]) - sum(b[1]))[0];
    if (!smallest) break;
    fold(smallest[0]);
  }
  const stops = [...groups].map(([store, lines]) => ({
    store, items: lines.sort((a, b) => a.name.localeCompare(b.name)), subtotal: round2(sum(lines)), fee: round2(fee(store)),
  })).sort((a, b) => b.subtotal - a.subtotal);
  const total = round2(stops.reduce((s, x) => s + x.subtotal + x.fee, 0));
  const saving = single ? round2(single.total - total) : 0;
  const worthIt = Boolean(single) && stops.length > 1 && !unplaced.length && saving >= minSaving;
  return { worthIt, stops, total, single: single ? { store: single.store, total: single.total } : null, saving, unplaced };
};
