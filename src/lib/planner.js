import { RECIPES } from '../data/recipes.js';
import { seasonScore } from '../data/seasons.js';
import { seededPick } from './utils.js';
import { tasteScore } from './taste.js';
import { confirmedSkipReasonIds, SKIP_PHRASES } from './skip-preferences.js';
import {
  hardFilter, pantryHits, OCCASION_PREFS, GOAL_PREFS, skipReasonPref, batchable, candidateCount,
  candidatePlans, finishPlan, focusSwap, chooseCandidate, scopeCount, scopeMeals,
} from './planner-core.js';
import { buildMultiDayPlan } from './planner-multiday.js';

export {
  chooseWasteMinimisingPlan, learnWasteProfile, rankWastePlans, scoreWastePlan,
} from './waste-planner.js';
export {
  EQUIPMENT_TAGS, equipmentTags, activeEquipment, equipmentOk, varietyMeals, pantryCoverage,
  hardFilter, pantryHits, BATCH_TAGS, chooseCandidate, scopeCount, scopeMeals, windowBudget,
} from './planner-core.js';

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
    // Which slots each day holds. Defaults to the scope's own answer
    // (a day is all three meals, longer runs are dinners) — the generator
    // offers breakfast, lunch and dinner for weeks and months through this.
    slots = null,
  },
  seed,
) {
  const count = Math.max(1, days || scopeCount(scope));
  const slotList = slots && slots.length ? slots : scopeMeals(scope);
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
  const confirmedReasons = confirmedSkipReasonIds(skipProfile);
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
      // Leftover-first: a dish that consumes more use-soon items outranks one
      // that consumes fewer, before seasonal/cost tie-breaks. Expiry only
      // filters (>=1 hit) above, so without this a 3-hit dish ties a 1-hit one.
      const expA = expiry.length ? pantryHits(a, expiry) : 0;
      const expB = expiry.length ? pantryHits(b, expiry) : 0;
      if (expB !== expA) return expB - expA;
      const seasonal = month ? seasonScore(b, month) - seasonScore(a, month) : 0;
      const costA = Number.isFinite(Number(a.costPerServing)) ? Number(a.costPerServing) : Number.POSITIVE_INFINITY;
      const costB = Number.isFinite(Number(b.costPerServing)) ? Number(b.costPerServing) : Number.POSITIVE_INFINITY;
      const cost = costA - costB;
      return seasonal * 4 + cost;
    });
  };

  // A week or month of full days: one dish per slot per day, laid day-major
  // (Monday breakfast→dinner, then Tuesday…). Pools stay per slot so a lunch
  // pool never donates a dinner; variety is tracked across the whole run so
  // Tuesday doesn't repeat Monday where the pool allows. 'A day' keeps its
  // own single-day branch below.
  if (slotList.length > 1 && scope !== 'A day') {
    return buildMultiDayPlan({
      slotList,
      dayCount: count,
      diets,
      goal,
      budget,
      maxTime,
      occasion,
      people,
      pantry,
      month,
      batch,
      recipes,
      taste,
      leftovers,
      equipment,
      expiry,
      focus,
      variety,
      pantryItems,
      availableOnly,
      wasteOptimisation,
      multiObjective,
      wasteOptions: {
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
      },
      candidateRuns: candidateCount(wasteOptimisation),
      narrow,
      seed,
    });
  }

  // A day's plan takes one dish from each meal; everything else is dinners.
  if (slotList.length > 1) {
    let relaxedDay = false;
    const pools = slotList.map((meal) => {
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
    const note = relaxedDay || picks.length < slotList.length
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
