import { describe, expect, it } from 'vitest';
import { batchCookPairs, ingredientKey } from '../src/lib/batch-cook.js';

const r = (id, prep, names) => ({ id, name: id, prep, ingredients: names.map((name) => ({ name, qty: '1' })) });
const byId = new Map([
  r('a', 10, ['Red onion', 'Garlic', 'Olive oil', 'Chicken']),
  r('b', 15, ['red onions', 'garlic', 'Salt', 'Rice']),
  r('c', 5, ['Pasta', 'Salt', 'Olive oil']),
  r('d', 5, ['Garlic', 'Tomatoes']),
].map((x) => [x.id, x]));
const plan = { '2026-11-02': { dinner: 'a' }, '2026-11-03': { dinner: 'b', lunch: 'c' }, '2026-11-04': { dinner: 'd' } };
const dates = Object.keys(plan);

describe('batch cook pairs', () => {
  it('normalises plurals and ignores staples', () => {
    expect(ingredientKey('Red onions')).toBe('red onion');
    expect(ingredientKey('Tomatoes')).toBe('tomato');
  });
  it('pairs dishes sharing two non-staple ingredients and saves the shorter prep', () => {
    const out = batchCookPairs(plan, dates, byId);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a+b');
    expect(out[0].shared).toEqual(['Red onion', 'Garlic']);
    expect(out[0].minutesSaved).toBe(10);
  });
  it('shared salt/oil alone never makes a pair, and empty plans give nothing', () => {
    expect(batchCookPairs({ x: { dinner: 'c' } }, ['x'], byId)).toEqual([]);
    expect(batchCookPairs({}, [], byId)).toEqual([]);
  });
});
