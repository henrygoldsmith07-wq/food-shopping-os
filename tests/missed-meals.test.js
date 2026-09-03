import { describe, expect, it } from 'vitest';
import { captureMissedMeals, missedMealSlots } from '../src/lib/plan-outcome.js';
import { hydrate } from '../src/lib/store-persistence.js';

const stamp = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

describe('missedMealSlots', () => {
  it('finds past planned slots with no outcome event at all', () => {
    const plan = { [stamp(-2)]: { dinner: 'r1', lunch: 'r2' }, [stamp(1)]: { dinner: 'r3' } };
    const missed = missedMealSlots(plan, {
      before: stamp(0),
      events: [{ date: stamp(-2), slot: 'dinner', status: 'cooked' }],
    });
    expect(missed).toEqual([{ date: stamp(-2), slot: 'lunch', recipeId: 'r2' }]);
  });

  it('ignores future slots and returns nothing without a cutoff', () => {
    expect(missedMealSlots({ [stamp(1)]: { dinner: 'r3' } }, { before: stamp(0) })).toEqual([]);
    expect(missedMealSlots({ [stamp(-1)]: { dinner: 'r3' } })).toEqual([]);
  });
});

describe('captureMissedMeals', () => {
  const base = (over = {}) => ({
    day: stamp(0),
    plan: { [stamp(-1)]: { dinner: 'r1' } },
    mealPlanEvents: [],
    ...over,
  });

  it('records a skipped-missed event for each silent past slot', () => {
    const next = captureMissedMeals(base());
    expect(next.mealPlanEvents).toEqual([
      expect.objectContaining({
        date: stamp(-1), slot: 'dinner', plannedRecipeId: 'r1',
        status: 'skipped', reason: 'missed', missed: true,
      }),
    ]);
  });

  it('is idempotent — already-marked slots are never marked twice', () => {
    const once = captureMissedMeals(base());
    expect(captureMissedMeals(once)).toBe(once);
  });

  it('leaves state untouched when nothing silently passed', () => {
    const resolved = base({
      mealPlanEvents: [{ date: stamp(-1), slot: 'dinner', status: 'cooked' }],
    });
    expect(captureMissedMeals(resolved)).toBe(resolved);
  });
});

describe('hydrate captures silent misses only when a day actually passed', () => {
  it('marks unresolved past slots after a real rollover', () => {
    // The household last opened the app yesterday; dinner that day was never
    // cooked, skipped or swapped — so it is now a never-cooked meal.
    const stored = {
      onboarded: true,
      day: stamp(-1),
      plan: { [stamp(-1)]: { dinner: 'r1' } },
      mealPlanEvents: [],
    };
    const next = hydrate(stored);
    expect(next.mealPlanEvents).toHaveLength(1);
    expect(next.mealPlanEvents[0]).toMatchObject({
      date: stamp(-1), slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'missed',
    });
  });

  it('leaves resolved slots and same-day loads alone', () => {
    const sameDay = hydrate({
      onboarded: true,
      day: stamp(0),
      plan: { [stamp(0)]: { dinner: 'r1' } },
      mealPlanEvents: [],
    });
    expect(sameDay.mealPlanEvents).toEqual([]);
  });
});
