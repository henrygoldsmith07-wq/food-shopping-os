import { describe, expect, it } from 'vitest';
import { DOMAIN_COMMANDS, DOMAIN_EVENTS, buildDomainCommands } from '../src/lib/store-commands.js';
import { DOMAIN_SLICES, allSliceKeys, selectSlice, sliceForKey } from '../src/lib/store-slices.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { LEDGER_EVENT_TYPES } from '../src/lib/event-ledger.js';

describe('store domain slices', () => {
  it('slices never overlap', () => {
    const keys = allSliceKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every slice key exists on EMPTY_STATE', () => {
    for (const key of allSliceKeys()) {
      expect(EMPTY_STATE, key).toHaveProperty(key);
    }
  });

  it('covers the food-loop state (pantry, plan, shopping, household, learning)', () => {
    for (const slice of ['pantry', 'plan', 'shopping', 'household', 'learning']) {
      expect(DOMAIN_SLICES[slice].keys.length).toBeGreaterThan(0);
    }
    expect(sliceForKey('pantry')).toBe('pantry');
    expect(sliceForKey('plan')).toBe('plan');
    expect(sliceForKey('shoppingList')).toBe('shopping');
    expect(sliceForKey('householdLedger')).toBe('household');
    expect(selectSlice({ pantry: [1], plan: {} }, 'pantry').pantry).toEqual([1]);
  });

  it('domain events mirror the ledger types', () => {
    expect([...DOMAIN_EVENTS].sort()).toEqual([...LEDGER_EVENT_TYPES].sort());
  });

  it('commands write one slice + one ledger event', () => {
    const writes = [];
    const set = (fn) => {
      const next = fn({ plan: {}, cooked: [], householdLedger: [], mealPlanEvents: [] });
      writes.push(next);
      return next;
    };
    const commands = buildDomainCommands(set);
    expect(DOMAIN_COMMANDS.every((c) => typeof commands[c] === 'function')).toBe(true);
    commands.planMeals({ date: '2026-09-01', slot: 'dinner', recipeId: 'r1' });
    expect(writes[0].plan['2026-09-01'].dinner).toBe('r1');
    expect(writes[0].householdLedger[0].type).toBe('MealPlanned');
    commands.skipPlannedMeal({ date: '2026-09-01', slot: 'dinner', reason: 'no-time' });
    expect(writes[1].householdLedger[0].type).toBe('MealSkipped');
    commands.respondToRecommendation({ recommendationId: 'x', accepted: true });
    expect(writes[2].householdLedger[0].type).toBe('RecommendationAccepted');
  });
});
