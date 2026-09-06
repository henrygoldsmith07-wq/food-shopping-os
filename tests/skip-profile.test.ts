import { describe, expect, it } from 'vitest';
import {
  emptyProfile,
  foldSkipReflection,
  reflectionTotal,
  skipReflectionFor,
} from '../src/domain/skip-profile';

/**
 * The skip-reason reflection profile: every answer to "does this reason
 * still apply?" folds into a per-reason tally. Pure and immutable — the
 * store action is a one-line write around these.
 */
describe('the skip-reason reflection profile', () => {
  it('a first answer starts a reason from zero with the right side counted', () => {
    const profile = foldSkipReflection(emptyProfile(), 'no-time', true, 1000);
    expect(profile['no-time']).toEqual({ applies: 1, changed: 0, lastStillApplies: true, lastAt: 1000 });
    // The untouched profile object was not mutated.
    expect(Object.keys(emptyProfile())).toEqual([]);
  });

  it('repeated answers increment only their own side and record the last take', () => {
    let profile = foldSkipReflection(emptyProfile(), 'no-time', true, 1);
    profile = foldSkipReflection(profile, 'no-time', true, 2);
    profile = foldSkipReflection(profile, 'no-time', false, 3);
    expect(profile['no-time'].applies).toBe(2);
    expect(profile['no-time'].changed).toBe(1);
    expect(profile['no-time'].lastStillApplies).toBe(false); // the most recent answer
    expect(profile['no-time'].lastAt).toBe(3);
  });

  it('reasons are independent — one reason never touches another', () => {
    let profile = foldSkipReflection(emptyProfile(), 'no-time', true, 1);
    profile = foldSkipReflection(profile, 'missing-ingredients', false, 2);
    expect(profile['no-time']).toEqual({ applies: 1, changed: 0, lastStillApplies: true, lastAt: 1 });
    expect(profile['missing-ingredients'].changed).toBe(1);
  });

  it('reads return null for an unreflected reason, and the total sums every answer', () => {
    const profile = foldSkipReflection(
      foldSkipReflection(emptyProfile(), 'no-time', true, 1),
      'no-time',
      false,
      2,
    );
    expect(skipReflectionFor(profile, 'no-time')).not.toBeNull();
    expect(skipReflectionFor(profile, 'takeaway')).toBeNull();
    expect(reflectionTotal(profile)).toBe(2);
    expect(reflectionTotal(emptyProfile())).toBe(0);
  });
});
