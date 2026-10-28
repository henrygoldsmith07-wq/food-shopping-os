import { describe, expect, it } from 'vitest';
import { consumePlannedLeftover, createLeftover, leftoverSummary, planLeftoverReuse } from '../src/lib/leftover-planning.js';

describe('explicit leftover planning', () => {
  it('tracks cooked, eaten, remaining, storage, and safe-use window', () => {
    const item = createLeftover({
      recipe: { id: 'ragu', name: 'Beef ragu' }, cookedPortions: 6, eatenPortions: 4,
      date: '2026-08-24', storage: 'Fridge', safeDays: 3,
    });
    expect(item).toMatchObject({ cookedPortions: 6, eatenPortions: 4, remainingPortions: 2, storage: 'Fridge', safeUntil: '2026-08-27', lifecycleState: 'stored' });
  });

  it('plans reuse only up to the portions actually remaining', () => {
    const item = createLeftover({ recipe: { id: 'ragu', name: 'Beef ragu' }, cookedPortions: 6, eatenPortions: 4, date: '2026-08-24' });
    expect(planLeftoverReuse(item, { date: '2026-08-26', slot: 'lunch', portions: 3 }).plannedReuse).toEqual({ date: '2026-08-26', slot: 'lunch', portions: 2 });
  });

  it('turns planned reuse into eaten portions and clears the plan', () => {
    const item = planLeftoverReuse(createLeftover({ recipe: { id: 'ragu', name: 'Beef ragu' }, cookedPortions: 6, eatenPortions: 4, date: '2026-08-24' }), { date: '2026-08-26', portions: 2 });
    expect(consumePlannedLeftover(item)).toMatchObject({ eatenPortions: 6, remainingPortions: 0, plannedReuse: null, lifecycleState: 'eaten' });
  });

  it('flags leftovers whose safe window closes tomorrow', () => {
    expect(leftoverSummary([createLeftover({ recipe: { id: 'ragu', name: 'Beef ragu' }, cookedPortions: 2, date: '2026-08-24' })], '2026-08-26')[0].urgent).toBe(true);
  });
});

import { suggestLeftoverSlots } from '../src/lib/leftover-planning.js';
describe('suggestLeftoverSlots', () => {
  it('offers free lunch slots after today, skipping occupied ones', () => {
    const plan = { '2026-10-29': { lunch: 'x' } };
    expect(suggestLeftoverSlots(plan, { from: '2026-10-28', portions: 2, people: 1 }))
      .toEqual([{ date: '2026-10-29', slot: 'dinner' }, { date: '2026-10-30', slot: 'lunch' }]);
  });
  it('one slot per household, nothing when none saved or window full', () => {
    expect(suggestLeftoverSlots({}, { from: '2026-10-28', portions: 3, people: 3 })).toHaveLength(1);
    expect(suggestLeftoverSlots({}, { from: '2026-10-28', portions: 0 })).toEqual([]);
    expect(suggestLeftoverSlots({}, { from: '2026-10-28', portions: 20, people: 1 })).toHaveLength(6);
  });
});

import { planActions } from '../src/lib/plan-actions.js';
describe('planLeftoverMeals', () => {
  it('fills only empty slots', () => {
    let state = { plan: { '2026-10-29': { lunch: 'keep' } }, pantry: [], events: [] };
    const set = (fn) => { state = { ...state, ...fn(state) }; };
    planActions(set).planLeftoverMeals({ id: 'ragu' }, [
      { date: '2026-10-29', slot: 'lunch' }, { date: '2026-10-29', slot: 'dinner' }, { date: '2026-10-30', slot: 'breakfast' },
    ]);
    expect(state.plan['2026-10-29']).toEqual({ lunch: 'keep', dinner: 'ragu' });
    expect(state.plan['2026-10-30']).toBeUndefined();
  });
});
