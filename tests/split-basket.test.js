import { describe, expect, it } from 'vitest';
import { splitBasket } from '../src/lib/split-basket.js';

const m = (name, price) => ({ name, price });
const row = (store, items, extra = {}) => ({
  store, total: items.reduce((s, i) => s + i.price, 0) + (extra.travel || 0), matchedItems: items, unavailableItems: [], complete: true, delivery: 0, travel: 0, ...extra,
});

describe('splitBasket', () => {
  const a = row('Tesco', [m('milk', 1.5), m('rice', 6), m('eggs', 3)]);
  const b = row('Aldi', [m('milk', 1.2), m('rice', 2.5), m('eggs', 3.4)]);
  it('sends each item to its cheapest store when the saving is real', () => {
    const s = splitBasket([a, b], { minSaving: 0.1 });
    expect(s.worthIt).toBe(true);
    expect(s.single).toEqual({ store: 'Aldi', total: 7.1 });
    expect(s.stops.find((x) => x.store === 'Tesco').items.map((i) => i.name)).toEqual(['eggs']);
    expect(s.total).toBe(6.7);
  });
  it('is not worth it under the minimum saving', () => {
    expect(splitBasket([a, b]).worthIt).toBe(false);
  });
  it('counts travel per store', () => {
    const c = row('Aldi', b.matchedItems, { travel: 1.5 });
    const s = splitBasket([a, c], { minSaving: 0.1 });
    expect(s.single.total).toBe(8.6);
    expect(s.total).toBe(8.2);
  });
  it('folds a tiny stop back and never offers a split with unmatched items', () => {
    const t = row('Tesco', [m('milk', 0.4), m('rice', 6), m('eggs', 4)]);
    const u = row('Aldi', [m('milk', 0.9), m('rice', 3), m('eggs', 3)]);
    expect(splitBasket([t, u]).stops).toHaveLength(1);
    const g = splitBasket([a, row('Aldi', [m('milk', 1)], { complete: false, unavailableItems: ['bread'] })]);
    expect(g.worthIt).toBe(false);
  });
  it('needs two stores', () => { expect(splitBasket([a]).worthIt).toBe(false); });
});
