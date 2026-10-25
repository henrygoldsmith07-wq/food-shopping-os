import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';
import { mergeQtys } from '../src/lib/pantry.js';

const recipe = (id, ingredients) => ({
  id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ingredients.map(([name, qty]) => ({ name, qty })),
});
const dates = ['2026-10-24', '2026-10-25'];
const list = (a, b, pantry = []) => {
  setMyRecipes([a, b]);
  return shoppingForPlan({ [dates[0]]: { dinner: a.id }, [dates[1]]: { dinner: b.id } }, dates, { pantry, today: '2026-10-23', people: 2 });
};

describe('weight and cup/spoon amounts of the same staple become one row', () => {
  it('merges 100 g and 1 cup grated cheddar into one weight', () => {
    const rows = list(recipe('d1', [['Cheddar', '100 g']]), recipe('d2', [['Cheddar cheese', '1 cup grated']]));
    expect(rows.filter((r) => /cheddar/i.test(r.name))).toHaveLength(1);
    expect(rows[0].qty).toBe('215 g');
  });
  it('merges flour in g and cups without a "+"', () => {
    expect(mergeQtys('500 g', '1 cup', { ingredient: 'plain flour' })).not.toContain('+');
  });
  it('keeps unknown-density items separate rather than guess', () => {
    expect(mergeQtys('200 g', '1 cup', { ingredient: 'spinach' })).toBe('200 g + 1 cup');
  });
  it('a pantry bag in grams covers a recipe cup of flour', () => {
    const rows = list(recipe('d3', [['Plain flour', '1 cup']]), recipe('d4', [['Plain flour', '1 tbsp']]),
      [{ id: 'p', name: 'Plain flour', qty: '1 kg', confidence: 'definite', lastConfirmedAt: '2026-10-23' }]);
    expect(rows.some((r) => /flour/i.test(r.name))).toBe(false);
  });
});

describe('mixed weight and cup amounts add up in grams', () => {
  it('flour: 1 cup then 100 g is one gram figure, not millilitres', () => {
    const m = mergeQtys('1 cup', '100 g', { ingredient: 'plain flour' });
    expect(m).toMatch(/\bg$/);
    expect(m).not.toContain('ml');
    expect(m).not.toContain('+');
  });
  it('butter sums are whole grams', () => {
    expect(mergeQtys('50 g', '1 tbsp', { ingredient: 'butter' })).toMatch(/^\d+ g$/);
  });
});
