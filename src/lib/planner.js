import { RECIPES } from '../data/recipes.js';
import { recipeAllowed } from './goals.js';
import { seasonScore } from '../data/seasons.js';
import { seededPick } from './utils.js';
import { tasteScore } from './taste.js';
import { canonicalName, sameIngredient } from './aliases.js';
import { isPantrySufficient } from './kitchen.js';
import { chooseWasteMinimisingPlan, rankWastePlans, scoreWastePlan } from './waste-planner.js';
import { chooseOptimalPlan } from './optimiser.js';

export {
  chooseWasteMinimisingPlan, learnWasteProfile, rankWastePlans, scoreWastePlan,
} from './waste-planner.js';

/* ---------- Equipment ---------- */

/** Appliance tags a dish needs beyond a normal hob/oven kitchen. */
export const EQUIPMENT_TAGS = ['air-fryer', 'slow-cooker'];

export const equipmentTags = (recipe) => (recipe?.tags || []).filter((tag) => EQUIPMENT_TAGS.includes(tag));

/**
 * A dish is cookable when it needs no special kit, or every appliance it names
 * is in the owned set. Never assumed — an untagged dish always fits.
 */
export const equipmentOk = (recipe, owned = []) => {
  if (!recipe) return false;
  const needed = equipmentTags(recipe);
  if (!needed.length) return true;
  return needed.every((tag) => owned.includes(tag));
};

/* ---------- Variety ---------- */

/**
 * A plan that avoids repeating dishes and ingredients where the pool allows,
 * then only wraps once everything has been used. Seeded so the same request
 * with the same seed still produces the same plan.
 */
export const varietyMeals = (pool, count, seed) => {
  const out = [];
  const usedIds = new Set();
  const usedIng = new Set();
  const remaining = [...pool];
  for (let i = 0; i < remaining.length; i += 1) {
    const j = (i + seed * 7) % remaining.length;
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  const keyOf = (r) => canonicalName(r.name);
  while (out.length < count && remaining.length) {
    const fresh = remaining.findIndex((r) => {
      if (usedIds.has(keyOf(r))) return false;
      const ings = (r.ingredients || []).map((i) => String(i.name || i).toLowerCase());
      return ings.filter((ing) => usedIng.has(ing)).length === 0;
    });
    const pick = fresh >= 0 ? remaining.splice(fresh, 1)[0] : remaining.shift();
    if (!pick) break;
    usedIds.add(keyOf(pick));
    (pick.ingredients || []).forEach((i) => usedIng.add(String(i.name || i).toLowerCase()));
    out.push(pick);
  }
  while (out.length < count) out.push(pool[out.length % pool.length]);
  return out;
};

/**
 * Plan generation. Hard constraints (your dietary patterns, budget, time and
 * body goal) must hold; soft preferences (occasion, what's in your pantry,
 * what's in season, family size) narrow the pool only while enough recipes
 * remain, so a preference never leaves you with nothing.
 *
 * Dietary exclusions are the same rules the rest of the app uses — one
 * definition of what "vegan" or "gluten-free" means, in `data/goals.js`.
 */
/** Quantity-aware coverage for the strict "only what I have" replanner. */
export const pantryCoverage = (recipe, pantry = []) => {
  const ingredients = recipe?.ingredients || [];
  if (!ingredients.length) return { have: 0, total: 0, pct: 100, missing: [] };
  const rows = Array.isArray(pantry) ? pantry : [];
  const have = [];
  const missing = [];
  for (const ingredient of ingredients) {
    const hit = rows.find((item) => {
      const name = typeof item === 'string' ? item : item?.name;
      if (!sameIngredient(name, ingredient.name)) return false;
      return typeof item === 'string' || isPantrySufficient(item, ingredient.qty);
    });
    if (hit) have.push(ingredient);
    else missing.push(ingredient);
  }
  return {
    have: have.length,
    total: ingredients.length,
    pct: Math.round((have.length / ingredients.length) * 100),
    missing,
  };
};

export const hardFilter = (recipes, {
  diets = [], goal = 'maintain', budget = 4, maxTime = null, equipment = null,
  pantry = [], availableOnly = false,
} = {}) =>
  recipes.filter((r) => {
    if (!recipeAllowed(r, diets)) return false;
    if ((goal === 'muscle' || goal === 'recomp') && r.protein < 20) return false;
    if (goal === 'lose' && r.kcal > 520) return false;
    if (r.costPerServing > budget) return false;
    if (maxTime && r.time > maxTime) return false;
    if (equipment && !equipmentOk(r, equipment)) return false;
    if (availableOnly && pantryCoverage(r, pantry).missing.length) return false;
    return true;
  });

/** How many of a dish's ingredients you already have. */
export const pantryHits = (recipe, pantryNames = []) => {
  if (!pantryNames.length) return 0;
  const have = pantryNames.map((n) => n.toLowerCase()).filter(Boolean);
  return recipe.ingredients.filter((i) => {
    const name = i.name.toLowerCase();
    return have.some((h) => h.includes(name) || name.includes(h));
  }).length;
};

const OCCASION_PREFS = {
  'Meal prep': (r) => r.tags.some((t) => ['batch', 'meal-prep', 'freezer'].includes(t)),
  'Date night': (r) => r.tags.includes('date-night'),
  Party: (r) => r.tags.includes('family') || r.tags.includes('quick'),
  BBQ: (r) => r.tags.includes('family'),
  Camping: (r) => r.tags.includes('one-pot') || r.tags.includes('quick'),
  Student: (r) => r.costPerServing <= 1.5,
};

/** Body goals express a preference beyond their hard cut-off. */
const GOAL_PREFS = {
  muscle: (r) => r.protein >= 30,
  recomp: (r) => r.protein >= 28,
  lose: (r) => r.kcal <= 450,
  gain: (r) => r.kcal >= 550,
};

/** Dishes worth cooking in bulk: they scale, keep, or reheat well. */
export const BATCH_TAGS = ['batch', 'freezer', 'one-pot', 'meal-prep'];
const batchable = (r) => r.servings >= 4 || r.tags.some((t) => BATCH_TAGS.includes(t));

const candidateCount = (enabled) => enabled ? 18 : 1;

const candidatePlans = (pool, count, seed, variety, candidates = 1) => Array.from({ length: candidates }, (_, index) => {
  const candidateSeed = seed + index * 7919;
  // Keep the first candidate faithful to the variety preference, but let the
  // waste candidates reuse a useful ingredient when that fills a pack or
  // prevents a fragmented purchase.
  if (variety && index === 0) return varietyMeals(pool, count, candidateSeed);
  const unique = seededPick(pool, Math.min(count, pool.length), candidateSeed);
  return Array.from({ length: count }, (_, i) => unique[i % unique.length]).filter(Boolean);
});

const finishPlan = (meals, note, wasteOptions) => {
  const wastePlan = scoreWastePlan(meals, wasteOptions);
  return { meals, note, wasteScore: wastePlan.score, wastePlan };
};

export const chooseCandidate = (candidates, wasteOptions, optimise, multiObjective = false) => {
  if (!candidates.length) return { meals: [], wastePlan: scoreWastePlan([], wasteOptions) };
  if (!optimise || candidates.length === 1) {
    return { meals: candidates[0], wastePlan: scoreWastePlan(candidates[0], wasteOptions) };
  }
  const ranked = rankWastePlans(candidates, wasteOptions);
  // Legacy shape: the waste model spread at the top level, plus .meals.
  const pick = (meals, candidateIndex = null) => ({
    ...scoreWastePlan(meals, wasteOptions),
    ...(candidateIndex != null ? { candidateIndex } : {}),
    meals,
  });
  if (multiObjective && ranked.best) {
    // Multi-objective mode: pantry/expiry coverage blends with the pack-waste
    // model instead of waste alone deciding. Time and equipment have already
    // been hard-filtered upstream; this weighs what remains.
    const optimised = chooseOptimalPlan(candidates, {
      pantryItems: wasteOptions.pantry,
      packageSizes: wasteOptions.packageSizes || {},
      today: wasteOptions.today,
      wasteScores: Object.fromEntries(ranked.ranked.map((r) => [r.candidateIndex, r.score])),
      maxTimeMins: wasteOptions.maxTimeMins ?? null,
      equipmentOwned: wasteOptions.equipmentOwned ?? [],
    });
    if (optimised?.meals?.length) {
      return {
        ...pick(optimised.meals, optimised.candidateIndex),
        optimiserScore: optimised.score,
        optimiserReasons: optimised.reasons,
      };
    }
  }
  return ranked.best ? pick(ranked.best.meals, ranked.best.candidateIndex) : pick(candidates[0]);
};

export const scopeCount = (scope) =>
  (scope === '1 meal' ? 1 : scope === 'A day' ? 3 : scope === 'A month' ? 28 : 7);

/** Which meals a scope covers: a day is breakfast→dinner, longer runs are dinners. */
export const scopeMeals = (scope) =>
  (scope === 'A day' ? ['breakfast', 'lunch', 'dinner'] : ['dinner']);

/**
 * Build a plan of exactly `count` dishes. Returns { meals, note } where note
 * explains any compromise (relaxed constraints, repeated recipes, or a
 * deliberate batch-cooking repeat).
 *
 * `days` overrides the scope's count, so the month view can ask for however
 * many days that month actually has.
 */
export function buildPlan(
  {
    scope = 'A week', diets = [], goal, budget, maxTime, occasion = 'Everyday', people = 2,
    pantry = [], month = null, batch = false, days = null, recipes = RECIPES, taste = null,
    leftovers = [], equipment = null, expiry = [], variety = false, pantryItems = null,
    availableOnly = false, wasteOptimisation = true, multiObjective = false, wasteHistory = [], wasteProfile = null,
    packageSizes = {}, dates = [], today = '', learnedAliases = {},
  },
  seed,
) {
  const count = Math.max(1, days || scopeCount(scope));
  const slots = scopeMeals(scope);
  const wasteOptions = {
    pantry: pantryItems || pantry,
    people,
    dates,
    today,
    wasteHistory,
    wasteProfile,
    packageSizes,
    learnedAliases,
  };
  const candidates = candidateCount(wasteOptimisation);

  /** Preferences applied in order, each kept only while the pool stays usable. */
  const narrow = (pool, wanted) => {
    const prefs = [
      GOAL_PREFS[goal],
      OCCASION_PREFS[occasion],
      taste?.rated ? (r) => tasteScore(r, taste) > 0 : null,
      people >= 4 ? (r) => r.servings >= 4 : null,
      pantry.length ? (r) => pantryHits(r, pantry) >= 2 : null,
      // Dishes that use something about to go off are worth cooking first.
      expiry.length ? (r) => pantryHits(r, expiry) >= 1 : null,
      month ? (r) => seasonScore(r, month) >= 1 : null,
    ].filter(Boolean);
    let out = pool;
    for (const pref of prefs) {
      const narrowed = out.filter(pref);
      if (narrowed.length >= Math.min(wanted, 3)) out = narrowed;
    }
    return [...out].sort((a, b) => {
      const seasonal = month ? seasonScore(b, month) - seasonScore(a, month) : 0;
      const cost = (Number(a.costPerServing) || 0) - (Number(b.costPerServing) || 0);
      return seasonal * 4 + cost;
    });
  };

  // A day's plan takes one dish from each meal; everything else is dinners.
  if (slots.length > 1) {
    let relaxedDay = false;
    const pools = slots.map((meal) => {
      const forSlot = recipes.filter((r) => r.meal === meal);
      const strictPool = hardFilter(forSlot, {
        diets, goal, budget, maxTime, equipment, pantry: pantryItems || pantry, availableOnly,
      });
      const mealPool = strictPool.length || !availableOnly
        ? strictPool
        : hardFilter(forSlot, { diets, goal, budget, maxTime, equipment });
      if (!mealPool.length || (availableOnly && !strictPool.length)) relaxedDay = true;
      return mealPool.length ? narrow(mealPool, 1) : forSlot;
    });
    const dayCandidates = Array.from({ length: candidates }, (_, candidateIndex) => pools
      .map((pool, i) => seededPick(pool, 1, seed + i * 17 + candidateIndex * 7919)[0])
      .filter(Boolean));
    const selected = chooseCandidate(dayCandidates, wasteOptions, wasteOptimisation, multiObjective);
    const picks = selected.meals;
    return finishPlan(
      picks,
      relaxedDay || picks.length < slots.length
        ? 'Nothing matched every filter — showing the closest fits instead.'
        : null,
      wasteOptions,
    );
  }

  const dinners = recipes.filter((r) => r.meal === 'dinner');
  let pool = hardFilter(dinners, {
    diets, goal, budget, maxTime, equipment, pantry: pantryItems || pantry, availableOnly,
  });
  let relaxed = false;
  if (pool.length === 0) {
    pool = hardFilter(dinners, { diets, goal, budget, maxTime });
    relaxed = true;
  }
  if (pool.length === 0) {
    pool = dinners;
    relaxed = true;
  }

  const leftoverMeals = leftovers
    .flatMap((item) => {
      const recipe = recipes.find((candidate) => candidate.id === item.recipeId);
      const portions = Math.max(0, Math.floor(Number(item.portions) || 0));
      return recipe && pool.some((candidate) => candidate.id === recipe.id)
        ? Array.from({ length: Math.min(portions, count) }, () => recipe)
        : [];
    })
    .slice(0, count);
  if (leftoverMeals.length) {
    const remaining = count - leftoverMeals.length;
    const ranked = narrow(
      pool.filter((recipe) => !leftoverMeals.some((item) => item.id === recipe.id)),
      remaining,
    );
    const fillPool = ranked.length ? ranked : pool;
    const fillCandidates = candidatePlans(fillPool, remaining, seed, variety, candidates);
    const selectedFill = chooseCandidate(fillCandidates, {
      ...wasteOptions,
      dates: dates.slice(leftoverMeals.length),
    }, wasteOptimisation, multiObjective);
    const meals = [...leftoverMeals, ...selectedFill.meals];
    return finishPlan(
      meals,
      `Leftover-first plan: ${leftoverMeals.length} meal${leftoverMeals.length === 1 ? '' : 's'} use portions already in the fridge; the rest favour seasonal, lower-cost dishes.`,
      wasteOptions,
    );
  }

  // Batch mode asks for fewer dishes on purpose: cook once, eat three times.
  if (batch && count > 2) {
    const keepers = pool.filter(batchable);
    const batchPool = narrow(keepers.length >= 3 ? keepers : pool, 3);
    const cooks = Math.max(2, Math.round(count / 3));
    const batchCandidates = Array.from({ length: candidates }, (_, candidateIndex) => {
      const unique = seededPick(batchPool, Math.min(cooks, batchPool.length), seed + candidateIndex * 7919);
      return Array.from({ length: count }, (_, i) => unique[Math.floor((i * unique.length) / count)]).filter(Boolean);
    });
    if (batchCandidates.some((candidate) => candidate.length)) {
      const selected = chooseCandidate(batchCandidates, wasteOptions, wasteOptimisation, multiObjective);
      const meals = selected.meals;
      const distinct = new Set(meals.map((meal) => meal.id)).size;
      const each = Math.round(count / Math.max(1, distinct));
      return finishPlan(
        meals,
        relaxed
          ? 'Nothing matched every filter — showing the closest fits instead.'
          : `Batch plan: cook ${distinct} dish${distinct === 1 ? '' : 'es'}, each covering about ${each} meal${each === 1 ? '' : 's'}.`,
        wasteOptions,
      );
    }
  }

  pool = narrow(pool, count);

  const rankedCandidates = candidatePlans(pool, count, seed, variety, candidates);
  const selected = chooseCandidate(rankedCandidates, wasteOptions, wasteOptimisation, multiObjective);
  const meals = selected.meals;
  const unique = seededPick(pool, Math.min(count, pool.length), seed);

  const note = relaxed
    ? availableOnly
      ? 'No complete pantry-only match was available — showing the closest fits instead.'
      : 'Nothing matched every filter — showing the closest fits instead.'
    : unique.length < count
      ? `Only ${unique.length} recipe${unique.length === 1 ? '' : 's'} match your filters, so the plan repeats them.`
      : variety && new Set(meals.map((m) => m.id)).size < count
        ? 'Variety on: dishes repeat only once the kitchen runs out of distinct options.'
        : null;
  return finishPlan(meals, note, wasteOptions);
}
