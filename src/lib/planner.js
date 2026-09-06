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

/**
 * Skip reasons the review loop can confirm still apply express a standing
 * household preference, so the plan honours them: repeated "no time" wants
 * quicker dinners, "plan too complex" simpler ones, "missing ingredients"
 * dishes you can already mostly cook. Reasons about a particular evening
 * ("plans changed", "not in the mood") describe a day, not the household,
 * so they earn no preference. Each pref is soft — it narrows only while the
 * pool stays usable, like every other preference here.
 */
const skipReasonPref = (reasonId, pantryNames) => {
  if (reasonId === 'no-time' || reasonId === 'plan-too-complex') return (r) => r.time <= 30;
  if (reasonId === 'missing-ingredients') return (r) => r.ingredients.length > 0
    && pantryHits(r, pantryNames) * 2 >= r.ingredients.length;
  return null;
};

/** What leaning on each pref sounds like in the plan's note. */
const SKIP_PHRASES = {
  'no-time': 'quicker, 30-minute dishes',
  'plan-too-complex': 'simpler dishes',
  'missing-ingredients': 'dishes you can mostly make from what you already have',
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

/**
 * A pantry tap that names an ingredient wants it cooked, so `focus` earns a
 * slot rather than a preference: when the assembled plan would otherwise
 * ignore every focused item, the lowest-ranked meal swaps for a dish that
 * uses one. Returns the dish that uses the item (its name, or null when no
 * focused dish is possible) so the plan can say what it promised — the dish
 * is named whether it was already chosen or had to be pinned in.
 */
const focusSwap = (meals, pool, focus, seed) => {
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
    leftovers = [], equipment = null, expiry = [], focus = [], variety = false, pantryItems = null,
    availableOnly = false, wasteOptimisation = true, multiObjective = false, wasteHistory = [], wasteProfile = null,
    packageSizes = {}, dates = [], today = '', learnedAliases = {},
    // The week's headroom travels with the plan: candidates are ranked against
    // what the budget has left after this week's recorded shops, so a generated
    // plan and the simulator compete on the same number.
    weeklyBudget = null, budgetSpent = 0,
    // The week inside a multi-week window: `weeklyCap` is the true one-week
    // allowance and `weekChunks` the window's per-week meal counts, so a month
    // plan is ranked against each week, not just its total.
    weeklyCap = null, weekChunks = null,
    // What the household said still applies in review reflections: a reason
    // confirmed twice (latest still true) shapes what gets planned.
    skipProfile = null,
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
    weeklyBudget,
    budgetSpent,
    weeklyCap,
    weekChunks,
  };
  const candidates = candidateCount(wasteOptimisation);

  // The skip reasons the review loop confirmed still apply — strongest
  // first — become a soft preference, exactly like taste or occasion.
  const confirmedReasons = Object.entries(skipProfile || {})
    .filter(([, entry]) => (entry?.applies || 0) >= 2 && entry?.lastStillApplies)
    .sort((a, b) => ((b[1].applies || 0) + (b[1].changed || 0)) - ((a[1].applies || 0) + (a[1].changed || 0)))
    .map(([reasonId]) => reasonId);
  const skipPrefs = confirmedReasons
    .map((reasonId) => skipReasonPref(reasonId, pantryItems || pantry))
    .filter(Boolean);

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
      ...skipPrefs,
    ].filter(Boolean);
    let out = pool;
    for (const pref of prefs) {
      const narrowed = out.filter(pref);
      if (narrowed.length >= Math.min(wanted, 3)) out = narrowed;
    }
    return [...out].sort((a, b) => {
      const seasonal = month ? seasonScore(b, month) - seasonScore(a, month) : 0;
      const costA = Number.isFinite(Number(a.costPerServing)) ? Number(a.costPerServing) : Number.POSITIVE_INFINITY;
      const costB = Number.isFinite(Number(b.costPerServing)) ? Number(b.costPerServing) : Number.POSITIVE_INFINITY;
      const cost = costA - costB;
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
    // A focused ingredient is guaranteed one of the day's slots: its meal pool
    // narrows to a single dish that uses it, so every candidate carries it.
    let pinnedNote = null;
    if (focus.length) {
      const slotIndex = pools.findIndex((mealPool) => mealPool.some((r) => pantryHits(r, focus) >= 1));
      if (slotIndex >= 0) {
        const pinned = seededPick(pools[slotIndex].filter((r) => pantryHits(r, focus) >= 1), 1, seed + 101)[0];
        pools[slotIndex] = [pinned];
        pinnedNote = `${pinned.name} is pinned in — it uses ${focus.join(', ')} before it goes off.`;
      }
    }
    const dayCandidates = Array.from({ length: candidates }, (_, candidateIndex) => pools
      .map((pool, i) => seededPick(pool, 1, seed + i * 17 + candidateIndex * 7919)[0])
      .filter(Boolean));
    const selected = chooseCandidate(dayCandidates, wasteOptions, wasteOptimisation, multiObjective);
    const picks = selected.meals;
    const note = relaxedDay || picks.length < slots.length
      ? 'Nothing matched every filter — showing the closest fits instead.'
      : null;
    return finishPlan(
      picks,
      pinnedNote ? [pinnedNote, note].filter(Boolean).join(' ') : note,
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
    // A focused item still earns a slot — an open fill slot, or (when
    // leftovers already fill the week) one portion steps aside to make room.
    let pinned = null;
    if (focus.length) pinned = focusSwap(meals, fillPool, focus, seed) || (remaining === 0 ? focusSwap(meals, pool, focus, seed) : null);
    const keptLeftovers = meals.filter((recipe) => leftoverMeals.some((item) => item.id === recipe.id)).length;
    const base = `Leftover-first plan: ${keptLeftovers} meal${keptLeftovers === 1 ? '' : 's'} use portions already in the fridge${keptLeftovers < leftoverMeals.length ? '; one portion waits for later so the focused dish can be cooked' : keptLeftovers < count ? '; the rest favour seasonal, lower-cost dishes' : ''}.`;
    return finishPlan(
      meals,
      pinned ? `${pinned} is pinned in — it uses ${focus.join(', ')} before it goes off. ${base}` : base,
      wasteOptions,
    );
  }

  // Batch mode asks for fewer dishes on purpose: cook once, eat three times.
  if (batch && count > 2) {
    const keepers = pool.filter(batchable);
    const batchPool = narrow(keepers.length >= 3 ? keepers : pool, 3);
    // The only cook for a focused item may not be batchable: the plan stays
    // as built, then one slot swaps to it — the rule relaxes for one dish.
    const pinPool = (!batchPool.some((r) => pantryHits(r, focus) >= 1) && focus.length)
      ? [...new Set([...batchPool, ...pool.filter((r) => pantryHits(r, focus) >= 1)])]
      : batchPool;
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
      const pinned = focusSwap(meals, pinPool, focus, seed);
      const base = relaxed
        ? 'Nothing matched every filter — showing the closest fits instead.'
        : `Batch plan: cook ${distinct} dish${distinct === 1 ? '' : 'es'}, each covering about ${each} meal${each === 1 ? '' : 's'}.`;
      return finishPlan(
        meals,
        pinned ? `${pinned} is pinned in — it uses ${focus.join(', ')} before it goes off. ${base}` : base,
        wasteOptions,
      );
    }
  }

  pool = narrow(pool, count);

  const rankedCandidates = candidatePlans(pool, count, seed, variety, candidates);
  const selected = chooseCandidate(rankedCandidates, wasteOptions, wasteOptimisation, multiObjective);
  const meals = selected.meals;
  const pinned = focusSwap(meals, pool, focus, seed);
  const unique = seededPick(pool, Math.min(count, pool.length), seed);

  // When the finished plan holds a confirmed reason's preference, say so —
  // the household hears that its review answers shaped this plan.
  const skipLeaning = confirmedReasons
    .map((reasonId) => ({ reasonId, pref: skipReasonPref(reasonId, pantryItems || pantry) }))
    .filter((row) => row.pref && meals.every(row.pref))
    .map((row) => SKIP_PHRASES[row.reasonId])[0] || null;

  const base = relaxed
    ? availableOnly
      ? 'No complete pantry-only match was available — showing the closest fits instead.'
      : 'Nothing matched every filter — showing the closest fits instead.'
    : unique.length < count
      ? `Only ${unique.length} recipe${unique.length === 1 ? '' : 's'} match your filters, so the plan repeats them.`
      : variety && new Set(meals.map((m) => m.id)).size < count
        ? 'Variety on: dishes repeat only once the kitchen runs out of distinct options.'
        : skipLeaning
          ? `Planned around what you said still applies: leaning on ${skipLeaning}.`
          : null;
  const note = pinned
    ? `${pinned} is pinned in — it uses ${focus.join(', ')} before it goes off.${base ? ` ${base}` : ''}`
    : base;
  return finishPlan(meals, note, wasteOptions);
}
