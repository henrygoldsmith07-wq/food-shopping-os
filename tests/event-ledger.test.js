import { describe, expect, it } from 'vitest';
import {
  LEDGER_EVENT_TYPES, appendLedgerEvent, createLedgerEvent, isLedgerType,
  ledgerCounts, ledgerEvents, recommendationAcceptance,
} from '../src/lib/event-ledger.js';

describe('household event ledger', () => {
  it('covers every required event type', () => {
    for (const t of ['MealPlanned', 'MealCooked', 'MealSkipped', 'IngredientPurchased',
      'IngredientWasted', 'LeftoverCreated', 'PantryCorrected',
      'RecommendationAccepted', 'RecommendationRejected']) {
      expect(LEDGER_EVENT_TYPES).toContain(t);
      expect(isLedgerType(t)).toBe(true);
    }
  });

  it('rejects unknown types', () => {
    expect(() => createLedgerEvent('Nope', {})).toThrow();
    expect(isLedgerType('Nope')).toBe(false);
  });

  it('appends immutably and caps at 500', () => {
    let state = {};
    for (let i = 0; i < 505; i++) {
      state = appendLedgerEvent(state, createLedgerEvent('MealCooked', { recipeId: `r${i}` }));
    }
    expect(state.householdLedger).toHaveLength(500);
    expect(state.householdLedger[0].recipeId).toBe('r5');
  });

  it('ignores invalid appends', () => {
    expect(appendLedgerEvent({}, null)).toEqual({});
    expect(appendLedgerEvent({}, { type: 'Nope' })).toEqual({});
  });

  it('queries by type and date window', () => {
    let state = {};
    state = appendLedgerEvent(state, createLedgerEvent('MealPlanned', { date: '2026-09-01' }, { at: '2026-09-01T10:00:00.000Z' }));
    state = appendLedgerEvent(state, createLedgerEvent('MealSkipped', { date: '2026-09-02' }, { at: '2026-09-02T10:00:00.000Z' }));
    state = appendLedgerEvent(state, createLedgerEvent('MealCooked', { date: '2026-09-03' }, { at: '2026-09-03T10:00:00.000Z' }));
    expect(ledgerEvents(state, { type: 'MealSkipped' })).toHaveLength(1);
    expect(ledgerEvents(state, { since: '2026-09-02', until: '2026-09-03' })).toHaveLength(2);
    expect(ledgerCounts(state).total).toBe(3);
  });

  it('measures recommendation acceptance honestly', () => {
    expect(recommendationAcceptance({}).rate).toBeNull();
    let state = {};
    state = appendLedgerEvent(state, createLedgerEvent('RecommendationAccepted', { recommendationId: 'a' }));
    state = appendLedgerEvent(state, createLedgerEvent('RecommendationAccepted', { recommendationId: 'b' }));
    state = appendLedgerEvent(state, createLedgerEvent('RecommendationRejected', { recommendationId: 'c' }));
    const acc = recommendationAcceptance(state);
    expect(acc.rate).toBeCloseTo(0.67, 2);
    expect(acc.total).toBe(3);
  });
});
