import { describe, expect, it } from 'vitest';
import { firstItems, firstWhen } from '../src/lib/use-first.js';

const day = '2026-10-29';
const recipes = [
  { id: 'a', name: 'Spinach omelette', ingredients: [{ name: 'spinach' }, { name: 'eggs' }] },
  { id: 'b', name: 'Big spinach pie', ingredients: [{ name: 'spinach' }, { name: 'flour' }, { name: 'butter' }, { name: 'cheese' }] },
  { id: 'c', name: 'Spinach and yoghurt dip', ingredients: [{ name: 'spinach' }, { name: 'yoghurt' }] },
];
const pantry = [
  { id: '1', name: 'Spinach', expiry: '2026-10-30' },
  { id: '2', name: 'Yoghurt', expiry: '2026-11-01' },
  { id: '3', name: 'Rice', expiry: '2027-01-01' },
  { id: '4', name: 'Old milk', expiry: '2026-10-20' },
  { id: '5', name: 'Mystery', expiry: '2026-10-30', confidence: 'unknown' },
];

describe('firstItems', () => {
  it('lists soonest first, skipping far, long-gone and unsure rows', () => {
    const rows = firstItems({ pantry, recipes, day });
    expect(rows.map((r) => r.item.name)).toEqual(['Spinach', 'Yoghurt']);
  });
  it('prefers the recipe that also uses another expiring item', () => {
    const [spinach] = firstItems({ pantry, recipes, day });
    expect(spinach.recipe.id).toBe('c');
    expect(spinach.alsoUses).toEqual(['Yoghurt']);
  });
  it('falls back to the shortest recipe, and null when none uses the item', () => {
    const rows = firstItems({ pantry: [pantry[0]], recipes, day });
    expect(rows[0].recipe.id).toBe('a');
    expect(firstItems({ pantry: [pantry[1]], recipes: [recipes[0]], day })[0].recipe).toBeNull();
  });
  it('caps at three and handles no day', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, name: `Item ${i}`, expiry: '2026-10-31' }));
    expect(firstItems({ pantry: many, recipes: [], day })).toHaveLength(3);
    expect(firstItems({ pantry, recipes })).toEqual([]);
  });
  it('words the day', () => {
    expect([0, 1, 3].map(firstWhen)).toEqual(['today', 'tomorrow', 'in 3 days']);
  });
});
