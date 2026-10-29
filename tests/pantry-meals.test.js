import { describe, expect, it } from 'vitest';
import { pantryMealSuggestions } from '../src/lib/pantry-meals.js';

const day = '2026-10-29';
const row = (name, extra = {}) => ({ id: name, name, confidence: 'definite', lastConfirmedAt: day, ...extra });
const pantry = ['pasta', 'tomatoes', 'garlic', 'basil'].map((n) => row(n));
const recipes = [
  { id: 'a', name: 'Tomato pasta', ingredients: [{ name: 'pasta' }, { name: 'tomatoes' }, { name: 'garlic' }] },
  { id: 'b', name: 'Pesto pasta', ingredients: [{ name: 'pasta' }, { name: 'basil' }, { name: 'garlic' }, { name: 'pine nuts' }] },
  { id: 'c', name: 'Beef stew', ingredients: [{ name: 'beef' }, { name: 'carrots' }, { name: 'garlic' }, { name: 'stock' }] },
];

describe('pantryMealSuggestions', () => {
  it('offers recipes missing at most one ingredient, complete ones first', () => {
    const out = pantryMealSuggestions({ recipes, pantry, plan: {}, day });
    expect(out.map((o) => o.recipe.id)).toEqual(['a', 'b']);
    expect(out[1].missing).toEqual(['pine nuts']);
    expect(out[0].tonight).toBe(true);
    expect(out[1].date).toBe('2026-10-30');
  });
  it('skips planned recipes and taken nights', () => {
    const out = pantryMealSuggestions({ recipes, pantry, plan: { [day]: { dinner: 'a' } }, day });
    expect(out.map((o) => o.recipe.id)).toEqual(['b']);
    expect(out[0].date).toBe('2026-10-30');
  });
  it('ignores stock of unknown confidence', () => {
    const guess = pantry.map((p) => ({ ...p, confidence: 'unknown' }));
    expect(pantryMealSuggestions({ recipes, pantry: guess, plan: {}, day })).toEqual([]);
  });
  it('returns nothing without a day or recipes', () => {
    expect(pantryMealSuggestions({ recipes: [], pantry, day })).toEqual([]);
    expect(pantryMealSuggestions({ recipes, pantry, day: '' })).toEqual([]);
  });
});
