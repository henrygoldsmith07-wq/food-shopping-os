import { describe, expect, it } from 'vitest';
import { inferWeekRecoveryTrigger, inferWeekRecoveryTriggers } from '../src/lib/week-recovery-triggers.js';

const ev = (type, n, extra = {}) => ({ id: `e${n}`, type, at: `2026-10-0${n}T10:00:00.000Z`, ...extra });

describe('week recovery triggers', () => {
  it('returns nothing for empty state', () => {
    expect(inferWeekRecoveryTriggers()).toEqual([]);
    expect(inferWeekRecoveryTrigger({})).toBeNull();
  });

  it('collects every unresolved event, oldest first, newest via the single view', () => {
    const state = { householdLedger: [
      ev('MealSkipped', 1, { date: '2026-10-01', recipeId: 'r1' }),
      ev('IngredientWasted', 2, { ingredient: 'spinach' }),
    ] };
    const all = inferWeekRecoveryTriggers(state);
    expect(all.map((t) => t.kind)).toEqual(['MealSkipped', 'IngredientWasted']);
    expect(all[0].slot).toBe('dinner');
    expect(inferWeekRecoveryTrigger(state).ingredient).toBe('spinach');
  });

  it('ignores events at or before the last WeekRecovered', () => {
    const state = { householdLedger: [
      ev('IngredientWasted', 1, { ingredient: 'old' }),
      ev('WeekRecovered', 2),
      ev('LeftoverCreated', 3, { name: 'chilli' }),
    ] };
    expect(inferWeekRecoveryTriggers(state).map((t) => t.kind)).toEqual(['LeftoverCreated']);
  });

  it('names a pantry correction from the pantry when the correction has no name', () => {
    const state = { pantry: [{ id: 'p1', name: 'rice' }], householdLedger: [
      ev('PantryCorrected', 1, { corrections: [{ id: 'p1' }] }),
    ] };
    expect(inferWeekRecoveryTriggers(state)[0].name).toBe('rice');
  });

  it('flags unplanned shops and substituted meals only when marked', () => {
    const state = { householdLedger: [
      ev('IngredientPurchased', 1, {}),
      ev('IngredientPurchased', 2, { unplanned: true, items: ['crisps'] }),
      ev('MealCooked', 3, { substituted: true, plannedRecipeId: 'r1', recipeId: 'r2' }),
    ] };
    const all = inferWeekRecoveryTriggers(state, [{ id: 'r2', ingredients: [{ name: 'Eggs' }, 'Toast'] }]);
    expect(all.map((t) => t.kind)).toEqual(['UnplannedShop', 'MealCooked']);
    expect(all[1].substitutionIngredients).toEqual(['eggs', 'toast']);
  });

  it('falls back to legacy state only when there is no ledger', () => {
    const state = { day: '2026-10-05', waste: [{ name: 'milk' }], mealPlanEvents: [{ status: 'skipped', date: '2026-10-05', plannedRecipeId: 'r1' }] };
    expect(inferWeekRecoveryTriggers(state).map((t) => t.kind)).toEqual(['MealSkipped', 'IngredientWasted']);
    expect(inferWeekRecoveryTriggers({ ...state, householdLedger: [ev('WeekRecovered', 1)] })).toEqual([]);
  });
});
