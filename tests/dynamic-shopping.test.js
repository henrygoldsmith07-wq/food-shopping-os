import { describe, expect, it } from 'vitest';
import { deriveDynamicShoppingList } from '../src/lib/dynamic-shopping.js';

describe('dynamic shopping list', () => {
  it('keeps manual items and derives missing planned ingredients', () => {
    const recipe = { id: 'r1', name: 'Pasta', servings: 2, ingredients: [{ name: 'Tomatoes', qty: '400 g' }] };
    const result = deriveDynamicShoppingList({ day: '2026-08-27', plan: { '2026-08-27': { dinner: 'r1' } }, pantry: [], shoppingList: [{ id: 'm', name: 'Tea', qty: '1 box' }], requestedShopping: [], recipes: [recipe] });
    expect(result.some((row) => row.name === 'Tea')).toBe(true);
    expect(result.find((row) => row.name === 'Tea').shoppingExplanation.reasons).toContain('Added by you');
  });
  it('does not retain an auto item when its meal is no longer planned', () => {
    const result = deriveDynamicShoppingList({ day: '2026-08-27', plan: {}, pantry: [], shoppingList: [{ id: 's', name: 'Tomatoes', fromRecipe: 'Pasta', autoListed: true }], requestedShopping: [] });
    expect(result.some((row) => row.name === 'Tomatoes')).toBe(false);
  });
});
