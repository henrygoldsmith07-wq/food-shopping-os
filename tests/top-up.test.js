import { describe, expect, it } from 'vitest';
import { heldRows, holdForTopUp, isHeld, releaseHeld, returnDate, tripRows } from '../src/lib/top-up.js';
import { setMyRecipes } from '../src/data/recipes.js';

const recipe = (id, name) => ({ id, name, servings: 2, time: 20, costPerServing: 1, ingredients: [{ name: 'x', qty: '1' }] });
const TODAY = '2026-10-30';
const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
const plan = { '2026-10-30': { dinner: 'tu-a' }, '2026-11-03': { dinner: 'tu-b' } };
const row = (id, name, sourceRecipes, extra = {}) => ({ id, name, qty: '1', checked: false, sourceRecipes, ...extra });

describe('top-up list', () => {
  setMyRecipes([recipe('tu-a', 'Pasta bake'), recipe('tu-b', 'Fish pie')]);
  const list = [row('1', 'Cheese', ['Pasta bake']), row('2', 'Haddock', ['Fish pie']), row('3', 'Ticked', ['Fish pie'], { checked: true })];

  it('holds only rows first needed 3+ days away and returns them the day before', () => {
    const out = holdForTopUp(list, ['1', '2', '3'], plan, dates, TODAY);
    expect(out.held).toEqual(['2']);
    expect(out.list.find((r) => r.id === '2').topUpOn).toBe('2026-11-02');
    expect(out.list.find((r) => r.id === '1').topUpOn).toBeUndefined();
  });
  it('keeps held rows off today\'s trip until their day arrives', () => {
    const { list: held } = holdForTopUp(list, ['2'], plan, dates, TODAY);
    expect(tripRows(held, TODAY).map((r) => r.id)).toEqual(['1', '3']);
    expect(heldRows(held, TODAY).map((r) => r.name)).toEqual(['Haddock']);
    expect(isHeld(held[1], '2026-11-02')).toBe(false);
    expect(tripRows(held, '2026-11-02')).toHaveLength(3);
  });
  it('never returns a hold for today or the past', () => {
    expect(returnDate('2026-10-31', TODAY)).toBe('2026-10-31');
    expect(returnDate('2026-10-30', TODAY)).toBe('2026-10-31');
  });
  it('releases one or all holds without losing the row', () => {
    const { list: held } = holdForTopUp(list, ['2'], plan, dates, TODAY);
    const back = releaseHeld(held, ['2'], TODAY);
    expect(back[1]).toEqual(list[1]);
    expect(releaseHeld(held, null, TODAY)[1].topUpOn).toBeUndefined();
    expect(releaseHeld(list, null, TODAY)).toBe(list);
  });
  it('is safe on bad input', () => {
    expect(holdForTopUp(null, ['1'], plan, dates, TODAY).list).toBe(null);
    expect(tripRows(undefined, TODAY)).toEqual([]);
  });
});
