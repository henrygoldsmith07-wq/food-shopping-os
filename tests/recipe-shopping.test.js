import { describe, expect, it } from 'vitest';
import { pantryReadForRecipeIngredient, shoppingItemsForRecipe } from '../src/lib/recipe-shopping.js';

const recipe = {
  id: 'r1',
  name: 'Rice bowl',
  ingredients: [
    { name: 'Rice', qty: '300 g' },
    { name: 'Chopped tomatoes', qty: '1 tin' },
  ],
};

describe('single-recipe shopping hand-off', () => {
  it('adds only the measured pantry shortfall', () => {
    const rows = shoppingItemsForRecipe(recipe, [
      { id: 'p1', name: 'Rice', qty: '100 g', confidence: 'definite' },
    ], { today: '2026-09-22' });
    expect(rows.find((row) => row.name === 'Rice')).toMatchObject({
      qty: '200 g', requiredQty: '300 g', pantryQty: '100 g', shortfallQty: '200 g',
    });
  });

  it('uses aliases when deciding an ingredient is already covered', () => {
    const rows = shoppingItemsForRecipe(recipe, [
      { id: 'p1', name: 'tin tomatoes', qty: '1 tin', confidence: 'definite' },
    ], { today: '2026-09-22' });
    expect(rows.some((row) => row.name === 'Chopped tomatoes')).toBe(false);
  });

  it('does not subtract a quantity whose pantry confidence is unknown', () => {
    const ingredient = { name: 'Rice', qty: '300 g' };
    const read = pantryReadForRecipeIngredient(ingredient, [
      { id: 'p1', name: 'Rice', qty: '250 g', confidence: 'unknown' },
    ], { today: '2026-09-22' });
    expect(read.availableQty).toBe('');
    expect(read.shortfallQty).toBe('300 g');
    expect(read.sufficient).toBe(false);
  });
});
