import { describe, it, expect } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';
const r = (id, ing) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ing.map(([n, qty]) => ({ name: n, qty })) });
const d = ['2026-10-24'];
const run = (ing, pantry) => { setMyRecipes([r('pc', ing)]); return shoppingForPlan({ [d[0]]: { dinner: 'pc' } }, d, { pantry, today: '2026-10-23', people: 2 }); };
const row = (name, qty) => ({ id: 'p' + name, name, qty, confidence: 'definite', lastConfirmedAt: '2026-10-23' });
describe('pantry amounts that cannot be compared', () => {
  it('keeps rice on the list flagged "check amount" when pantry says 1 box', () => {
    const rows = run([['rice', '300 g']], [row('rice', '1 box')]);
    const rice = rows.find((x) => /rice/i.test(x.name));
    expect(rice).toBeTruthy();
    expect(rice.pantryTruth).toBe('check_amount');
    expect(rice.explanation).toMatch(/1 box/);
  });
  it('still drops it when the pantry has no amount recorded', () => {
    expect(run([['rice', '300 g']], [row('rice', '')]).find((x) => /rice/i.test(x.name))).toBeFalsy();
  });
  it('still drops it when the amounts compare and are enough', () => {
    expect(run([['rice', '300 g']], [row('rice', '1 kg')]).find((x) => /rice/i.test(x.name))).toBeFalsy();
  });
});
