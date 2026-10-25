import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';

const r = (id, ing) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ing.map(([name, qty]) => ({ name, qty })) });
const d = ['2026-10-24', '2026-10-25'];
const run = (a, b) => {
  setMyRecipes([r('a', a), r('b', b)]);
  return shoppingForPlan({ [d[0]]: { dinner: 'a' }, [d[1]]: { dinner: 'b' } }, d, { pantry: [], today: '2026-10-23', people: 2 });
};
describe('same product, different wording is one row', () => {
  it('mince beef and beef mince add up', () => {
    const rows = run([['Mince beef', '500 g']], [['Beef mince', '250 g']]).filter((x) => /mince|beef/i.test(x.name));
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).not.toContain('+');
  });
  it('tomato and tomatoes are one row', () => {
    const rows = run([['Tomato', '2']], [['Tomatoes', '400 g']]).filter((x) => /tomato/i.test(x.name));
    expect(rows).toHaveLength(1);
  });
});
