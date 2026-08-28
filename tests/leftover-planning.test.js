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
