import { describe, expect, it } from 'vitest';
import { thawCandidates, thawPatch } from '../src/lib/thaw-ahead.js';

const day = '2026-10-29';
const recipes = [
  { id: 'r1', name: 'Chilli', ingredients: [{ name: 'beef mince' }, { name: 'onion' }] },
  { id: 'r2', name: 'Curry', ingredients: [{ name: 'chicken thighs' }] },
];
const pantry = [
  { id: 'a', name: 'beef mince', cat: 'Meat', location: 'Freezer', expiry: '2027-01-01' },
  { id: 'b', name: 'chicken thighs', cat: 'Meat', location: 'Fridge' },
  { id: 'c', name: 'onions', cat: 'Fresh', location: 'Freezer' },
];

describe('thaw ahead', () => {
  it('offers only frozen rows a planned meal within two days needs', () => {
    const plan = { '2026-10-30': { dinner: 'r1' }, '2026-10-29': { lunch: 'r2' }, '2026-11-05': { dinner: 'r1' } };
    const rows = thawCandidates({ plan, recipes, pantry, day });
    expect(rows.map((r) => [r.item.id, r.daysAway])).toEqual([['a', 1], ['c', 1]]);
    expect(thawCandidates({ plan: { '2026-11-05': { dinner: 'r1' } }, recipes, pantry, day })).toEqual([]);
  });
  it('thawing sets a short fridge clock, not the freezer date', () => {
    expect(thawPatch(pantry[0], day)).toEqual({ location: 'Fridge', thawedAt: day, frozenAt: null, expiry: '2026-10-31' });
  });
});
