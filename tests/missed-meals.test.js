import { describe, it, expect } from 'vitest';
import { missedMealSlots, captureMissedMeals } from '../src/lib/missed-meals.js';

const plan = {
  '2026-10-18': { dinner: 'r1', lunch: 'r2' },
  '2026-10-19': { dinner: 'r3' },
  '2026-10-20': { dinner: 'r4' },
};

describe('missed meals', () => {
  it('returns nothing without a before date or on junk plans', () => {
    expect(missedMealSlots(plan)).toEqual([]);
    expect(missedMealSlots({ a: null, b: 'x' }, { before: '2026-10-20' })).toEqual([]);
  });
  it('lists only past, unresolved, non-empty slots', () => {
    const events = [{ date: '2026-10-18', slot: 'dinner', status: 'cooked' }];
    const out = missedMealSlots({ ...plan, '2026-10-19': { dinner: '' , lunch: 'r5' } }, { before: '2026-10-20', events });
    expect(out).toEqual([
      { date: '2026-10-18', slot: 'lunch', recipeId: 'r2' },
      { date: '2026-10-19', slot: 'lunch', recipeId: 'r5' },
    ]);
  });
  it('does not count today as missed', () => {
    expect(missedMealSlots(plan, { before: '2026-10-20' }).map((m) => m.date)).not.toContain('2026-10-20');
  });
  it('captureMissedMeals returns the same state when nothing is missed', () => {
    const s = { plan, day: '2026-10-18', mealPlanEvents: [] };
    expect(captureMissedMeals(s)).toBe(s);
  });
  it('stamps inferred skips deterministically and idempotently', () => {
    const s = { plan, day: '2026-10-20' };
    const a = captureMissedMeals(s);
    expect(a.mealPlanEvents).toHaveLength(3);
    expect(a.mealPlanEvents[0]).toMatchObject({ id: 'mpe_2026-10-18_dinner_r1', status: 'skipped', source: 'inferred', missed: true, at: '2026-10-20' });
    const b = captureMissedMeals(a);
    expect(b.mealPlanEvents).toHaveLength(3);
    expect(captureMissedMeals(s)).toEqual(a);
  });
  it('keeps at most the latest 500 events', () => {
    const many = Array.from({ length: 499 }, (_, i) => ({ id: `e${i}`, date: 'x', slot: 'y' }));
    const out = captureMissedMeals({ plan, day: '2026-10-20', mealPlanEvents: many });
    expect(out.mealPlanEvents).toHaveLength(500);
    expect(out.mealPlanEvents.at(-1).id).toMatch(/^mpe_/);
  });
});
