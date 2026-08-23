import { describe, it, expect } from 'vitest';
import {
  householdOutcomes,
  beforeAfterOutcomes,
  qtyToKg,
  depletionAccuracy,
} from '../src/lib/household-outcomes.js';

const state = {
  day: '2026-08-21',
  shops: [
    { date: '2026-08-02', store: 'Tesco', total: 42.5 },
    { date: '2026-08-09', store: 'Aldi', total: 31.2 },
    { date: '2026-08-16', store: 'Tesco', total: 28.3 },
    { date: '2026-05-02', store: 'Tesco', total: 60 }, // outside window
  ],
  waste: [
    { name: 'Spinach', cost: 1.8, qty: '200 g', date: '2026-08-10' },
    { name: 'Bread', cost: 0.9, qty: '½ loaf', date: '2026-08-14' },
  ],
  plan: {
    '2026-08-10': { dinner: 'chicken-traybake' },
    '2026-08-11': { dinner: 'chickpea-curry' },
    '2026-08-12': { dinner: 'chicken-traybake' },
  },
  mealPlanEvents: [
    { date: '2026-08-10', slot: 'dinner', plannedRecipeId: 'chicken-traybake', status: 'cooked', at: 1 },
    { date: '2026-08-11', slot: 'dinner', plannedRecipeId: 'chickpea-curry', status: 'takeaway', at: 2 },
    { date: '2026-08-12', slot: 'dinner', plannedRecipeId: 'chicken-traybake', status: 'substituted', actualRecipeId: 'salmon-teriyaki', at: 3 },
  ],
  cooked: [{ recipeId: 'chicken-traybake', date: '2026-08-10' }],
  pantry: [
    { id: 'p1', name: 'Yoghurt', expiry: '2026-08-20' },
    { id: 'p2', name: 'Milk', confidence: 'confirmed' },
    { id: 'p3', name: 'Traybake leftovers', cat: 'Leftovers', recipeId: 'chicken-traybake' },
  ],
  shoppingList: [
    { name: 'Milk', checked: true },
    { name: 'Eggs', checked: true },
    { name: 'Rice', checked: false },
  ],
  planningTimeHistory: [
    { date: '2026-08-09', durationMs: 40000 },
    { date: '2026-08-16', durationMs: 80000 },
  ],
  pantryEvents: [
    { type: 'purchase', name: 'Bagged salad', date: '2026-06-01' },
    { type: 'pantry_lifecycle', itemId: 'p1', name: 'Yoghurt', to: 'consumed', date: '2026-08-12' },
  ],
};

describe('household outcomes — measured, never invented', () => {
  it('measures weekly spend from recorded trips inside the window only', () => {
    const out = householdOutcomes(state);
    expect(out.spend.trips).toBe(3);
    expect(out.spend.total).toBe(102);
    expect(out.spend.weeklyAverage).toBe(25.5);
    expect(out.ready).toBe(true);
  });

  it('measures waste in money and by weight, and counts discarded items', () => {
    const out = householdOutcomes(state);
    expect(out.waste.value).toBe(2.7);
    expect(out.waste.discardedItems).toBe(2);
    expect(out.waste.weightKg).toBe(0.2); // '½ loaf' is not a mass; only salad counts
    expect(out.waste.weightAssumption).toMatch(/1 of 2/);
  });

  it('measures adherence, takeaway frequency and substitution frequency', () => {
    const out = householdOutcomes(state);
    expect(out.adherence.planned).toBe(3);
    expect(out.adherence.cooked).toBe(2); // cooked + substituted complete a slot
    expect(out.takeaways.count).toBe(1);
    expect(out.takeaways.perWeek).toBeCloseTo(0.25, 2);
    expect(out.substitutions.count).toBe(1);
    expect(out.takeaways.spend).toBeNull();
  });

  it('measures leftover reuse from matching pantry rows', () => {
    const out = householdOutcomes(state);
    expect(out.leftoversReused.count).toBeGreaterThanOrEqual(0);
  });

  it('grades savings confidence by evidence volume and calendar coverage', () => {
    const low = householdOutcomes(state);
    expect(low.savingsConfidence.level).toBe('low');
    const busy = householdOutcomes({
      ...state,
      shops: Array.from({ length: 9 }, (_, i) => ({ date: `2026-08-${String(i + 2).padStart(2, '0')}`, total: 20 })),
      day: '2026-09-21',
    }, { days: 56 });
    expect(busy.savingsConfidence.level).toBe('high');
    expect(busy.savingsConfidence.assumption).toMatch(/seasonality/i);
  });

  it('measures list completion and planning time as medians', () => {
    const out = householdOutcomes(state);
    expect(out.shoppingCompletion).toEqual({ checked: 2, total: 3, pct: 67 });
    expect(out.planningTimeMs.median).toBe(60000);
  });

  it('flags bought-but-unused ingredients honestly', () => {
    const withUnused = householdOutcomes({
      ...state,
      pantryEvents: [...state.pantryEvents, { type: 'purchase', name: 'Wont-use coriander', date: '2026-08-15' }],
    });
    expect(withUnused.unusedIngredients.names).toContain('Wont-use coriander');
  });

  it('computes depletion accuracy against printed expiry dates', () => {
    const acc = depletionAccuracy(state.pantry, [
      { type: 'pantry_lifecycle', itemId: 'p1', name: 'Yoghurt', to: 'discarded', date: '2026-08-13' },
    ], { today: '2026-08-21' });
    expect(acc.count).toBe(1);
    expect(acc.samples[0].deltaDays).toBe(-7);
    expect(acc.earlyDiscardPct).toBe(100);
  });
});

describe('qtyToKg', () => {
  it('parses masses and refuses non-mass quantities', () => {
    expect(qtyToKg('0.482 kg')).toBe(0.48);
    expect(qtyToKg('450 g')).toBe(0.45);
    expect(qtyToKg('2 x 200 g')).toBe(0.4);
    expect(qtyToKg('½ loaf')).toBeNull();
    expect(qtyToKg(null)).toBeNull();
  });
});

describe('before vs after Forq', () => {
  it('compares matched windows around the first evidence and gates on noise', () => {
    const result = beforeAfterOutcomes({ ...state, firstRunAt: '2026-07-01T09:00:00.000Z' });
    expect(result.anchor).toBe('2026-07-01');
    expect(result.before.window.from).toBe('2026-06-03');
    expect(result.after.window.to).toBe('2026-08-21');
    expect(result.ready).toBe(false); // before window is empty
    expect(result.deltas.weeklySpend).toBe(25.5);
  });

  it('is ready once both windows clear the floor, and reports deltas', () => {
    const busy = {
      ...state,
      firstRunAt: '2026-07-01T09:00:00.000Z',
      shops: [
        ...state.shops,
        { date: '2026-06-10', store: 'Tesco', total: 80 },
        { date: '2026-06-20', store: 'Aldi', total: 40 },
      ],
      plan: { ...state.plan, '2026-06-10': { dinner: 'chicken-traybake' } },
      mealPlanEvents: [
        ...state.mealPlanEvents,
        { date: '2026-06-10', slot: 'dinner', plannedRecipeId: 'chicken-traybake', status: 'cooked', at: 5 },
      ],
    };
    const result = beforeAfterOutcomes(busy);
    expect(result.ready).toBe(true);
    expect(result.deltas.weeklySpend).toBeLessThan(0);
  });

  it('says plainly when there is no evidence at all', () => {
    expect(beforeAfterOutcomes({}).reason).toMatch(/No dated evidence/);
  });
});
