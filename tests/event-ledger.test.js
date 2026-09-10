import { describe, expect, it } from 'vitest';
import {
  LEDGER_EVENT_TYPES, appendLedgerEvent, createLedgerEvent, isLedgerType,
  ledgerCounts, ledgerEvents, recommendationAcceptance, replayLedger,
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

describe('ledger replay', () => {
  const event = (id, type, at, extra = {}) => ({
    id, type, at, day: String(at).slice(0, 10), origin: 'user', ...extra,
  });

  it('folds out-of-order events chronologically, not in array order', () => {
    const projection = replayLedger([
      event('e3', 'MealCooked', '2026-09-03T18:00:00.000Z'),
      event('e1', 'MealPlanned', '2026-09-01T09:00:00.000Z'),
      event('e2', 'MealSkipped', '2026-09-02T19:00:00.000Z'),
    ]);
    expect(projection.total).toBe(3);
    expect(projection.planned).toBe(1);
    expect(projection.skipped).toBe(1);
    expect(projection.cooked).toBe(1);
    // lastEvent is the newest by time, whichever position it arrived in.
    expect(projection.lastEvent).toMatchObject({ id: 'e3', type: 'MealCooked' });
  });

  it('replays the same array in any permutation to the same projection', () => {
    const events = [
      event('e1', 'MealPlanned', '2026-09-01T09:00:00.000Z'),
      event('e2', 'MealSkipped', '2026-09-02T19:00:00.000Z'),
      event('e3', 'MealCooked', '2026-09-03T18:00:00.000Z'),
      event('e4', 'IngredientWasted', '2026-09-04T08:00:00.000Z', { name: 'Rice' }),
      event('e5', 'WeekRecovered', '2026-09-04T09:00:00.000Z'),
    ];
    const baseline = replayLedger(events);
    const shuffled = replayLedger([...events].reverse());
    // Deterministic: counts, per-day rollups and the last event all agree.
    expect(shuffled.total).toBe(baseline.total);
    expect(shuffled.lastEvent).toEqual(baseline.lastEvent);
    expect(shuffled.byDay).toEqual(baseline.byDay);
    expect(shuffled.weeksRecovered).toBe(1);
  });

  it('breaks same-instant ties on id so replay is stable', () => {
    const sameInstant = [
      event('e-b', 'MealCooked', '2026-09-01T12:00:00.000Z'),
      event('e-a', 'MealPlanned', '2026-09-01T12:00:00.000Z'),
    ];
    const one = replayLedger(sameInstant);
    const two = replayLedger([...sameInstant].reverse());
    // Both orders agree the later-id event happened last.
    expect(one.lastEvent).toEqual(two.lastEvent);
    expect(one.lastEvent.id).toBe('e-b');
  });

  it('replays a duplicate id once and names it', () => {
    const projection = replayLedger([
      event('dup', 'MealCooked', '2026-09-01T10:00:00.000Z'),
      event('dup', 'MealCooked', '2026-09-01T10:00:00.000Z'),
      event('ok', 'MealCooked', '2026-09-02T10:00:00.000Z'),
    ]);
    expect(projection.total).toBe(2);
    expect(projection.cooked).toBe(2);
    expect(projection.duplicates).toEqual(['dup']);
  });

  it('carries provenance through the fold and reports the last origin', () => {
    const projection = replayLedger([
      event('e1', 'MealSkipped', '2026-09-01T09:00:00.000Z', { origin: 'user' }),
      event('e2', 'WeekRecovered', '2026-09-01T11:00:00.000Z', { origin: 'recovery' }),
    ]);
    expect(projection.lastEvent.origin).toBe('recovery');
    expect(projection.weeksRecovered).toBe(1);
  });

  it('ignores unknown types and unstamped events never lead the fold', () => {
    const projection = replayLedger([
      { id: 'bad', type: 'NotAType', at: '2026-09-01T08:00:00.000Z' },
      { id: 'nostamp', type: 'MealCooked' },
      event('e1', 'MealPlanned', '2026-09-01T09:00:00.000Z'),
    ]);
    expect(projection.total).toBe(2);
    // The unstamped event folds last rather than pretending to be first.
    expect(projection.lastEvent.id).toBe('nostamp');
  });
});
