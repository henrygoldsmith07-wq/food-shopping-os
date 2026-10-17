/**
 * Planner building blocks: filters, scoring helpers and candidate selection
 * shared by the single-run planner (planner.js) and the multi-day run
 * (planner-multiday.js). planner.js re-exports the public ones.
 */

import { recipeAllowed } from './goals.js';
import { seededPick } from './utils.js';
import { canonicalName, sameIngredient } from './aliases.js';
import { isPantrySufficient } from './kitchen.js';
import { rankWastePlans, scoreWastePlan } from './waste-planner.js';
import { chooseOptimalPlan } from './optimiser.js';

/* ---------- Equipment ---------- */

/** Appliance tags a dish needs beyond a normal hob/oven kitchen. */
export const EQUIPMENT_TAGS = ['air-fryer', 'slow-cooker', 'microwave', 'blender', 'rice-cooker', 'pressure-cooker', 'grill', 'oven', 'hob'];

export const equipmentTags = (recipe) => (recipe?.tags || []).filter((tag) => EQUIPMENT_TAGS.includes(tag));

export const activeEquipment = (state = {}) => state.activeKitchenProfile?.equipment || state.equipment || [];

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
    if (!Number.isFinite(Number(r.costPerServing)) || r.costPerServing > budget) return false;
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

export const OCCASION_PREFS = {
  'Meal prep': (r) => r.tags.some((t) => ['batch', 'meal-prep', 'freezer'].includes(t)),
  'Date night': (r) => r.tags.includes('date-night'),
  Party: (r) => r.tags.includes('family') || r.tags.includes('quick'),
  BBQ: (r) => r.tags.includes('family'),
  Camping: (r) => r.tags.includes('one-pot') || r.tags.includes('quick'),
  Student: (r) => r.costPerServing <= 1.5,
};

/** Body goals express a preference beyond their hard cut-off. */
export const GOAL_PREFS = {
  muscle: (r) => r.protein >= 30,
  recomp: (r) => r.protein >= 28,
  lose: (r) => r.kcal <= 450,
  gain: (r) => r.kcal >= 550,
};

/**
 * Skip reasons the review loop can confirm still apply express a standing
 * household preference, so the plan honours them: repeated "no time" wants
 * quicker dinners, "plan too complex" simpler ones, "missing ingredients"
 * dishes you can already mostly cook. Reasons about a particular evening
 * ("plans changed", "not in the mood") describe a day, not the household,
 * so they earn no preference. Each pref is soft — it narrows only while the
 * pool stays usable, like every other preference here.
 */
export const skipReasonPref = (reasonId, pantryNames) => {
  if (reasonId === 'no-time' || reasonId === 'plan-too-complex') return (r) => r.time <= 30;
  if (reasonId === 'missing-ingredients') return (r) => r.ingredients.length > 0
    && pantryHits(r, pantryNames) * 2 >= r.ingredients.length;
  return null;
};

/** Dishes worth cooking in bulk: they scale, keep, or reheat well. */
export const BATCH_TAGS = ['batch', 'freezer', 'one-pot', 'meal-prep'];
export const batchable = (r) => r.servings >= 4 || r.tags.some((t) => BATCH_TAGS.includes(t));

export const candidateCount = (enabled) => enabled ? 18 : 1;

export const candidatePlans = (pool, count, seed, variety, candidates = 1) => Array.from({ length: candidates }, (_, index) => {
  const candidateSeed = seed + index * 7919;
  // Keep the first candidate faithful to the variety preference, but let the
  // waste candidates reuse a useful ingredient when that fills a pack or
  // prevents a fragmented purchase.
  if (variety && index === 0) return varietyMeals(pool, count, candidateSeed);
  const unique = seededPick(pool, Math.min(count, pool.length), candidateSeed);
  return Array.from({ length: count }, (_, i) => unique[i % unique.length]).filter(Boolean);
});

export const finishPlan = (meals, note, wasteOptions) => {
  const wastePlan = scoreWastePlan(meals, wasteOptions);
  return { meals, note, wasteScore: wastePlan.score, wastePlan };
};

/**
 * A pantry tap that names an ingredient wants it cooked, so `focus` earns a
 * slot rather than a preference: when the assembled plan would otherwise
 * ignore every focused item, the lowest-ranked meal swaps for a dish that
 * uses one. Returns the dish that uses the item (its name, or null when no
 * focused dish is possible) so the plan can say what it promised — the dish
 * is named whether it was already chosen or had to be pinned in.
 */
export const focusSwap = (meals, pool, focus, seed) => {
  if (!focus.length) return null;
  const already = meals.find((m) => pantryHits(m, focus) >= 1);
  if (already) return already.name;
  const hitters = pool.filter((r) => pantryHits(r, focus) >= 1);
  if (!hitters.length) return null;
  const pinned = seededPick(hitters, 1, seed + 101)[0];
  meals[meals.length - 1] = pinned;
  return pinned.name;
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
      // Same headroom maths the simulator uses: cost competes with the window
      // minus what the shops already took, scaled to the household size — and
      // a multi-week window also answers to each week's own allowance.
      weeklyBudget: wasteOptions.weeklyBudget ?? null,
      budgetSpent: Number(wasteOptions.budgetSpent) || 0,
      people: Number(wasteOptions.people) || 1,
      weeklyCap: wasteOptions.weeklyCap ?? null,
      weekChunks: Array.isArray(wasteOptions.weekChunks) ? wasteOptions.weekChunks : null,
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
 * The budget a plan window gets to spend, from a weekly allowance: the week
 * scaled by the weeks the window spans (days ÷ 7, exact, so a 7-day window
 * scales ×1 and a month scales to its real length). A month of meals must
 * never be judged against a single week's headroom — that misranks every
 * dish over a week's worth by ~4×. No budget or no window yields null, so
 * the cost dimension stays off entirely.
 */
export const windowBudget = (weeklyBudget, dayCount) => {
  const budget = Number(weeklyBudget) || 0;
  const days = Number(dayCount) || 0;
  if (budget <= 0 || days <= 0) return null;
  return Math.round(budget * (days / 7) * 100) / 100;
};
