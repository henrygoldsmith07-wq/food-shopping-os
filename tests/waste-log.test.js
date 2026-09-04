import { describe, expect, it } from 'vitest';
import {
  wasteCauseBreakdown, wasteCauseInsight, WASTE_WINDOW_DAYS,
} from '../src/lib/waste-log.js';

const waste = (...rows) => ({ day: '2026-08-03', waste: rows, mealPlanEvents: [] });

describe('wasteCauseBreakdown', () => {
  it('buckets recipe leftovers apart from bought stock, summing cost', () => {
    const breakdown = wasteCauseBreakdown(waste(
      { name: 'Lasagne', cat: 'Leftovers', cost: 2.5, date: '2026-07-25' },
      { name: 'Milk', cat: 'Fridge', cost: 0.9, date: '2026-07-28' },
      { name: 'Bread', cat: 'Cupboard', cost: 1.1, date: '2026-07-30' },
    ));
    expect(breakdown.leftoverCooked).toEqual({ count: 1, cost: 2.5 });
    expect(breakdown.leftoverBought).toEqual({ count: 2, cost: 2 });
    expect(breakdown.neverCooked).toBe(0);
  });

  it('ignores rows outside the window and rows without a date', () => {
    const breakdown = wasteCauseBreakdown(waste(
      { name: 'Old', cat: 'Cupboard', cost: 5, date: '2026-06-01' },
      { name: 'Undated', cat: 'Cupboard', cost: 5 },
      { name: 'Now', cat: 'Cupboard', cost: 1, date: '2026-08-03' },
    ));
    expect(breakdown.leftoverBought).toEqual({ count: 1, cost: 1 });
  });

  it('counts planned meals never made — skipped, substituted, or takeaway', () => {
    const app = {
      day: '2026-08-03',
      waste: [],
      mealPlanEvents: [
        { date: '2026-07-28', status: 'substituted' },
        { date: '2026-07-30', status: 'skipped', reason: 'no-time' },
        { date: '2026-08-01', status: 'skipped', reason: 'takeaway', isTakeaway: true },
        { date: '2026-08-02', status: 'cooked' },
        { date: '2026-08-04', status: 'skipped' }, // future — outside the window
        { date: '2026-06-01', status: 'skipped' }, // too old
      ],
    };
    expect(wasteCauseBreakdown(app).neverCooked).toBe(3);
  });

  it('returns empty buckets when nothing is recorded or the day is missing', () => {
    expect(wasteCauseBreakdown()).toEqual({
      leftoverCooked: { count: 0, cost: 0 },
      leftoverBought: { count: 0, cost: 0 },
      neverCooked: 0,
      missedMeals: [],
    });
    expect(WASTE_WINDOW_DAYS).toBe(21);
  });

  it('names silent-miss rows newest first so the count reads as a cause', () => {
    const breakdown = wasteCauseBreakdown({
      day: '2026-08-03',
      waste: [],
      mealPlanEvents: [
        { date: '2026-07-25', slot: 'dinner', status: 'skipped', reason: 'missed', missed: true, plannedRecipeId: 'chicken-traybake' },
        { date: '2026-08-01', slot: 'dinner', status: 'skipped', reason: 'no-time' }, // explicit — counted, not silent
        { date: '2026-08-02', slot: 'lunch', status: 'skipped', reason: 'missed', missed: true, plannedRecipeId: 'unknown-id' },
      ],
    });
    expect(breakdown.neverCooked).toBe(3);
    expect(breakdown.missedMeals).toEqual([
      { date: '2026-08-02', name: null },
      { date: '2026-07-25', name: 'Lemon Chicken Traybake' },
    ]);
  });

  it('keeps out-of-window and pre-rollover silent rows out of the review list', () => {
    const breakdown = wasteCauseBreakdown({
      day: '2026-08-03',
      waste: [],
      mealPlanEvents: [
        { date: '2026-06-01', status: 'skipped', reason: 'missed', missed: true },
        { date: '2026-08-01', status: 'skipped', reason: 'missed', missed: true, plannedRecipeId: 'chickpea-curry' },
      ],
    });
    expect(breakdown.missedMeals).toEqual([{ date: '2026-08-01', name: 'Coconut Chickpea Curry' }]);
  });
});

describe('wasteCauseInsight', () => {
  it('leads with cooked leftovers when they dominate', () => {
    const insight = wasteCauseInsight({
      leftoverCooked: { count: 3, cost: 6 },
      leftoverBought: { count: 1, cost: 1 },
      neverCooked: 0,
    });
    expect(insight).toMatch(/cook to what you will actually eat/);
  });

  it('leads with bought stock when it dominates', () => {
    const insight = wasteCauseInsight({
      leftoverCooked: { count: 0, cost: 0 },
      leftoverBought: { count: 2, cost: 4 },
      neverCooked: 0,
    });
    expect(insight).toMatch(/buy for the week/);
  });

  it('says something only when there is something to say', () => {
    expect(wasteCauseInsight({
      leftoverCooked: { count: 0, cost: 0 },
      leftoverBought: { count: 0, cost: 0 },
      neverCooked: 0,
    })).toBeNull();
  });
});
