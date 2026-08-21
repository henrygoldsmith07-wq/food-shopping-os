/**
 * Turning goals into numbers.
 *
 * A body goal sets the energy delta and the protein/fat priorities; dietary
 * patterns then cap, floor or reshape what's left. The result is a plain
 * {kcal, protein, carbs, fat} target that the diary measures against — and
 * that the user can overwrite at any point by switching to custom mode.
 *
 * Recipe / food *exclusion* by diet pattern is now owned by the central
 * food-suitability engine. The helpers below remain for macro targets and as
 * thin wrappers so existing tests keep working.
 */

import {
  ACTIVITY_LEVELS, DIET_PATTERNS, KCAL_PER_G, activityLevel, bodyGoal, dietPattern,
} from '../data/goals.js';
import { DEFAULT_TARGETS } from '../data/nutrients.js';
import { weekDates } from './kitchen.js';
import { caffeineLimitMg, isUnderEighteen, youthGoal, youthKcalFactor } from './youth.js';
import { assessTarget, floorFor, MAX_DEFICIT_PCT, MAX_SURPLUS_PCT } from './target-safety.js';
import {
  evaluateFoodSuitability,
  filterBySuitability,
  rankBySuitability,
  suitabilityContextFrom,
} from './food-suitability.js';

const round = (n) => Math.round(n);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------- Maintenance energy ---------- */

/**
 * Mifflin-St Jeor. Without a stated sex we take the midpoint of the two
 * constants rather than assuming one.
 */
export const bmr = ({ weightKg, heightCm, age, sex = 'unspecified' }) => {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return Math.max(0, round(base + offset));
};

/** BMR × activity — the calories that hold your weight steady. */
export const maintenanceFrom = (stats = {}) => {
  const base = bmr(stats);
  if (!base) return null;
  return round(base * activityLevel(stats.activity).factor);
};

/**
 * The maintenance figure to plan from: computed from body stats when they're
 * there, otherwise whatever the user typed in.
 */
export const resolveMaintenance = (state = {}) =>
  maintenanceFrom(state.body || {}) || Math.max(0, Number(state.maintenanceKcal) || 0) || null;

/* ---------- Macro targets ---------- */

const kcalOf = ({ protein = 0, carbs = 0, fat = 0 }) =>
  protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat;

/**
 * Fill the calories protein hasn't claimed with fat and carbs, honouring a
 * carb cap and a fat floor. Whatever a cap refuses, the other macro absorbs.
 */
const balance = (kcal, protein, { carbCap = Infinity, fatFloorPct = 0, fatPct = 0.3 }) => {
  const left = Math.max(0, kcal - protein * KCAL_PER_G.protein);
  let fatKcal = Math.min(left, Math.max(kcal * fatFloorPct, kcal * fatPct));
  let carbs = (left - fatKcal) / KCAL_PER_G.carbs;

  if (carbs > carbCap) {
    carbs = carbCap;
    fatKcal = left - carbs * KCAL_PER_G.carbs;
  }
  return { fat: Math.max(0, fatKcal / KCAL_PER_G.fat), carbs: Math.max(0, carbs) };
};

const clampedKcal = ({ base, factor, sex, bmrKcal }) => {
  const held = clamp(factor, 1 - MAX_DEFICIT_PCT, 1 + MAX_SURPLUS_PCT);
  return Math.max(floorFor({ sex, bmrKcal, maintenanceKcal: base }), round(base * held));
};

export const computeTargets = ({
  goal = 'maintain',
  diets = [],
  maintenanceKcal = null,
  weightKg = null,
  sex = 'unspecified',
  bmrKcal = null,
  fallbackKcal = DEFAULT_TARGETS.kcal,
  youth = false,
  safety = null,
} = {}) => {
  const g = bodyGoal(safety ? safety.appliedGoal : youth ? youthGoal(goal) : goal);
  const kcalFactor = youth ? youthKcalFactor(g.kcalFactor) : g.kcalFactor;
  const patterns = diets.map(dietPattern).filter(Boolean);

  const base = maintenanceKcal || fallbackKcal;
  const kcal = safety
    ? (safety.personalised ? safety.kcal : round(fallbackKcal))
    : clampedKcal({ base, factor: kcalFactor, sex, bmrKcal });

  let protein = weightKg ? weightKg * g.proteinPerKg : (kcal * g.proteinPct) / KCAL_PER_G.protein;
  for (const p of patterns) {
    if (p.proteinPerKgFloor && weightKg) protein = Math.max(protein, weightKg * p.proteinPerKgFloor);
    else if (p.proteinPctFloor) protein = Math.max(protein, (kcal * p.proteinPctFloor) / KCAL_PER_G.protein);
  }
  protein = clamp(protein, 0, (kcal * 0.45) / KCAL_PER_G.protein);

  const carbCap = Math.min(...patterns.map((p) => p.carbCap ?? Infinity), Infinity);
  const fatFloorPct = Math.max(0, ...patterns.map((p) => p.fatFloorPct ?? 0));
  const fatPct = patterns.find((p) => p.fatPct)?.fatPct ?? g.fatPct;

  const { fat, carbs } = balance(kcal, protein, { carbCap, fatFloorPct, fatPct });

  return {
    kcal,
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
  };
};

export const dietTargetPatch = (diets = []) =>
  diets
    .map(dietPattern)
    .filter(Boolean)
    .reduce((acc, p) => ({ ...acc, ...(p.targetPatch || {}) }), {});

export const youthTargetPatch = (state) => ({
  caffeine: caffeineLimitMg({ age: state.body?.age ?? null, weightKg: state.body?.weightKg || null }),
  alcohol: 0,
});

export const targetSafety = (state = {}) =>
  assessTarget({
    goal: state.goal,
    body: state.body || {},
    maintenanceKcal: resolveMaintenance(state),
    bmrKcal: bmr(state.body || {}),
    typedMaintenance: Math.max(0, Number(state.maintenanceKcal) || 0),
    screening: state.goalScreening,
    confirmation: state.targetConfirmation,
  });

export const targetsFor = (state) => {
  const youth = isUnderEighteen(state);
  const safety = targetSafety(state);
  return {
    ...DEFAULT_TARGETS,
    ...dietTargetPatch(state.diets),
    ...computeTargets({
      goal: state.goal,
      diets: state.diets,
      maintenanceKcal: resolveMaintenance(state),
      weightKg: state.body?.weightKg || null,
      sex: state.body?.sex || 'unspecified',
      bmrKcal: bmr(state.body || {}),
      fallbackKcal: state.targets?.kcal || DEFAULT_TARGETS.kcal,
      youth,
      safety,
    }),
    ...(youth ? youthTargetPatch(state) : {}),
  };
};

export const macroBreakdown = (targets) => {
  const total = kcalOf(targets) || 1;
  return ['protein', 'carbs', 'fat'].map((key) => ({
    key,
    grams: targets[key] || 0,
    kcal: round((targets[key] || 0) * KCAL_PER_G[key]),
    pct: Math.round(((targets[key] || 0) * KCAL_PER_G[key] * 100) / total),
  }));
};

export const macroMismatch = (targets) => round(kcalOf(targets) - (targets.kcal || 0));

/* ---------- Weekly targets ---------- */

export const defaultWeeklyKcal = (dailyKcal) => round((dailyKcal || 0) * 7);

export const weekProgress = (log = {}, { weeklyKcal, today }) => {
  const dates = weekDates(today);
  const days = dates.map((date) => ({
    date,
    kcal: (log[date] || []).reduce((sum, e) => {
      const per100 = e.per100;
      const value = per100 ? ((per100.kcal || 0) * (e.grams || 0)) / 100 : (e.nutrients?.kcal || 0);
      return sum + value;
    }, 0),
  })).map((d) => ({ ...d, kcal: round(d.kcal) }));

  const elapsed = dates.indexOf(today) + 1;
  const eaten = days.reduce((sum, d) => sum + d.kcal, 0);
  const left = round((weeklyKcal || 0) - eaten);
  const daysLeft = Math.max(0, 7 - elapsed);
  const loggedDays = days.filter((d) => d.kcal > 0).length;

  return {
    dates,
    days,
    eaten,
    left,
    elapsed,
    daysLeft,
    loggedDays,
    perDayLeft: round(left / Math.max(1, daysLeft + (days[elapsed - 1]?.kcal ? 0 : 1))),
    pct: weeklyKcal ? Math.round((eaten / weeklyKcal) * 100) : 0,
    onTrack: weeklyKcal ? eaten <= (weeklyKcal / 7) * elapsed : true,
  };
};

/* ---------- Diet fit (delegates hard exclusion to the central engine) ---------- */

const textOf = (food) => `${food.name || ''} ${food.brand || ''} ${(food.tags || []).join(' ')}`;

/** Which of your patterns a food clashes with — named, so the UI can say why. */
export const dietConflicts = (food, diets = []) => {
  if (!food) return [];
  // Prefer the central engine when possible; fall back for pure food objects.
  const fit = evaluateFoodSuitability(food, suitabilityContextFrom({ diets }));
  const fromEngine = fit.blockers
    .filter((b) => b.kind === 'diet' || b.kind === 'household')
    .map((b) => b.label);
  if (fromEngine.length) return fromEngine;
  const text = textOf(food);
  return diets
    .map(dietPattern)
    .filter((p) => p && p.excludes && p.excludes.test(text))
    .map((p) => p.label);
};

/** Recipes are judged on their ingredients, plus the tags they carry. */
export const recipeConflicts = (recipe, diets = []) => {
  if (!recipe) return [];
  const fit = evaluateFoodSuitability(recipe, suitabilityContextFrom({ diets }));
  return fit.blockers
    .filter((b) => b.kind === 'diet' || b.kind === 'household')
    .map((b) => b.label);
};

export const recipeAllowed = (recipe, diets = []) =>
  evaluateFoodSuitability(recipe, suitabilityContextFrom({ diets })).allowed
  || recipeConflicts(recipe, diets).length === 0;

/** Recipes that fit, best fit first when a pattern expresses a preference. */
export const filterByDiet = (recipes = [], diets = []) =>
  rankBySuitability(recipes, suitabilityContextFrom({ diets }));

/** A one-line summary of the goal set, for headers and the coach. */
export const goalSummary = (state = {}) => {
  const { diets = [] } = state;
  const g = bodyGoal(isUnderEighteen(state) ? youthGoal(state.goal) : state.goal);
  const names = diets.map((d) => dietPattern(d)?.label).filter(Boolean);
  return names.length ? `${g.label} · ${names.join(' · ')}` : g.label;
};

export { ACTIVITY_LEVELS, DIET_PATTERNS };

// Re-export central helpers for surfaces that already import from goals.
export {
  evaluateFoodSuitability,
  filterBySuitability,
  rankBySuitability,
  suitabilityContextFrom,
} from './food-suitability.js';
