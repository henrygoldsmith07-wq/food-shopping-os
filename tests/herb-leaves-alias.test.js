import { expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';
const r = (id, ing) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ing.map(([name, qty]) => ({ name, qty })) });
const d = ['2026-10-24', '2026-10-25'];
it('herb "leaves" wordings merge into one row', () => {
  setMyRecipes([r('a', [['Fresh basil', '10 g'], ['Parsley leaves', '10 g']]), r('b', [['Basil leaves', '1 handful'], ['Parsley', '1 bunch']])]);
  const rows = shoppingForPlan({ [d[0]]: { dinner: 'a' }, [d[1]]: { dinner: 'b' } }, d, { pantry: [], today: '2026-10-23', people: 2 });
  expect(rows.filter((x) => /basil/i.test(x.name))).toHaveLength(1);
  expect(rows.filter((x) => /parsley/i.test(x.name))).toHaveLength(1);
});
