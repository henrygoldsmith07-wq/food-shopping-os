import { describe, it, expect } from 'vitest';
import { CONFIRM_THRESHOLD, isConfirmedSkipReason, confirmedSkipReasonIds, SKIP_PHRASES } from '../src/lib/skip-preferences.js';

describe('skip preferences', () => {
  it('needs enough confirmations and a latest answer that is still true', () => {
    expect(isConfirmedSkipReason({ applies: CONFIRM_THRESHOLD, lastStillApplies: true })).toBe(true);
    expect(isConfirmedSkipReason({ applies: CONFIRM_THRESHOLD - 1, lastStillApplies: true })).toBe(false);
    expect(isConfirmedSkipReason({ applies: 5, lastStillApplies: false })).toBe(false);
    expect(isConfirmedSkipReason(undefined)).toBe(false);
  });
  it('lists confirmed reasons strongest first and tolerates a missing profile', () => {
    const profile = {
      'no-time': { applies: 2, changed: 0, lastStillApplies: true },
      'plan-too-complex': { applies: 3, changed: 1, lastStillApplies: true },
      'missing-ingredients': { applies: 9, lastStillApplies: false },
    };
    expect(confirmedSkipReasonIds(profile)).toEqual(['plan-too-complex', 'no-time']);
    expect(confirmedSkipReasonIds(null)).toEqual([]);
  });
  it('has a phrase for every planner reason', () => {
    expect(Object.keys(SKIP_PHRASES).sort()).toEqual(['missing-ingredients', 'no-time', 'plan-too-complex']);
  });
});
