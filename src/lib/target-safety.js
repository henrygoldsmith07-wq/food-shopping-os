/**
 * The safety system around a calorie target.
 *
 * What used to stand here was one clamp — `Math.max(1000, calculated)` — which
 * is not a safety system. It let a target be built from a missing age, from a
 * height typed in inches, or from a deficit nobody had agreed to, and then made
 * the result look authoritative by printing it to the nearest calorie.
 *
 * This module replaces the clamp with the checks that actually decide whether a
 * number should exist at all:
 *
 *   1. the age is real, and in range;
 *   2. under 18 goes down a different path entirely (see `youth.js`);
 *   3. the body figures are plausible before anything is computed from them;
 *   4. a deficit has a ceiling, and the day has a floor under it;
 *   5. anything unusual is said out loud rather than absorbed;
 *   6. incomplete inputs produce no personal target — not a guessed one;
 *   7. restrictive goals are screened for before they are offered;
 *   8. the answer is a range, because the equation behind it is an estimate;
 *   9. a deficit is not applied until the person has confirmed it;
 *  10. and the people who can actually help are named.
 *
 * Nothing here is medical advice or a diagnosis, and the screen in (7) is a
 * gate on what this app will do — not an assessment of anybody. The figures
 * follow published guidance: Mifflin-St Jeor predicts resting energy within
 * about 10% for most people (hence the range), NHS reference intakes are around
 * 2,000 kcal for women and 2,500 for men, and diets below roughly 800 kcal are
 * for clinical supervision rather than an app.
 */

import { bodyGoal } from '../data/goals.js';
import { AGE_MAX, AGE_MIN, YOUTH_AGE, youthGoal, youthKcalFactor } from './youth.js';

/* ---------- 1 · Age ---------- */

export const ADULT_AGE = YOUTH_AGE;

/** Past this the evidence for deliberate weight loss changes; caution, not a block. */
export const OLDER_ADULT_AGE = 65;

/**
 * An age is usable, missing, or a typo. The three are kept apart deliberately:
 * "we don't know" and "that cannot be right" call for different words.
 */
export const validateAge = (value) => {
  if (value === null || value === undefined || value === '') return { status: 'missing', age: null };
  const number = Number(value);
  if (!Number.isFinite(number)) return { status: 'missing', age: null };
  const age = Math.round(number);
  if (age < AGE_MIN || age > AGE_MAX) return { status: 'implausible', age: null };
  return { status: 'ok', age };
};

/* ---------- 2 · Which path ---------- */

/** Adult, child, or not yet known. Never guessed from anything but a stated age. */
export const pathwayFor = (value) => {
  const { status, age } = validateAge(value);
  if (status !== 'ok') return 'unknown';
  return age < ADULT_AGE ? 'child' : 'adult';
};

/* ---------- 3 · Plausibility ---------- */

/** Outside these a figure is a typo — a wrong unit, a slipped decimal point. */
export const PLAUSIBLE = {
  weightKg: [25, 400],
  heightCm: [90, 250],
  bmi: [12, 70],
  maintenanceKcal: [800, 6000],
};

const inRange = (value, [min, max]) => Number.isFinite(value) && value >= min && value <= max;

export const bmiOf = ({ weightKg, heightCm } = {}) => {
  if (!weightKg || !heightCm) return null;
  const bmi = weightKg / (heightCm / 100) ** 2;
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
};

/** BMI below this is not a body to build a deficit on, whatever the goal says. */
export const LOW_BMI = 18.5;

/* ---------- 4 · Ceilings and floors ---------- */

/** The most of maintenance a deficit may take, however the goal is worded. */
export const MAX_DEFICIT_PCT = 0.2;

/** The most of maintenance a surplus may add. */
export const MAX_SURPLUS_PCT = 0.2;

/**
 * The lowest daily energy this app will set without clinical supervision. These
 * are the commonly published lower bounds for self-directed dieting rather than
 * a calculated figure; below them intake is a clinical decision.
 */
export const KCAL_FLOOR = { female: 1200, male: 1500, unspecified: 1400 };

/** Energy in a kilo of body fat, for turning a deficit into a rate. */
export const KCAL_PER_KG_FAT = 7700;

/** Faster than this and the deficit is asking for muscle as well as fat. */
export const MAX_WEEKLY_LOSS_PCT = 0.01;

/**
 * The floor for this person: never below the published minimum for their sex,
 * and never below what their body burns at rest, whichever is higher. A floor
 * above maintenance would be nonsense, so maintenance caps it.
 */
export const floorFor = ({ sex = 'unspecified', bmrKcal = null, maintenanceKcal = null } = {}) => {
  const published = KCAL_FLOOR[sex] ?? KCAL_FLOOR.unspecified;
  const floor = Math.max(published, Math.round(bmrKcal || 0));
  return maintenanceKcal ? Math.min(floor, maintenanceKcal) : floor;
};

/* ---------- 8 · Ranges rather than false precision ---------- */

/** Mifflin-St Jeor lands within about 10% for most people. So does this. */
export const ESTIMATE_ERROR_PCT = 0.1;

const toStep = (n, step) => Math.round(n / step) * step;

/** A target as the band it really is, rounded to 25 kcal so it reads as an estimate. */
export const estimateRange = (kcal, pct = ESTIMATE_ERROR_PCT) => {
  if (!kcal) return null;
  return {
    low: toStep(kcal * (1 - pct), 25),
    high: toStep(kcal * (1 + pct), 25),
    pct: Math.round(pct * 100),
  };
};

/* ---------- 7 · Screening before a restrictive goal ---------- */

/**
 * A gate, not a questionnaire with a score. A "yes" to any of these means Forq
 * does not set a deficit — it says why, and names who to ask instead. Nothing
 * is stored beyond the answers themselves and nothing is inferred from them.
 */
export const RESTRICTIVE_SCREENING = [
  { id: 'control', question: 'Do you ever feel you have lost control over how much you eat?' },
  { id: 'preoccupied', question: 'Does food, weight or eating take up most of your thinking?' },
  { id: 'unplanned-loss', question: 'Have you lost weight in the last three months without meaning to?' },
  { id: 'advised-against', question: 'Has a doctor or dietitian advised you not to restrict what you eat?' },
  { id: 'pregnancy', question: 'Are you pregnant or breastfeeding?' },
];

export const SCREENING_IDS = RESTRICTIVE_SCREENING.map((item) => item.id);

/**
 * Complete when every question has an answer; clear when every answer is "no".
 * An unanswered screen is not a passed one.
 */
export const screeningOutcome = (answers = null) => {
  const given = answers && typeof answers === 'object' ? answers : {};
  const flagged = SCREENING_IDS.filter((id) => given[id] === 'yes');
  const complete = SCREENING_IDS.every((id) => given[id] === 'yes' || given[id] === 'no');
  return { complete, clear: complete && flagged.length === 0, flagged };
};

/* ---------- 9 · Manual confirmation ---------- */

/**
 * A confirmation is for one target, not for deficits in general: change the
 * goal or the number and it has to be agreed again.
 */
export const targetSignature = ({ goal = 'maintain', kcal = 0 } = {}) => `${goal}:${Math.round(kcal || 0)}`;

export const isConfirmed = (confirmation, signature) =>
  Boolean(confirmation && signature && confirmation.signature === signature);

/** The record the store writes when someone confirms. */
export const confirmationRecord = (signature, day) => ({ signature, confirmedAt: day });

/* ---------- 10 · Who can actually help ---------- */

export const SUPPORT_COPY = {
  general: 'Forq estimates. A GP or a registered dietitian can look at your history, your bloods and your medication, and none of that is something an app can read from a weight.',
  restrictive: 'If you want to lose weight and something about it feels difficult, a GP is the right first conversation — not because anything is wrong, but because they can see what this app cannot.',
  screening: 'Forq will not set a deficit from these answers. Beat runs a free helpline on 0808 801 0677, your GP can refer you, and NHS 111 is there if you need someone sooner.',
  lowBmi: 'At this weight and height a deficit is not something Forq will set. A GP or a registered dietitian is the right place to take it.',
  older: 'Over 65, losing weight can cost muscle and bone as well as fat. A GP or dietitian can say whether a deficit is the right idea, and what to do alongside it.',
  clinical: 'Diets below about 800 kcal a day are a clinical treatment with monitoring, not something to set yourself.',
};

/* ---------- The assessment ---------- */

const warn = (id, severity, message) => ({ id, severity, message });

/**
 * Everything the app needs to know about one person's calorie target, in one
 * object: whether it may exist, what it is, how wide the estimate is, what is
 * unusual about it, and what is still being waited on.
 *
 * `bmrKcal` and `maintenanceKcal` are passed in already resolved so this module
 * stays free of the equations it is guarding.
 */
export const assessTarget = ({
  goal = 'maintain',
  body = {},
  maintenanceKcal = null,
  bmrKcal = null,
  typedMaintenance = 0,
  screening = null,
  confirmation = null,
} = {}) => {
  const warnings = [];
  const { status: ageStatus, age } = validateAge(body.age);
  const pathway = pathwayFor(body.age);
  const sex = body.sex || 'unspecified';
  const bmi = bmiOf(body);

  /* 1 · Age */
  if (ageStatus === 'missing') warnings.push(warn('age-missing', 'blocking', 'Forq needs your age before it sets a calorie target. It changes the arithmetic and it changes what the app will do at all.'));
  if (ageStatus === 'implausible') warnings.push(warn('age-implausible', 'blocking', `That age is outside ${AGE_MIN}–${AGE_MAX}, so it reads as a typo rather than an answer.`));

  /* 3 · Plausibility of what the estimate is built from */
  if (body.weightKg && !inRange(body.weightKg, PLAUSIBLE.weightKg)) {
    warnings.push(warn('weight-implausible', 'blocking', 'That weight is outside anything Forq can plan from — check whether it went in as pounds.'));
  }
  if (body.heightCm && !inRange(body.heightCm, PLAUSIBLE.heightCm)) {
    warnings.push(warn('height-implausible', 'blocking', 'That height is outside anything Forq can plan from — check whether it went in as inches.'));
  }
  if (bmi !== null && !inRange(bmi, PLAUSIBLE.bmi)) {
    warnings.push(warn('bmi-implausible', 'blocking', 'Your height and weight do not go together in a way Forq can work from. One of the two is probably in the wrong unit.'));
  }
  if (maintenanceKcal && !inRange(maintenanceKcal, PLAUSIBLE.maintenanceKcal)) {
    warnings.push(warn('maintenance-implausible', 'blocking', 'The maintenance figure is outside 800–6,000 kcal, which is further than an estimate should ever land.'));
  }

  /* 6 · What is still missing */
  const statsComplete = Boolean(body.weightKg && body.heightCm && ageStatus === 'ok');
  const missing = [];
  if (ageStatus !== 'ok') missing.push('age');
  if (!statsComplete && !(typedMaintenance > 0)) {
    if (!body.weightKg) missing.push('weight');
    if (!body.heightCm) missing.push('height');
  }
  if (!maintenanceKcal) missing.push('maintenance');

  const blocking = warnings.some((w) => w.severity === 'blocking');
  const ready = missing.length === 0 && !blocking;
  if (!ready && missing.length) {
    warnings.push(warn('inputs-incomplete', 'blocking', `Forq will not invent the parts it does not have. Missing: ${missing.join(', ')}.`));
  }

  /* 2 · Child and adult take different routes from here */
  const child = pathway === 'child';
  const asked = bodyGoal(goal);
  let applied = child ? bodyGoal(youthGoal(goal)) : asked;
  let factor = child ? youthKcalFactor(applied.kcalFactor) : applied.kcalFactor;
  const restrictive = !child && asked.kcalFactor < 1;

  /* 7 · Screening, and the things that stop a deficit outright */
  const screen = screeningOutcome(screening);
  let screeningRequired = false;
  if (restrictive) {
    screeningRequired = true;
    if (bmi !== null && bmi < LOW_BMI) {
      factor = 1;
      applied = bodyGoal('maintain');
      warnings.push(warn('bmi-low', 'blocking', SUPPORT_COPY.lowBmi));
    } else if (!screen.complete) {
      factor = 1;
      applied = bodyGoal('maintain');
      warnings.push(warn('screening-required', 'blocking', 'A few questions come before a weight-loss target. Until they are answered Forq plans at maintenance.'));
    } else if (!screen.clear) {
      factor = 1;
      applied = bodyGoal('maintain');
      warnings.push(warn('screening-flagged', 'blocking', SUPPORT_COPY.screening));
    }
  }

  /* 5 · Age-related caution that informs rather than blocks */
  if (restrictive && age !== null && age >= OLDER_ADULT_AGE) {
    warnings.push(warn('older-adult', 'caution', SUPPORT_COPY.older));
  }
  if (child) {
    warnings.push(warn('child-pathway', 'info', 'Under 18 Forq plans at maintenance and does not set a deficit, whatever goal is stored.'));
  }

  /* 4 · The ceiling on the change, before the floor under the day */
  const base = maintenanceKcal || 0;
  let deficitCapped = false;
  if (factor < 1 - MAX_DEFICIT_PCT) {
    factor = 1 - MAX_DEFICIT_PCT;
    deficitCapped = true;
  }
  if (factor > 1 + MAX_SURPLUS_PCT) factor = 1 + MAX_SURPLUS_PCT;

  const wanted = Math.round(base * factor);
  const floor = floorFor({ sex, bmrKcal, maintenanceKcal: base || null });
  const floorApplied = ready && wanted > 0 && wanted < floor;
  /** What the goal asks for, once every check above has had its say. */
  const proposed = ready ? Math.max(floor, wanted) : null;

  if (deficitCapped) {
    warnings.push(warn('deficit-capped', 'caution', `A deficit here is held to ${Math.round(MAX_DEFICIT_PCT * 100)}% below maintenance. Faster is not better and it rarely lasts.`));
  }
  if (floorApplied) {
    warnings.push(warn('floor-applied', 'caution', `Your goal worked out at ${wanted.toLocaleString()} kcal, which is below the ${floor.toLocaleString()} kcal floor Forq sets for you — the target has been raised to it. ${SUPPORT_COPY.clinical}`));
  }

  /* 5 · What the proposal implies, said out loud before it is agreed to */
  const proposedDeficit = proposed ? Math.max(0, base - proposed) : 0;
  const weeklyKgProposed = Math.round((proposedDeficit * 7 / KCAL_PER_KG_FAT) * 100) / 100;
  const weeklyPct = body.weightKg ? weeklyKgProposed / body.weightKg : null;
  if (weeklyPct !== null && weeklyPct > MAX_WEEKLY_LOSS_PCT) {
    warnings.push(warn('rapid-loss', 'caution', `That works out at about ${weeklyKgProposed} kg a week, which is faster than the steady rate most guidance settles on.`));
  }

  /* 9 · A deficit is proposed, not applied, until it has been agreed to. Until
     then the day is planned at maintenance rather than at a number nobody
     chose — and the agreement is to this target, not to deficits in general. */
  const signature = proposed ? targetSignature({ goal: applied.id, kcal: proposed }) : null;
  const confirmationRequired = Boolean(proposed)
    && proposed < base
    && (restrictive || warnings.some((w) => w.severity === 'caution'));
  const confirmed = isConfirmed(confirmation, signature);
  if (confirmationRequired && !confirmed) {
    warnings.push(warn('confirmation-required', 'caution', 'Forq does not put a deficit in force on its own. Until you confirm this target the day is planned at maintenance.'));
  }

  const kcal = confirmationRequired && !confirmed
    ? Math.max(floor, Math.round(base))
    : proposed;

  const deficitKcal = kcal ? Math.max(0, base - kcal) : 0;
  const weeklyKg = Math.round((deficitKcal * 7 / KCAL_PER_KG_FAT) * 100) / 100;

  const support = [SUPPORT_COPY.general];
  if (warnings.some((w) => w.id === 'screening-flagged')) support.unshift(SUPPORT_COPY.screening);
  if (warnings.some((w) => w.id === 'bmi-low')) support.unshift(SUPPORT_COPY.lowBmi);
  if (warnings.some((w) => w.id === 'older-adult')) support.push(SUPPORT_COPY.older);
  else if (restrictive) support.push(SUPPORT_COPY.restrictive);

  return {
    pathway,
    age,
    ageStatus,
    bmi,
    ready,
    /** False means: show no number as this person's target. */
    personalised: ready,
    missing,
    goal: asked.id,
    appliedGoal: applied.id,
    /** The factor the goal asked for, after the ceiling and the child pathway. */
    factor,
    maintenanceKcal: base || null,
    /** In force now. */
    kcal,
    /** What confirming would put in force, when that differs. */
    proposedKcal: proposed,
    range: estimateRange(kcal),
    proposedRange: estimateRange(proposed),
    floor: { kcal: floor, applied: floorApplied },
    deficit: {
      kcal: deficitKcal,
      pct: base ? Math.round((deficitKcal / base) * 100) : 0,
      weeklyKg,
      proposedWeeklyKg: weeklyKgProposed,
      capped: deficitCapped,
    },
    warnings,
    blocked: warnings.some((w) => w.severity === 'blocking'),
    screening: { required: screeningRequired, questions: RESTRICTIVE_SCREENING, ...screen },
    confirmation: { required: confirmationRequired, given: confirmed, signature },
    support,
  };
};
