import { describe, expect, it } from 'vitest';
import { canWaitRows, neededBy } from '../src/lib/needed-by.js';
import { setMyRecipes } from '../src/data/recipes.js';

const recipe = (id, name) => ({ id, name, servings: 2, time: 20, costPerServing: 1, ingredients: [{ name: 'x', qty: '1' }] });
const a = recipe('nb-a', 'Pasta bake');
const b = recipe('nb-b', 'Fish pie');
const TODAY = '2026-10-30';
const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
const plan = { '2026-10-30': { dinner: 'nb-a' }, '2026-11-02': { dinner: 'nb-b', lunch: 'nb-a' } };
const row = (id, name, sourceRecipes, extra = {}) => ({ id, name, qty: '1', checked: false, sourceRecipes, ...extra });

describe('needed-by', () => {
  setMyRecipes([a, b]);
  it('uses the earliest meal that needs a row', () => {
    const m = neededBy([row('1', 'Cheese', ['Pasta bake', 'Fish pie'])], plan, dates, TODAY);
    expect(m.get('1')).toMatchObject({ date: '2026-10-30', inDays: 0 });
  });
  it('lists only rows first needed 3+ days away, soonest first', () => {
    const list = [row('1', 'Cheese', ['Pasta bake']), row('2', 'Haddock', ['Fish pie']), row('3', 'Ticked', ['Fish pie'], { checked: true }), row('4', 'Mystery', [])];
    const out = canWaitRows(list, plan, dates, TODAY);
    expect(out.map((r) => r.item.name)).toEqual(['Haddock']);
    expect(out[0]).toMatchObject({ date: '2026-11-02', slot: 'dinner', recipe: 'Fish pie', inDays: 3 });
  });
  it('ignores past meals and bad input', () => {
    expect(canWaitRows(null, null, null, TODAY)).toEqual([]);
    expect(canWaitRows([row('1', 'Cheese', ['Pasta bake'])], { '2026-10-20': { dinner: 'nb-a' } }, ['2026-10-20'], TODAY)).toEqual([]);
  });
});
