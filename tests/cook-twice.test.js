import { describe, expect, it } from 'vitest';
import { cookTwiceOffers } from '../src/lib/cook-twice.js';

const day = '2026-10-29';
const recipes = [{ id: 'r1', name: 'Chilli', servings: 4 }, { id: 'r2', name: 'Salad', servings: 2 }];

describe('cook once, eat twice', () => {
  it('offers next-day lunch for a dinner that makes two rounds', () => {
    const o = cookTwiceOffers({ plan: { '2026-10-30': { dinner: 'r1' } }, recipes, people: 2, day });
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ cookDate: '2026-10-30', lunchDate: '2026-10-31', extraPortions: 2 });
  });
  it('skips small recipes, taken lunches and dishes already repeated', () => {
    expect(cookTwiceOffers({ plan: { '2026-10-30': { dinner: 'r2' } }, recipes, people: 2, day })).toEqual([]);
    expect(cookTwiceOffers({ plan: { '2026-10-30': { dinner: 'r1' }, '2026-10-31': { lunch: 'r2' } }, recipes, people: 2, day })).toEqual([]);
    expect(cookTwiceOffers({ plan: { '2026-10-30': { dinner: 'r1' }, '2026-11-01': { dinner: 'r1' } }, recipes, people: 2, day })).toEqual([]);
  });
  it('needs enough portions for the household', () => {
    expect(cookTwiceOffers({ plan: { '2026-10-30': { dinner: 'r1' } }, recipes, people: 3, day })).toEqual([]);
  });
});
