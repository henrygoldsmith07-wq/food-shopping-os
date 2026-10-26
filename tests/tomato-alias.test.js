import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';

const r = (id, ing) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ing.map(([name, qty]) => ({ name, qty })) });
const d = ['2026-10-24', '2026-10-25'];
const rows = (a, b) => {
  setMyRecipes([r('a', [a]), r('b', [b])]);
  return shoppingForPlan({ [d[0]]: { dinner: 'a' }, [d[1]]: { dinner: 'b' } }, d, { pantry: [], today: '2026-10-23', people: 2 });
};
describe('tomatoes vs cherry tomatoes', () => {
  it('plain tomatoes are not turned into cherry tomatoes', () => {
    const out = rows(['Tomatoes', '400 g'], ['Tomato', '400 g']);
    expect(out.some((x) => /cherry/i.test(x.name))).toBe(false);
    expect(out.filter((x) => /tomato/i.test(x.name))).toHaveLength(1);
  });
  it('cherry tomatoes stay their own row', () => {
    const out = rows(['Tomatoes', '400 g'], ['Cherry tomatoes', '250 g']);
    expect(out.filter((x) => /tomato/i.test(x.name))).toHaveLength(2);
  });
});
