import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';

const r = (id, ing) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ing.map(([name, qty]) => ({ name, qty })) });
const d = ['2026-10-24', '2026-10-25'];
const rows = (a, b) => {
  setMyRecipes([r('a', [a]), r('b', [b])]);
  return shoppingForPlan({ [d[0]]: { dinner: 'a' }, [d[1]]: { dinner: 'b' } }, d, { pantry: [], today: '2026-10-23', people: 2 });
};
describe('natural vs Greek yogurt', () => {
  it('natural yoghurt is not turned into Greek yogurt, and spellings merge', () => {
    const out = rows(['Natural yoghurt', '150 g'], ['Plain yogurt', '100 g']);
    expect(out.some((x) => /greek/i.test(x.name))).toBe(false);
    expect(out.filter((x) => /yogh?urt/i.test(x.name))).toHaveLength(1);
  });
  it('Greek yogurt stays its own row', () => {
    const out = rows(['Natural yoghurt', '150 g'], ['Greek yogurt', '100 g']);
    expect(out.filter((x) => /yogh?urt/i.test(x.name))).toHaveLength(2);
  });
});
