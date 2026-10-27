import { describe, expect, it } from 'vitest';
import { shopLocationMap, shopLocationPlan, suggestShopLocation } from '../src/lib/shop-locations.js';

const row = (id, name, extra = {}) => ({ id, name, qty: '1', checked: true, ...extra });

describe('where bought groceries go', () => {
  it('suggests fridge, freezer or cupboard from name and aisle', () => {
    expect(suggestShopLocation({ name: 'Semi-skimmed milk' })).toBe('Fridge');
    expect(suggestShopLocation({ name: 'Frozen peas' })).toBe('Freezer');
    expect(suggestShopLocation({ name: 'Basmati rice' })).toBe('Cupboard');
    expect(suggestShopLocation({ name: 'Mystery', aisle: 'Frozen' })).toBe('Freezer');
  });
  it('applies overrides, counts per place and ignores unticked rows', () => {
    const items = [row('a', 'Milk'), row('b', 'Rice'), row('c', 'Eggs', { checked: false })];
    const plan = shopLocationPlan(items, { b: 'Freezer', a: 'Nowhere' });
    expect(plan.rows.map((r) => [r.id, r.location, r.changed])).toEqual([['a', 'Fridge', false], ['b', 'Freezer', true]]);
    expect(plan.counts).toEqual({ Fridge: 1, Freezer: 1, Cupboard: 0 });
    expect(shopLocationMap(items, { b: 'Freezer' })).toEqual({ a: 'Fridge', b: 'Freezer' });
  });
});
