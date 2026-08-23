import { describe, it, expect } from 'vitest';
import { rankPlans, chooseOptimalPlan, optimiseBasket } from '../src/lib/optimiser.js';
import { normaliseRows } from '../src/lib/ingredient-prepass.js';
import { performance } from 'node:perf_hooks';

/**
 * Large-household performance floors. Budgets are generous (real paths run
 * an order of magnitude faster) so CI noise can't flake them — the point is
 * catching algorithmic blowups, not measuring milliseconds.
 */
const under = (ms, fn) => {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  return { result, elapsed, ok: elapsed < ms, budget: ms };
};

const bigPantry = Array.from({ length: 600 }, (_, i) => ({
  id: `p${i}`,
  name: `Ingredient ${i % 120}`,
  qty: `${(i % 9) + 1}00 g`,
  expiry: i % 10 === 0 ? '2026-09-15' : null,
}));

const mealFor = (offset) => ({
  id: `m${offset}`,
  title: `Meal ${offset}`,
  time: 20 + (offset % 30),
  ingredients: Array.from({ length: 4 }, (_, j) => ({
    name: `Ingredient ${(offset * 7 + j * 13) % 120}`,
    qty: '150 g',
  })),
});

describe('large-pantry performance — 600 rows stay instant', () => {
  it('ranks eight candidate plans without blowing up', () => {
    const candidates = Array.from({ length: 8 }, (_, c) =>
      Array.from({ length: 7 }, (_, m) => mealFor(c * 11 + m)));
    const { result, ok, elapsed, budget } = under(400, () =>
      rankPlans(candidates, {
        pantryItems: bigPantry,
        today: '2026-09-12',
        maxTimeMins: 45,
        packageSizes: { 'ingredient 3': '500 g', 'ingredient 17': '250 g' },
      }));
    expect(result.best).toBeTruthy();
    expect(ok, `rankPlans took ${Math.round(elapsed)}ms (budget ${budget}ms)`).toBe(true);
  });

  it('consolidates a 150-item basket quickly', () => {
    const items = Array.from({ length: 150 }, (_, i) => ({
      name: `Ingredient ${i % 120}`,
      store: i % 5 === 0 ? 'Tesco' : undefined,
      price: i % 3 === 0 ? 1 + (i % 7) / 10 : undefined,
      qty: '300 g',
    }));
    const shops = [{ store: 'Aldi', items: items.slice(0, 60).map((i) => ({ name: i.name, price: 0.8 })) }];
    const { result, ok, elapsed, budget } = under(250, () =>
      optimiseBasket(items, { preferredStore: 'Aldi', shops, packageSizes: { rice: '1 kg' } }));
    expect(Object.keys(result.groups).length).toBeGreaterThan(0);
    expect(ok, `optimiseBasket took ${Math.round(elapsed)}ms (budget ${budget}ms)`).toBe(true);
  });

  it('normalises a 600-row pantry with duplicate collapsing in linear time', () => {
    const rows = bigPantry.map((p) => ({ name: `${p.name}s`, qty: p.qty }));
    const { result, ok, elapsed, budget } = under(200, () => normaliseRows(rows));
    expect(result.rows.length).toBeLessThanOrEqual(120); // duplicates collapsed
    expect(ok, `normaliseRows took ${Math.round(elapsed)}ms (budget ${budget}ms)`).toBe(true);
  });
});
