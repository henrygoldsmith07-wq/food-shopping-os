import { describe, it, expect } from 'vitest';
import {
  ageOf, caffeineLimitMg, isUnderEighteen, YOUTH_GOALS, YOUTH_PERMISSIONS,
  youthGoal, youthKcalFactor, youthPolicy, youthShareScopes,
} from '../src/lib/youth.js';
import { computeTargets, goalSummary, resolveMaintenance, targetsFor } from '../src/lib/goals.js';
import { predictProgress } from '../src/lib/coach.js';
import { activityAdjustment } from '../src/lib/exercise.js';
import { streaks, weeklyChallenges, xpBreakdown } from '../src/lib/progress.js';
import { personalTips, mealFeedback } from '../src/lib/advice.js';
import { permissionsForRole } from '../src/lib/household.js';
import { deriveApp } from '../src/lib/derive.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';
import { agreedDeficit } from './helpers/target-safety.js';

const person = (age, extra = {}) => ({
  ...EMPTY_STATE,
  ...extra,
  body: { ...EMPTY_STATE.body, weightKg: 60, heightCm: 168, age, ...(extra.body || {}) },
});

const dayOf = (kcal) => [{ meal: 'lunch', time: '13:00', grams: 100, per100: { kcal, protein: 10 } }];

describe('who under-18 mode is for', () => {
  it('reads the age given at setup, and nothing else', () => {
    expect(isUnderEighteen(person(15))).toBe(true);
    expect(isUnderEighteen(person(17))).toBe(true);
    expect(isUnderEighteen(person(18))).toBe(false);
    expect(isUnderEighteen(person(42))).toBe(false);
  });

  it('does not guess when the age is missing or nonsense', () => {
    expect(isUnderEighteen(EMPTY_STATE)).toBe(false);
    expect(isUnderEighteen(person(0))).toBe(false);
    expect(isUnderEighteen(person(900))).toBe(false);
    expect(ageOf(person(null))).toBe(null);
  });

  it('stays on when a child household profile is the one in use', () => {
    const state = {
      ...person(40),
      members: [{ id: 'm1', name: 'Rae', role: 'child', portions: 1, diets: [] }],
      activeMemberId: 'm1',
    };
    const policy = youthPolicy(state);
    expect(policy.on).toBe(true);
    expect(policy.source).toBe('profile');
    // The adult's own age is not disclosed by a profile switch.
    expect(policy.age).toBe(null);
  });
});

describe('1–2 · no deficits, no weight-loss multipliers', () => {
  it('never takes the day below maintenance', () => {
    const adult = computeTargets({ goal: 'lose', maintenanceKcal: 2200 });
    const young = computeTargets({ goal: 'lose', maintenanceKcal: 2200, youth: true });
    expect(adult.kcal).toBe(1760);
    expect(young.kcal).toBe(2200);
    expect(computeTargets({ goal: 'recomp', maintenanceKcal: 2200, youth: true }).kcal).toBe(2200);
  });

  it('keeps the surplus goals, which are not restriction', () => {
    expect(YOUTH_GOALS).toEqual(['gain', 'maintain', 'muscle']);
    expect(youthGoal('lose')).toBe('maintain');
    expect(youthGoal('recomp')).toBe('maintain');
    expect(youthGoal('muscle')).toBe('muscle');
    expect(youthKcalFactor(0.8)).toBe(1);
    expect(youthKcalFactor(1.15)).toBe(1.15);
  });

  it('applies the rule to a stored goal, not just a chosen one', () => {
    // A backup, a birthday or an adult handing the phone over all land here.
    const state = person(16, { goal: 'lose' });
    const maintenance = resolveMaintenance(state);
    expect(targetsFor(state).kcal).toBe(maintenance);
    // The adult with the same body does get the deficit — once the safety
    // system's own gates have been passed, which is a separate question.
    const adult = { ...state, body: { ...state.body, age: 30 } };
    expect(targetsFor(agreedDeficit(adult)).kcal).toBeLessThan(resolveMaintenance(adult));
    expect(goalSummary(state)).toBe('Maintenance');
    expect(goalSummary({ ...state, body: { ...state.body, age: 30 } })).toBe('Weight loss');
  });
});

describe('3–5 · fasting, alcohol and caffeine', () => {
  it('gives no fasting summary at all', () => {
    const log = { '2026-08-01': dayOf(500), '2026-08-02': dayOf(500), '2026-08-03': dayOf(500) };
    const young = deriveApp({ ...person(14), day: '2026-08-03', log });
    expect(young.fasting.hidden).toBe(true);
    expect(young.fasting.ready).toBe(false);
    expect(deriveApp({ ...person(30), day: '2026-08-03', log }).fasting.hidden).toBeUndefined();
  });

  it('sets no alcohol allowance', () => {
    expect(targetsFor(person(16)).alcohol).toBe(0);
    expect(targetsFor(person(30)).alcohol).toBe(DEFAULT_TARGETS.alcohol);
    expect(youthPolicy(person(16)).alcohol).toBe(false);
  });

  it('uses an age-appropriate caffeine figure rather than the adult 400 mg', () => {
    // EFSA: 3 mg per kg of body weight for children and adolescents.
    expect(caffeineLimitMg({ age: 15, weightKg: 55 })).toBe(165);
    expect(targetsFor(person(15, { body: { weightKg: 55 } })).caffeine).toBe(165);
    // Without a weight, the blunter age bands rather than a guessed body.
    expect(caffeineLimitMg({ age: 8 })).toBe(45);
    expect(caffeineLimitMg({ age: 11 })).toBe(85);
    expect(caffeineLimitMg({ age: 16 })).toBe(100);
    expect(targetsFor(person(30)).caffeine).toBe(400);
  });
});

describe('6–9 · debt, compensation, scoring and earning', () => {
  it('drops the "you are X over" line from meal feedback', () => {
    const entries = [{ meal: 'dinner', grams: 100, per100: { kcal: 900, protein: 20, fibre: 1 } }];
    const targets = { kcal: 800, protein: 100 };
    expect(mealFeedback(entries, 'dinner', { targets }).suggestion).toMatch(/over/);
    expect(String(mealFeedback(entries, 'dinner', { targets, youth: true }).suggestion || ''))
      .not.toMatch(/over/);
  });

  it('turns off weekly compensation', () => {
    expect(youthPolicy(person(16)).weeklyCompensation).toBe(false);
    expect(youthPolicy(person(19)).weeklyCompensation).toBe(true);
  });

  it('stops scoring exact calorie adherence', () => {
    const log = {};
    for (let day = 1; day <= 6; day += 1) log[`2026-08-0${day}`] = dayOf(2000);
    const state = { ...person(15), log, targets: { ...DEFAULT_TARGETS, kcal: 2000 } };
    const adult = { ...state, body: { ...state.body, age: 30 } };

    expect(streaks(state, '2026-08-06').onTarget).toBe(null);
    expect(streaks(adult, '2026-08-06').onTarget.days).toBeGreaterThan(0);
    expect(xpBreakdown(state, '2026-08-06').map((row) => row.key)).not.toContain('onTargetDay');
    expect(xpBreakdown(adult, '2026-08-06').map((row) => row.key)).toContain('onTargetDay');

    // And the challenge that counts them is out of the rotation, every week.
    for (let week = 0; week < 10; week += 1) {
      const day = new Date(Date.UTC(2026, 8, 7 + week * 7)).toISOString().slice(0, 10);
      expect(weeklyChallenges(state, day).map((c) => c.metric)).not.toContain('onTargetDaysThisWeek');
    }
  });

  it('never turns exercise into calories to eat back', () => {
    const workouts = [{ date: '2026-08-03', type: 'running', minutes: 40, kcal: 400 }];
    const state = { ...person(15), workouts, targets: { kcal: 2000 }, countExerciseKcal: true };
    const young = activityAdjustment(state, '2026-08-03');
    expect(young.counted).toBe(false);
    expect(young.adjusted).toBe(2000);
    expect(young.note).toMatch(/not something to earn/i);
    // The same state at 30 honours the toggle.
    const adult = activityAdjustment({ ...state, body: { ...state.body, age: 30 } }, '2026-08-03');
    expect(adult.adjusted).toBe(2400);
  });
});

describe('10–12 · comparison, balance and signposting', () => {
  it('makes no body comparison between people', () => {
    expect(youthPolicy(person(16)).bodyComparisons).toBe(false);
  });

  it('says balanced meals, regular eating and variety, and signposts', () => {
    const log = {};
    for (let day = 1; day <= 6; day += 1) {
      log[`2026-08-0${day}`] = [
        { meal: 'lunch', time: '13:00', name: 'Soup', grams: 100, per100: { kcal: 300, protein: 10 } },
        { meal: 'dinner', time: '19:00', name: 'Pasta', grams: 100, per100: { kcal: 500, protein: 15 } },
      ];
    }
    const tips = personalTips({ ...person(15), log }, { today: '2026-08-06' });
    const text = tips.map((tip) => `${tip.title} ${tip.detail}`).join(' ');
    expect(text).toMatch(/balanced/i);
    expect(text).toMatch(/regularly/i);
    expect(text).toMatch(/parent or carer, your GP, a school nurse or a registered dietitian/);
    // And nothing about a pace, a deficit or a weekly budget.
    expect(text).not.toMatch(/deficit|weekly calorie budget/i);
  });
});

describe('13–15 · consent, sharing and predictions', () => {
  it('asks for consent separately, and records the answer', () => {
    const policy = youthPolicy(person(16));
    expect(policy.separateConsent).toBe(true);
    expect(policy.consentGiven).toBe(false);
    expect(youthPolicy(person(16, { youthConsent: { acceptedAt: '2026-08-03' } })).consentGiven).toBe(true);
  });

  it('starts sharing closed and keeps health out of a coach link', () => {
    expect(youthPolicy(person(16)).strictSharing).toBe(true);
    expect(permissionsForRole('child')).toEqual(YOUTH_PERMISSIONS);
    expect(permissionsForRole('child').shopping).toBe(false);
    expect(permissionsForRole('child').health).toBe(false);
    expect(permissionsForRole('adult').shopping).toBe(true);
    expect(youthShareScopes(['diary', 'health', 'plan'])).toEqual(['diary', 'plan']);
  });

  it('predicts no body change, however much has been logged', () => {
    const log = {};
    for (let day = 1; day <= 9; day += 1) log[`2026-08-0${day}`] = dayOf(1500);
    const state = { ...person(15, { maintenanceKcal: 2200 }), log };
    const young = predictProgress(state, { today: '2026-08-09' });
    expect(young.ready).toBe(false);
    expect(young.youth).toBe(true);
    expect(young.perWeekKg).toBeUndefined();
    // The same diary at 30 does produce an estimate, so this is the age rule.
    expect(predictProgress({ ...state, body: { ...state.body, age: 30 } }, { today: '2026-08-09' }).ready).toBe(true);
  });
});
