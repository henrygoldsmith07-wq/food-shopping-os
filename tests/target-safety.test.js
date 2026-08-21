import { describe, it, expect } from 'vitest';
import {
  ADULT_AGE, assessTarget, bmiOf, confirmationRecord, estimateRange, floorFor, isConfirmed,
  KCAL_FLOOR, MAX_DEFICIT_PCT, PLAUSIBLE, RESTRICTIVE_SCREENING, SCREENING_IDS, screeningOutcome,
  targetSignature, validateAge,
} from '../src/lib/target-safety.js';
import { bmr, computeTargets, resolveMaintenance, targetSafety, targetsFor } from '../src/lib/goals.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { agreedDeficit, CLEAR_SCREENING } from './helpers/target-safety.js';

/** An adult with everything Forq needs, so each test can spoil one thing. */
const ADULT = { sex: 'male', age: 34, heightCm: 178, weightKg: 82, activity: 'moderate' };
const stateFor = (extra = {}) => ({
  ...EMPTY_STATE,
  ...extra,
  body: { ...ADULT, ...(extra.body || {}) },
});
const warningIds = (report) => report.warnings.map((w) => w.id);

describe('1 · the age is checked before anything is built on it', () => {
  it('separates a missing age from an impossible one', () => {
    expect(validateAge(34)).toEqual({ status: 'ok', age: 34 });
    expect(validateAge(null).status).toBe('missing');
    expect(validateAge('').status).toBe('missing');
    expect(validateAge('abc').status).toBe('missing');
    expect(validateAge(0).status).toBe('implausible');
    expect(validateAge(900).status).toBe('implausible');
  });

  it('refuses a target rather than working around the gap', () => {
    const report = assessTarget({ goal: 'maintain', body: { ...ADULT, age: null }, maintenanceKcal: 2600 });
    expect(report.ready).toBe(false);
    expect(report.kcal).toBeNull();
    expect(warningIds(report)).toContain('age-missing');
    expect(assessTarget({ body: { ...ADULT, age: 400 }, maintenanceKcal: 2600 }).blocked).toBe(true);
  });
});

describe('2 · adults and children take different routes', () => {
  it('routes on the stated age and nothing else', () => {
    expect(assessTarget({ body: { ...ADULT, age: 15 } }).pathway).toBe('child');
    expect(assessTarget({ body: { ...ADULT, age: ADULT_AGE } }).pathway).toBe('adult');
    expect(assessTarget({ body: { ...ADULT, age: null } }).pathway).toBe('unknown');
  });

  it('never lets a child pathway reach a deficit, screened or not', () => {
    const child = agreedDeficit(stateFor({ goal: 'lose', body: { age: 15, weightKg: 55, heightCm: 165 } }));
    const report = targetSafety(child);
    expect(report.appliedGoal).toBe('maintain');
    expect(report.kcal).toBe(resolveMaintenance(child));
    expect(warningIds(report)).toContain('child-pathway');
  });
});

describe('3 · the inputs are checked for plausibility', () => {
  it('spots the units people actually get wrong', () => {
    expect(warningIds(assessTarget({ body: { ...ADULT, weightKg: 180 }, maintenanceKcal: 2600 })))
      .not.toContain('weight-implausible'); // 180 kg is a person
    expect(warningIds(assessTarget({ body: { ...ADULT, weightKg: 720 }, maintenanceKcal: 2600 })))
      .toContain('weight-implausible');
    expect(warningIds(assessTarget({ body: { ...ADULT, heightCm: 70 }, maintenanceKcal: 2600 })))
      .toContain('height-implausible');
    expect(warningIds(assessTarget({ body: { ...ADULT, weightKg: 40, heightCm: 200 }, maintenanceKcal: 2600 })))
      .toContain('bmi-implausible');
  });

  it('will not plan from a maintenance figure outside the possible range', () => {
    const report = assessTarget({ body: ADULT, maintenanceKcal: 12000 });
    expect(warningIds(report)).toContain('maintenance-implausible');
    expect(report.ready).toBe(false);
    expect(PLAUSIBLE.maintenanceKcal).toEqual([800, 6000]);
  });

  it('computes BMI only when both halves are there', () => {
    expect(bmiOf({ weightKg: 82, heightCm: 178 })).toBe(25.9);
    expect(bmiOf({ weightKg: 82 })).toBeNull();
  });
});

describe('4 · the deficit has a ceiling and the day has a floor', () => {
  it('holds any deficit to a fifth of maintenance', () => {
    const report = assessTarget({
      goal: 'lose', body: ADULT, maintenanceKcal: 2600, screening: CLEAR_SCREENING,
    });
    expect(report.factor).toBeGreaterThanOrEqual(1 - MAX_DEFICIT_PCT);
    expect(report.proposedKcal).toBe(2080);
  });

  it('floors the day at the higher of the published minimum and what the body burns', () => {
    // A small maintenance and a big deficit is where the old 1,000 kcal clamp
    // used to let something indefensible through.
    const body = { sex: 'female', age: 30, heightCm: 150, weightKg: 45, activity: 'sedentary' };
    const state = agreedDeficit(stateFor({ goal: 'lose', body }));
    const report = targetSafety(state);
    expect(report.floor.kcal).toBe(Math.max(KCAL_FLOOR.female, bmr(body)));
    expect(report.kcal).toBeGreaterThanOrEqual(report.floor.kcal);
    expect(report.kcal).toBeGreaterThan(1000);
  });

  it('says so when the floor is what decided the number', () => {
    const report = assessTarget({
      goal: 'lose',
      body: { sex: 'female', age: 30, heightCm: 150, weightKg: 45 },
      maintenanceKcal: 1450,
      bmrKcal: 1180,
      screening: CLEAR_SCREENING,
    });
    expect(report.floor.applied).toBe(true);
    expect(report.proposedKcal).toBe(1200);
    expect(warningIds(report)).toContain('floor-applied');
  });

  it('never floors above maintenance', () => {
    expect(floorFor({ sex: 'male', bmrKcal: 1800, maintenanceKcal: 1600 })).toBe(1600);
    expect(floorFor({ sex: 'unspecified' })).toBe(KCAL_FLOOR.unspecified);
  });
});

describe('5 · unusual estimates are said out loud', () => {
  it('warns when the rate of loss is faster than steady', () => {
    const report = assessTarget({
      goal: 'lose',
      body: { sex: 'male', age: 30, heightCm: 168, weightKg: 58 },
      maintenanceKcal: 3400,
      bmrKcal: 1600,
      screening: CLEAR_SCREENING,
    });
    expect(warningIds(report)).toContain('rapid-loss');
    expect(report.deficit.proposedWeeklyKg).toBeGreaterThan(0.55);
  });

  it('adds caution rather than a block over 65', () => {
    const report = assessTarget({
      goal: 'lose', body: { ...ADULT, age: 70 }, maintenanceKcal: 2200, screening: CLEAR_SCREENING,
    });
    const older = report.warnings.find((w) => w.id === 'older-adult');
    expect(older.severity).toBe('caution');
    expect(report.proposedKcal).toBeLessThan(2200);
  });
});

describe('6 · incomplete inputs produce no target at all', () => {
  it('names what is missing instead of guessing it', () => {
    const report = assessTarget({ goal: 'maintain', body: { sex: 'male' } });
    expect(report.personalised).toBe(false);
    expect(report.kcal).toBeNull();
    expect(report.missing).toEqual(['age', 'weight', 'height', 'maintenance']);
  });

  it('accepts a typed maintenance in place of the body stats', () => {
    const report = assessTarget({
      goal: 'maintain', body: { age: 34, sex: 'female' }, maintenanceKcal: 2100, typedMaintenance: 2100,
    });
    expect(report.ready).toBe(true);
    expect(report.kcal).toBe(2100);
  });

  it('leaves the reference figures on screen rather than a personal one', () => {
    const targets = targetsFor({ ...EMPTY_STATE, goal: 'lose' });
    expect(targetSafety({ ...EMPTY_STATE, goal: 'lose' }).personalised).toBe(false);
    expect(targets.kcal).toBe(EMPTY_STATE.targets.kcal);
  });
});

describe('7 · restrictive goals are screened for first', () => {
  it('asks before it offers, and plans at maintenance until answered', () => {
    const report = assessTarget({ goal: 'lose', body: ADULT, maintenanceKcal: 2600 });
    expect(report.screening.required).toBe(true);
    expect(report.screening.complete).toBe(false);
    expect(report.appliedGoal).toBe('maintain');
    expect(report.kcal).toBe(2600);
    expect(warningIds(report)).toContain('screening-required');
  });

  it('treats any flag as a no, and names who can help', () => {
    const report = assessTarget({
      goal: 'lose',
      body: ADULT,
      maintenanceKcal: 2600,
      screening: { ...CLEAR_SCREENING, control: 'yes' },
    });
    expect(report.screening.flagged).toEqual(['control']);
    expect(report.appliedGoal).toBe('maintain');
    expect(report.support.join(' ')).toContain('0808 801 0677');
  });

  it('does not score the answers, it counts them', () => {
    expect(RESTRICTIVE_SCREENING).toHaveLength(5);
    expect(screeningOutcome(null)).toEqual({ complete: false, clear: false, flagged: [] });
    expect(screeningOutcome({ control: 'no' }).complete).toBe(false);
    expect(screeningOutcome(CLEAR_SCREENING)).toEqual({ complete: true, clear: true, flagged: [] });
    expect(SCREENING_IDS).toContain('pregnancy');
  });

  it('refuses a deficit outright below a healthy BMI, screen or no screen', () => {
    const report = assessTarget({
      goal: 'lose',
      body: { sex: 'female', age: 26, heightCm: 170, weightKg: 50 },
      maintenanceKcal: 1900,
      screening: CLEAR_SCREENING,
    });
    expect(report.bmi).toBe(17.3);
    expect(report.appliedGoal).toBe('maintain');
    expect(warningIds(report)).toContain('bmi-low');
  });

  it('asks nothing extra of the goals that are not restriction', () => {
    const report = assessTarget({ goal: 'muscle', body: ADULT, maintenanceKcal: 2600 });
    expect(report.screening.required).toBe(false);
    expect(report.confirmation.required).toBe(false);
    expect(report.kcal).toBe(2860);
  });
});

describe('8 · a range rather than false precision', () => {
  it('reports the band the equation actually supports', () => {
    expect(estimateRange(2000)).toEqual({ low: 1800, high: 2200, pct: 10 });
    expect(estimateRange(null)).toBeNull();
    const report = assessTarget({ goal: 'maintain', body: ADULT, maintenanceKcal: 2600 });
    expect(report.range.low).toBeLessThan(report.kcal);
    expect(report.range.high).toBeGreaterThan(report.kcal);
  });
});

describe('9 · a deficit waits for a person to agree to it', () => {
  it('plans at maintenance until the proposal is confirmed', () => {
    const screened = stateFor({ goal: 'lose', goalScreening: CLEAR_SCREENING });
    const before = targetSafety(screened);
    expect(before.confirmation.required).toBe(true);
    expect(before.confirmation.given).toBe(false);
    expect(before.kcal).toBe(resolveMaintenance(screened));
    expect(before.proposedKcal).toBeLessThan(before.kcal);
    expect(warningIds(before)).toContain('confirmation-required');

    const after = targetSafety(agreedDeficit(stateFor({ goal: 'lose' })));
    expect(after.confirmation.given).toBe(true);
    expect(after.kcal).toBe(before.proposedKcal);
    expect(targetsFor(agreedDeficit(stateFor({ goal: 'lose' }))).kcal).toBe(after.kcal);
  });

  it('agrees to one target, not to deficits in general', () => {
    const state = agreedDeficit(stateFor({ goal: 'lose' }));
    const moved = { ...state, body: { ...state.body, weightKg: 95 } };
    expect(targetSafety(moved).confirmation.given).toBe(false);
    expect(targetSignature({ goal: 'lose', kcal: 2000 })).toBe('lose:2000');
    expect(isConfirmed(confirmationRecord('lose:2000', '2026-08-03'), 'lose:2000')).toBe(true);
    expect(isConfirmed(null, 'lose:2000')).toBe(false);
  });
});

describe('10 · the people who can help are named', () => {
  it('always signposts, and says more when there is more to say', () => {
    expect(assessTarget({ goal: 'maintain', body: ADULT, maintenanceKcal: 2600 }).support[0])
      .toContain('registered dietitian');
    const older = assessTarget({
      goal: 'lose', body: { ...ADULT, age: 70 }, maintenanceKcal: 2200, screening: CLEAR_SCREENING,
    });
    expect(older.support.join(' ')).toContain('muscle and bone');
  });
});

describe('the old universal floor is gone', () => {
  it('no longer treats 1,000 kcal as the answer to anything', () => {
    // The clamp would have produced 1,000 here and called it safe.
    const report = assessTarget({
      goal: 'lose',
      body: { sex: 'female', age: 40, heightCm: 160, weightKg: 60 },
      maintenanceKcal: 700,
      bmrKcal: 1300,
      screening: CLEAR_SCREENING,
    });
    expect(warningIds(report)).toContain('maintenance-implausible');
    expect(report.kcal).toBeNull();
    // And the bare arithmetic path floors on the body rather than on 1,000.
    expect(computeTargets({ goal: 'lose', maintenanceKcal: 1500, sex: 'female', bmrKcal: 1350 }).kcal)
      .toBe(1350);
  });
});
