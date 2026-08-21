/**
 * Under-18 mode.
 *
 * Forq asks for an age during onboarding, so it already knows when the person
 * using it is a child or a young person. Until now that knowledge did nothing:
 * "child mode" was a label on a household member somebody had tapped, not a
 * property of the primary user, so a fifteen-year-old got the adult app —
 * deficits, fasting, alcohol targets, calorie debt and all.
 *
 * This module is the single place that decides. Everything else asks it rather
 * than re-reading `body.age`, so there is one rule and one set of consequences.
 *
 * The shape of the rules follows NICE NG246, which asks that dietary approaches
 * for children and young people be age-appropriate, focused on healthy eating
 * rather than restriction, and part of a wider supported approach; and the NHS
 * child-weight position, which assesses on age- and sex-specific centiles
 * rather than adult bands. Neither is reproduced here as advice — what the app
 * does instead is stop making the claims it cannot responsibly make, and point
 * to the people who can.
 */

import { BODY_GOALS } from '../data/goals.js';

/** Eighteen is the line. Nothing here is a judgement about a particular age. */
export const YOUTH_AGE = 18;

/**
 * Ages outside this range are typing mistakes rather than users, and a typo
 * shouldn't silently move somebody into — or out of — a different app.
 */
export const AGE_MIN = 2;
export const AGE_MAX = 120;

/** The stated age, or null when there isn't a usable one. */
export const ageOf = (state = {}) => {
  const value = Number(state?.body?.age);
  if (!Number.isFinite(value)) return null;
  const age = Math.round(value);
  return age >= AGE_MIN && age <= AGE_MAX ? age : null;
};

/** Under 18 by the age given at setup. An unknown age is not under 18. */
export const isUnderEighteen = (state = {}) => {
  const age = ageOf(state);
  return age !== null && age < YOUTH_AGE;
};

/** The household profile currently in use, if it is a child one. */
const activeChildProfile = (state = {}) => {
  const member = (state.members || []).find((item) => item.id === state.activeMemberId);
  return member && member.role === 'child' ? member : null;
};

/* ---------- Goals ---------- */

/**
 * Goals that ask the body to lose weight. Under 18 these are not offered and
 * their multipliers are not applied, however the goal got set — an imported
 * backup, a birthday, or an adult handing the phone over.
 */
export const DEFICIT_GOALS = BODY_GOALS.filter((goal) => goal.kcalFactor < 1).map((goal) => goal.id);

export const YOUTH_GOALS = BODY_GOALS.filter((goal) => goal.kcalFactor >= 1).map((goal) => goal.id);

/** A goal that is safe to act on for this user; deficits fall back to maintenance. */
export const youthGoal = (goal) => (YOUTH_GOALS.includes(goal) ? goal : 'maintain');

/** Energy factors are never allowed below maintenance under 18. */
export const youthKcalFactor = (factor) => Math.max(1, Number(factor) || 1);

/* ---------- Caffeine ---------- */

/**
 * Age-appropriate caffeine, rather than the adult 400 mg figure.
 *
 * EFSA's opinion is 3 mg per kg of body weight a day for children and
 * adolescents, which is what we use whenever a weight has been given. Without
 * one, the fallbacks are the age bands Health Canada publishes for the same
 * group — deliberately the lower, blunter answer, because a body we don't know
 * shouldn't be guessed at.
 */
export const ADULT_CAFFEINE_MG = 400;

export const caffeineLimitMg = ({ age = null, weightKg = null } = {}) => {
  if (weightKg > 0) return Math.min(ADULT_CAFFEINE_MG, Math.round(weightKg * 3));
  if (age === null) return 85;
  if (age < 10) return 45;
  if (age < 13) return 85;
  return 100;
};

/* ---------- Permissions and consent ---------- */

/**
 * What a child profile in a household can do before anybody grants more.
 * Stricter than the adult default: spending stays with the adults, and health
 * records are never shared by default.
 */
export const YOUTH_PERMISSIONS = {
  shopping: false,
  pantry: true,
  recipes: true,
  health: false,
};

/** Coach and trainer links under 18 never carry health records. */
export const YOUTH_SHARE_SCOPES = ['diary', 'nutrition', 'plan'];

export const youthShareScopes = (scopes = []) => scopes.filter((scope) => YOUTH_SHARE_SCOPES.includes(scope));

/* ---------- The words ---------- */

/**
 * Neutral signposting. It names the people who can actually help and makes no
 * claim about whether this user needs any of them.
 */
export const YOUTH_SIGNPOST =
  'If you have questions or worries about weight, growth or eating, a parent or carer, your GP, a school nurse or a registered dietitian is the right place to take them. Forq is a food app and cannot answer them.';

export const YOUTH_COPY = {
  mode: 'Forq is set up for under-18s, because of the age you gave. That changes what it does, not what you can log.',
  targets: 'Targets are set at maintenance — the energy a body of your age, height and weight uses in a day. Forq does not set a calorie deficit for anyone under 18.',
  goals: 'Weight-loss and body-recomposition goals are not offered under 18. Maintenance, weight gain and muscle gain are.',
  balance: 'What Forq encourages instead: balanced meals, eating regularly through the day, and variety across the week.',
  weekly: 'There is no weekly calorie budget to pay back. Days are read one at a time, and a bigger day is not a debt.',
  fasting: 'Fasting tools are not part of the under-18 app.',
  alcohol: 'Alcohol targets are not part of the under-18 app.',
  caffeine: 'Caffeine guidance here is for your age and weight, not the adult 400 mg figure. Energy drinks are the usual source, and they add up quickly.',
  exercise: 'Exercise is not converted into extra calories to eat. Food is not something to earn, and training is worth logging for its own sake.',
  adherence: 'Streaks and challenges here count meals cooked, days logged and plans made. Landing exactly on a calorie number is not scored.',
  prediction: 'Forq does not predict body changes for under-18s. Growth makes that arithmetic wrong, and a projection is not something this app should put in front of you.',
  measurement: 'Weight in childhood and adolescence is read against age- and sex-specific centiles, which is a clinical assessment rather than something an app can do from a number. Forq shows what you recorded and nothing more.',
  comparison: 'Forq does not rank or compare bodies between people, in a household or anywhere else.',
  consent: 'Under-18 setup asks separately about what leaves this device. Product insights stay off, health records are never included in a coach link, and sharing starts closed.',
  sharing: 'Sharing starts closed: spending, health records and coach access are all off until an adult in the household turns them on.',
  signpost: YOUTH_SIGNPOST,
};

/* ---------- The policy ---------- */

/**
 * Everything the app needs to know about this user's mode, in one object.
 *
 * `on` is the switch; the named flags say what that means, so no screen has to
 * re-derive the rule from an age and get it subtly different.
 */
export const youthPolicy = (state = {}) => {
  const age = ageOf(state);
  const byAge = isUnderEighteen(state);
  const childProfile = activeChildProfile(state);
  const on = byAge || Boolean(childProfile);

  return {
    on,
    age: byAge ? age : null,
    /** Why it's on: the age given at setup, or the household profile in use. */
    source: byAge ? 'age' : childProfile ? 'profile' : null,
    profileName: childProfile?.name || null,
    /* 1–2: no deficits, no weight-loss or recomposition multipliers */
    deficitTargets: !on,
    goals: on ? YOUTH_GOALS : BODY_GOALS.map((goal) => goal.id),
    /* 3–5: fasting and alcohol out, caffeine by age */
    fasting: !on,
    alcohol: !on,
    caffeineLimitMg: on
      ? caffeineLimitMg({ age, weightKg: state.body?.weightKg || null })
      : ADULT_CAFFEINE_MG,
    /* 6–7: no debt language, no weekly compensation */
    calorieDebtLanguage: !on,
    weeklyCompensation: !on,
    /* 8–9: adherence isn't a game, exercise isn't currency */
    calorieAdherenceScoring: !on,
    exerciseEatBack: !on,
    /* 10: no body comparison between people */
    bodyComparisons: !on,
    /* 11–12: what it says instead */
    balancedEating: on,
    signpost: on ? YOUTH_SIGNPOST : null,
    /* 13–15: consent, sharing, predictions */
    separateConsent: on,
    strictSharing: on,
    bodyChangePredictions: !on,
    consentGiven: Boolean(state.youthConsent),
  };
};

/** Consent record written by the under-18 setup flow. */
export const youthConsentRecord = (day) => ({
  acceptedAt: day,
  productInsights: false,
  healthSharing: false,
});
