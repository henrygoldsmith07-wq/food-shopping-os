import { describe, expect, it } from 'vitest';
import { firstSessionPlan, QUICK_START_DEFAULTS } from '../src/lib/onboarding-quick-start.js';

describe('onboarding quick start', () => {
  it('keeps the setup defaults small and explicit', () => {
    expect(Object.keys(QUICK_START_DEFAULTS)).toEqual([
      'household', 'weeklyBudget', 'shoppingDay', 'typicalCookingMinutes', 'shops', 'favouriteMeals', 'dislikedFoods',
    ]);
  });

  it('creates a first plan and one deduplicated shopping list from selected meals', () => {
    const recipes = [
      { id: 'curry', name: 'Curry', meal: 'dinner', ingredients: [{ name: 'Rice', qty: '300 g' }, { name: 'Onion', qty: '1' }] },
      { id: 'rice-bowl', name: 'Rice bowl', meal: 'dinner', ingredients: [{ name: 'Rice', qty: '200 g' }, { name: 'Eggs', qty: '4' }] },
    ];
    const result = firstSessionPlan({ day: '2026-08-28', recipes, pickedRecipeIds: ['curry', 'rice-bowl'], household: 2 });
    expect(Object.keys(result.plan)).toEqual(['2026-08-28', '2026-08-29']);
    expect(result.shoppingList.map((item) => item.name)).toEqual(['Rice', 'Onion', 'Eggs']);
    expect(result.summary).toMatch(/2 meals planned/);
  });
});
