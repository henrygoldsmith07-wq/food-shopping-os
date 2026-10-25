import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';

const r = (id, ing) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ing.map(([name, qty]) => ({ name, qty })) });
const d = ['2026-10-24', '2026-10-25'];
describe('cream names are one shopping row', () => {
  it('double, heavy and plain cream merge', () => {
    setMyRecipes([r('a', [['Double cream', '150 ml']]), r('b', [['Cream', '100 ml']]), r('c', [['Heavy cream', '50 ml']])]);
    const rows = shoppingForPlan({ [d[0]]: { dinner: 'a', lunch: 'c' }, [d[1]]: { dinner: 'b' } }, d, { pantry: [], today: '2026-10-23', people: 2 });
    const cream = rows.filter((x) => /cream/i.test(x.name));
    expect(cream).toHaveLength(1);
    expect(cream[0].qty).not.toContain('+');
  });
  it('single cream stays its own product', () => {
    setMyRecipes([r('a', [['Double cream', '150 ml']]), r('b', [['Single cream', '100 ml']])]);
    const rows = shoppingForPlan({ [d[0]]: { dinner: 'a' }, [d[1]]: { dinner: 'b' } }, d, { pantry: [], today: '2026-10-23', people: 2 });
    expect(rows.filter((x) => /cream/i.test(x.name))).toHaveLength(2);
  });
});
