import { describe, expect, it } from 'vitest';
import { scaleQty, parseQty, scaleRecipe } from '../src/lib/recipe-tools.js';
import { buildQuickEntry, sumMacros } from '../src/lib/nutrition.js';
import { compareBaskets } from '../src/lib/basket-optimizer.js';
import { householdWasteMetrics } from '../src/lib/waste-metrics.js';
import {
  seededRng, makeRecipe, makeQuickEntry, makeShoppingItem, makeOffers, makeWasteRow, WASTE_TODAY,
} from './helpers/fixtures.js';

/**
 * Property-based checks without a property-testing dependency: a seeded PRNG
 * draws hundreds of cases, and each assertion is an invariant that must hold
 * for every draw. A failure prints its seed, so it reproduces exactly.
 */

const RUNS = 250;
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const round2 = (n) => Math.round(n * 100) / 100;
const pick = (rng, options) => options[Math.floor(rng() * options.length)];

describe('recipe portion scaling — scaleRecipe/scaleQty', () => {
  it(`scales quantities linearly for ${RUNS} random recipes`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const recipe = makeRecipe(rng);
      const factor = 1 + rng() * 3; // 1x–4x
      for (const ingredient of recipe.ingredients) {
        const scaled = scaleQty(ingredient.qty, factor);
        if (factor === 1) {
          expect(scaled, `seed ${seed}`).toBe(ingredient.qty);
          continue;
        }
        const before = parseQty(ingredient.qty);
        const after = parseQty(scaled);
        expect(after, `seed ${seed}: ${ingredient.qty} → ${scaled}`).not.toBeNull();
        expect(after.unit, `seed ${seed}: unit preserved`).toBe(before.unit);
        // pretty() rounds to 2dp then snaps to 0.5/0.1 steps, so the
        // displayed value can sit up to ~0.055 from the exact product.
        expect(Math.abs(after.amount - before.amount * factor), `seed ${seed}: ${before.amount} × ${factor}`)
          .toBeLessThan(0.06);
      }
    }
  });

  it(`scaling up then back down round-trips ${RUNS} random quantities`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const qty = rng() < 0.5 ? `${int(rng, 1, 12)} ${pick(rng, ['g', 'ml', 'tbsp', 'tin'])}` : pick(rng, ['½ lemon', '2 tbsp', '150 g']);
      const there = scaleQty(qty, 2);
      const back = parseQty(scaleQty(there, 0.5));
      const original = parseQty(qty);
      expect(back, `seed ${seed}: ${qty} → ${there} → back`).not.toBeNull();
      expect(back.amount, `seed ${seed}`).toBeCloseTo(original.amount, 1);
      expect(back.unit, `seed ${seed}`).toBe(original.unit);
    }
  });

  it(`reports cost as cost-per-serving times servings for ${RUNS} recipes`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const recipe = makeRecipe(rng);
      for (const servings of [1, 2, 3.6, 8, 0]) {
        const scaled = scaleRecipe(recipe, servings);
        const to = Math.max(1, Math.round(servings));
        expect(scaled.servings, `seed ${seed}, servings ${servings}`).toBe(to);
        expect(scaled.totalCost, `seed ${seed}`).toBe(Math.round(recipe.costPerServing * to * 100) / 100);
        expect(scaled.ingredients, `seed ${seed}`).toHaveLength(recipe.ingredients.length);
        expect(recipe.servings, `seed ${seed}: input never mutated`).toBe(recipe.servings);
      }
    }
  });

  it('scaling to the same servings leaves ingredients untouched', () => {
    const rng = seededRng(7);
    const recipe = makeRecipe(rng);
    const same = scaleRecipe(recipe, recipe.servings);
    expect(same.ingredients.map((i) => i.qty)).toEqual(recipe.ingredients.map((i) => i.qty));
  });

  it('scaling to a target then another lands exactly on the second target', () => {
    // Scaling is absolute, not multiplicative: asking for 2 servings then 3
    // must equal asking for 3 directly — never drift with the intermediate.
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const recipe = makeRecipe(rng);
      const a = int(rng, 1, 6);
      const b = int(rng, 1, 10);
      const via = scaleRecipe(scaleRecipe(recipe, a), b);
      const direct = scaleRecipe(recipe, b);
      // Quantity strings round-trip through a display rounding per step, so
      // per-ingredient equality with the direct path is not promised — the
      // linearity test pins that instead. What IS promised: the target and
      // its cost land exactly, with the same ingredient list.
      expect(via.servings, `seed ${seed}: via ${a} then ${b}`).toBe(direct.servings);
      expect(via.totalCost, `seed ${seed}`).toBe(direct.totalCost);
      expect(via.ingredients, `seed ${seed}`).toHaveLength(recipe.ingredients.length);
      expect(recipe.servings, `seed ${seed}: input never mutated`).toBe(recipe.servings);
    }
  });
});

describe('nutrition aggregation — sumMacros', () => {
  it('sums to zero on an empty log', () => {
    const totals = sumMacros([]);
    for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
      expect(totals[key]).toBe(0);
    }
    expect(totals.detail.kcal.coverage).toBe(100);
  });

  it(`is commutative across shuffles for ${RUNS} random logs`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const entries = Array.from({ length: int(rng, 1, 20) }, () => buildQuickEntry(makeQuickEntry(rng)));
      const shuffled = [...entries].sort((a, b) => (a.id < b.id ? 1 : -1));
      const a = sumMacros(entries);
      const b = sumMacros(shuffled);
      for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
        expect(a[key], `seed ${seed}, ${key}`).toBe(b[key]);
      }
      expect(a.detail.kcal.measuredCount, `seed ${seed}`).toBe(entries.length);
    }
  });

  it(`partition-then-add matches add-then-partition within rounding for ${RUNS} logs`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const half = int(rng, 1, 10);
      const entries = Array.from({ length: half * 2 }, () => buildQuickEntry(makeQuickEntry(rng)));
      const left = sumMacros(entries.slice(0, half));
      const right = sumMacros(entries.slice(half));
      const whole = sumMacros(entries);
      for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
        // kcal rounds to an integer per call, other macros to one decimal:
        // two partitioned sums can drift from the whole by at most a rounding
        // step per partition.
        expect(Math.abs(left[key] + right[key] - whole[key]), `seed ${seed}, ${key}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('basket comparison — compareBaskets', () => {
  it(`totals reconcile and rows stay sorted for ${RUNS} random baskets`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const items = Array.from({ length: int(rng, 1, 40) }, () => makeShoppingItem(rng));
      const stores = ['Shop A', 'Shop B', 'Shop C'];
      const offersByStore = Object.fromEntries(stores.map((store) => [store, makeOffers(rng, items.map((i) => i.name))]));
      const options = {
        stores,
        delivery: Object.fromEntries(stores.map((s) => [s, round2(rng() * 5)])),
        travel: Object.fromEntries(stores.map((s) => [s, round2(rng() * 3)])),
      };
      const result = compareBaskets(items, offersByStore, options);

      expect(result.rows).toHaveLength(stores.length);
      const scores = result.rows.map((r) => r.practicalScore);
      for (let i = 1; i < scores.length; i += 1) {
        expect(scores[i], `seed ${seed}: rows sorted by practical score`).toBeGreaterThanOrEqual(scores[i - 1]);
      }
      for (const row of result.rows) {
        expect(Math.abs(row.total - (row.productTotal + row.delivery + row.travel)), `seed ${seed}, ${row.store}`).toBeLessThan(0.02);
        expect(row.availability, `seed ${seed}`).toBeGreaterThanOrEqual(0);
        expect(row.availability, `seed ${seed}`).toBeLessThanOrEqual(100);
        expect(row.total, `seed ${seed}`).toBeGreaterThanOrEqual(0);
        expect(row.unavailable + row.matched, `seed ${seed}`).toBe(items.length);
        const penalty = row.unavailable * 1.5 + row.substitutions * 0.25;
        expect(Math.abs(row.practicalScore - (row.total + penalty)), `seed ${seed}`).toBeLessThan(0.02);
      }
      expect(result.best).toBe(result.rows[0]);
    }
  });

  it('a fully matched basket totals exactly the offer prices with no fees', () => {
    const rng = seededRng(42);
    const items = [makeShoppingItem(rng, { name: 'Milk' }), makeShoppingItem(rng, { name: 'Eggs' })];
    const offers = { milk: { name: 'Milk', price: 1.2, matchClassification: 'likely equivalent' }, eggs: { name: 'Eggs', price: 2.4, matchClassification: 'likely equivalent' } };
    const { best } = compareBaskets(items, { 'Shop A': offers }, { stores: ['Shop A'] });
    expect(best.total).toBe(3.6);
    expect(best.availability).toBe(100);
    expect(best.unavailable).toBe(0);
  });

  it('an empty basket still returns a store row with full availability', () => {
    const rng = seededRng(9);
    const { rows, best } = compareBaskets([], { 'Shop A': {} }, { stores: ['Shop A'], delivery: { 'Shop A': 2 } });
    expect(rows).toHaveLength(1);
    expect(best.availability).toBe(100);
    expect(best.total).toBe(2);
  });
});

describe('household waste report — householdWasteMetrics', () => {
  it(`reports cost as the sum of the month's rows for ${RUNS} random logs`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const rows = Array.from({ length: int(rng, 0, 25) }, () => makeWasteRow(rng));
      const metrics = householdWasteMetrics({ waste: rows }, WASTE_TODAY);
      const julyCost = rows
        .filter((r) => {
          const date = String(r.date).slice(0, 10);
          return date >= '2026-07-01' && date <= '2026-07-27'; // the month to date
        })
        .reduce((sum, r) => sum + Number(r.cost ?? 0), 0);
      expect(metrics.current.cost, `seed ${seed}`).toBe(Math.round(julyCost * 100) / 100);
      expect(metrics.current.cost, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(metrics.current.avoidableCost, `seed ${seed}`).toBeLessThanOrEqual(metrics.current.cost + 0.001);
      const rate = metrics.current.avoidableRate;
      if (rate !== null) {
        expect(rate, `seed ${seed}`).toBeGreaterThanOrEqual(0);
        expect(rate, `seed ${seed}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('rows outside the report window never change the numbers', () => {
    const rng = seededRng(11);
    const base = Array.from({ length: 8 }, () => makeWasteRow(rng, '2026-07'));
    const before = householdWasteMetrics({ waste: base }, WASTE_TODAY);
    const withNoise = [...base, ...Array.from({ length: 10 }, () => makeWasteRow(rng, '2026-05'))];
    const after = householdWasteMetrics({ waste: withNoise }, WASTE_TODAY);
    expect(after.current.cost).toBe(before.current.cost);
    expect(after.current.avoidableCost).toBe(before.current.avoidableCost);
    expect(after.current.items).toBe(before.current.items);
  });

  it('adding a row never reduces the reported cost', () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const rows = Array.from({ length: int(rng, 1, 15) }, () => makeWasteRow(rng, '2026-07'));
      const without = householdWasteMetrics({ waste: rows }, WASTE_TODAY);
      const extra = makeWasteRow(rng, '2026-07', { cost: round2(0.1 + rng() * 4) });
      const withExtra = householdWasteMetrics({ waste: [...rows, extra] }, WASTE_TODAY);
      expect(withExtra.current.cost, `seed ${seed}`).toBeGreaterThanOrEqual(without.current.cost);
    }
  });

  it('estimated prevention is never negative', () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = seededRng(seed);
      const waste = [
        ...Array.from({ length: int(rng, 0, 10) }, () => makeWasteRow(rng, '2026-07')),
        ...Array.from({ length: int(rng, 0, 10) }, () => makeWasteRow(rng, '2026-06')),
      ];
      const metrics = householdWasteMetrics({ waste }, WASTE_TODAY);
      expect(metrics.estimatedWastePrevented, `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('no waste and no spend reads as a clean zero report, not an error', () => {
    const metrics = householdWasteMetrics({}, WASTE_TODAY);
    expect(metrics.current.cost).toBe(0);
    expect(metrics.current.items).toBe(0);
    expect(metrics.current.avoidableRate).toBeNull();
    expect(metrics.current.wasteAsSpendRate).toBeNull();
    expect(metrics.estimatedWastePrevented).toBe(0);
  });
});

