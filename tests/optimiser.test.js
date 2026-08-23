import { describe, it, expect } from 'vitest';
import {
  rankPlans,
  chooseOptimalPlan,
  optimiseBasket,
  readQty,
  pantryCoverage,
} from '../src/lib/optimiser.js';

const meal = (id, title, ingredients, extra = {}) => ({ id, title, ingredients, ...extra });

describe('readQty — quantity reader', () => {
  it('normalises mass, volume and count dimensions', () => {
    expect(readQty('500 g')).toEqual({ amount: 500, dim: 'mass' });
    expect(readQty('1kg')).toEqual({ amount: 1000, dim: 'mass' });
    expect(readQty('250 ml')).toEqual({ amount: 250, dim: 'volume' });
    expect(readQty('1 l')).toEqual({ amount: 1000, dim: 'volume' });
    expect(readQty('2')).toEqual({ amount: 2, dim: 'count' });
    expect(readQty('½')).toEqual({ amount: 0.5, dim: 'count' });
  });
});

describe('pantryCoverage — what the plan already has', () => {
  it('counts matched stock within the same dimension only', () => {
    const meals = [meal('curry', 'Curry', [{ name: 'Rice', qty: '400 g' }, { name: 'Rice milk', qty: '200 ml' }])];
    const pantry = [
      { name: 'rice', qty: '500 g' },
      { name: 'Rice milk', qty: '100 g' }, // wrong dimension — never crosses
    ];
    const cov = pantryCoverage(meals, pantry);
    expect(cov).toBeCloseTo(400 / 600, 3);
  });

  it('is null when the plan needs nothing measurable', () => {
    expect(pantryCoverage([meal('x', 'X', [])], [])).toBeNull();
  });
});

describe('rankPlans — the composite engine', () => {
  const today = '2026-08-22';

  it('prefers the plan that cooks from existing stock', () => {
    const ctx = { pantryItems: [{ name: 'Rice', qty: '500 g' }] };
    const buyEverything = [meal('pasta', 'Pasta', [{ name: 'Pasta', qty: '400 g' }])];
    const useStock = [meal('curry', 'Curry', [{ name: 'Rice', qty: '400 g' }])];
    const best = chooseOptimalPlan([buyEverything, useStock], ctx);
    expect(best.candidateIndex).toBe(1);
    expect(best.metrics.pantryCoverage).toBe(1);
    expect(best.reasons.join(' ')).toMatch(/100% already in your pantry/);
  });

  it('prioritises stock expiring within the horizon', () => {
    const pantry = [
      { name: 'Spinach', qty: '200 g', expiry: '2026-08-25' },
      { name: 'Kale', qty: '200 g', expiry: '2026-09-30' },
      { name: 'Yoghurt', qty: '300 g', expiry: '2026-12-01' },
    ];
    const usesSpinach = [meal('saag', 'Saag', [{ name: 'Spinach', qty: '100 g' }])];
    const ignoresIt = [meal('kale-salad', 'Kale salad', [{ name: 'Kale', qty: '100 g' }])];
    const best = chooseOptimalPlan([ignoresIt, usesSpinach], { pantryItems: pantry, today });
    expect(best.candidateIndex).toBe(1);
    expect(best.metrics.expiryCoverage).toBe(1);
  });

  it('keeps plans inside budget and says by how much they miss', () => {
    const priceTable = { chicken: 2 };
    const frugal = [meal('small', 'Small roast', [{ name: 'chicken', qty: '2' }])]; // £4
    const lavish = [meal('big', 'Big roast', [{ name: 'chicken', qty: '4' }])]; // £8
    const best = chooseOptimalPlan([lavish, frugal], { priceTable, weeklyBudget: 5 });
    expect(best.candidateIndex).toBe(1);
    expect(best.metrics.budgetFit).toBe(100);
    expect(best.metrics.estimatedCost).toBe(4);
    expect(best.reasons.join(' ')).toMatch(/Inside budget at £4/);
  });

  it('can hard-fail plans needing equipment you do not own', () => {
    const airFried = [meal('fries', 'Fries', [{ name: 'Potato', qty: '3' }], { equipment: ['Air fryer'] })];
    const pan = [meal('chips', 'Chips', [{ name: 'Potato', qty: '3' }], { equipment: [] })];
    const best = chooseOptimalPlan([airFried, pan], { equipmentOwned: [], strictEquipment: true });
    expect(best.candidateIndex).toBe(1);
    expect(best.reasons.join(' ')).not.toMatch(/equipment you do not own/);
  });

  it('accepts richer waste scores without coupling to their source', () => {
    const same = (id) => [meal(id, id, [{ name: 'Rice', qty: '400 g' }])];
    // Zeroing the other weights isolates the fed-in score, which then shows
    // up as the final score — the engine blends, it never overrides.
    const best = chooseOptimalPlan([same('a'), same('b')], {
      wasteScores: { 0: 40, 1: 90 },
      weights: { pantryCoverage: 0 },
    });
    expect(best.candidateIndex).toBe(1);
    expect(best.score).toBe(90);
  });

  it('respects a per-meal time ceiling', () => {
    const quick = [meal('eggs', 'Eggs', [{ name: 'Eggs', qty: '6' }], { time: 15 })];
    const slow = [meal('roast', 'Roast', [{ name: 'Beef', qty: '2' }], { time: 45 })];
    const best = chooseOptimalPlan([slow, quick], { maxTimeMins: 20 });
    expect(best.candidateIndex).toBe(1);
    expect(best.metrics.timeFit).toBe(100);
  });

  it('breaks ties by original order, never at random', () => {
    const a = [meal('a', 'A', [{ name: 'Rice', qty: '100 g' }])];
    const b = [meal('b', 'B', [{ name: 'Rice', qty: '100 g' }])];
    const ctx = { pantryItems: [{ name: 'Rice', qty: '500 g' }] };
    expect(chooseOptimalPlan([a, b], ctx).candidateIndex).toBe(0);
  });
});

describe('optimiseBasket — consolidation, substitutes, packs', () => {
  it('suggests one trip when a single shop covers most of the list', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ name: `Item${i}`, store: 'Aldi' }));
    items.push({ name: 'Milk', store: 'Tesco' });
    const out = optimiseBasket(items);
    expect(out.singleTrip).toMatchObject({ store: 'Aldi', extraStops: 1 });
    expect(out.singleTrip.skipped).toEqual(['Milk']);
  });

  it('stays quiet when the list is genuinely split', () => {
    const out = optimiseBasket([
      { name: 'A', store: 'Tesco' }, { name: 'B', store: 'Aldi' },
      { name: 'C', store: 'Lidl' }, { name: 'D', store: 'Asda' },
    ]);
    expect(out.singleTrip).toBeNull();
  });

  it('routes new items to the preferred store instead of guessing', () => {
    const out = optimiseBasket([{ name: 'Bread' }, { name: 'Eggs' }], { preferredStore: 'Aldi' });
    expect(Object.keys(out.groups)).toEqual(['Aldi']);
  });

  it('suggests cheaper substitutes from your own receipt history', () => {
    const shops = [{ store: 'Aldi', items: [{ name: 'Milk', price: 0.8 }] }];
    const out = optimiseBasket(
      [{ name: 'Milk', store: 'Tesco', price: 1.2 }],
      { shops },
    );
    expect(out.suggestions[0]).toMatchObject({ item: 'Milk', from: 'Tesco', to: 'Aldi', save: 0.4 });
  });

  it('rounds quantities up to whole packs and says what remains', () => {
    const out = optimiseBasket(
      [{ name: 'Rice', qty: '1500 g' }],
      { packageSizes: { rice: '1 kg' } },
    );
    expect(out.packNotes[0]).toMatchObject({ item: 'Rice', buyPacks: 2 });
  });
});
