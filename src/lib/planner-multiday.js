import { seededPick } from './utils.js';
import { canonicalName } from './aliases.js';
import {
  hardFilter, pantryHits, batchable, finishPlan, chooseCandidate,
} from './planner-core.js';

/**
 * A week or month of full days for the multi-day branch of buildPlan.
 *
 * One dish per slot per day, laid day-major (Monday breakfast→dinner, then
 * Tuesday…), so the generator can hand back dated breakfast/lunch/dinner
 * triples instead of dinners alone. Pools stay per slot — a lunch pool never
 * donates a dinner — and variety is tracked across the whole run, exactly
 * like varietyMeals but across three pools at once: Tuesday doesn't repeat
 * Monday where the pool allows, and dishes repeat only once a pool runs out
 * of distinct options. Leftover-first and batch keep their dinners-run
 * meaning (earliest dinners, fewer distinct dinners); breakfasts and lunches
 * always vary. A focused ingredient pins the last cell of the first slot
 * whose pool can cook it, so a lunch item never lands in a dinner cell.
 */
export const buildMultiDayPlan = ({
  slotList, dayCount, diets, goal, budget, maxTime, occasion, people,
  pantry, month, batch, recipes, taste, leftovers, equipment, expiry,
  focus, variety, pantryItems, availableOnly, wasteOptimisation,
  multiObjective, wasteOptions, candidateRuns, narrow, seed,
}) => {
  const total = dayCount * slotList.length;
  let relaxed = false;
  const slotPools = slotList.map((meal) => {
    const forSlot = recipes.filter((r) => r.meal === meal);
    const strictPool = hardFilter(forSlot, {
      diets, goal, budget, maxTime, equipment, pantry: pantryItems || pantry, availableOnly,
    });
    const mealPool = strictPool.length || !availableOnly
      ? strictPool
      : hardFilter(forSlot, { diets, goal, budget, maxTime, equipment });
    if (!mealPool.length || (availableOnly && !strictPool.length)) relaxed = true;
    const narrowed = mealPool.length ? narrow(mealPool, dayCount) : forSlot;
    if (!mealPool.length) relaxed = true;
    return narrowed.length ? narrowed : forSlot;
  });
  const dinnerIdx = slotList.indexOf('dinner');
  const dinnerPool = dinnerIdx >= 0 ? slotPools[dinnerIdx] : [];

  const leftoverDinners = dinnerIdx >= 0 ? leftovers.flatMap((item) => {
    const recipe = recipes.find((candidate) => candidate.id === item.recipeId);
    const portions = Math.max(0, Math.floor(Number(item.portions) || 0));
    return recipe && dinnerPool.some((candidate) => candidate.id === recipe.id)
      ? Array.from({ length: Math.min(portions, dayCount) }, () => recipe)
      : [];
  }).slice(0, dayCount) : [];

  const keyOf = (r) => canonicalName(r.name);
  const ingredientsOf = (r) => (r.ingredients || []).map((i) => String(i.name || i).toLowerCase());
  // One full run: every cell filled, earliest dinners from the fridge first.
  const buildRun = (runIndex) => {
    const runSeed = seed + runIndex * 7919;
    const usedIds = new Set();
    const usedIng = new Set();
    const remember = (recipe) => {
      usedIds.add(keyOf(recipe));
      ingredientsOf(recipe).forEach((ing) => usedIng.add(ing));
    };
    const pickFor = (pool, cellSeed) => {
      if (!pool.length) return null;
      if (variety) {
        const fresh = pool.filter((r) => {
          if (usedIds.has(keyOf(r))) return false;
          return ingredientsOf(r).filter((ing) => usedIng.has(ing)).length === 0;
        });
        const pick = seededPick(fresh.length ? fresh : pool, 1, cellSeed)[0];
        if (pick) remember(pick);
        return pick;
      }
      return seededPick(pool, 1, cellSeed)[0];
    };
    // Batch dinners: a few keepers rotating in even blocks across the run.
    let keepers = null;
    if (batch && dinnerIdx >= 0 && dayCount > 2 && dinnerPool.length) {
      const batchablePool = dinnerPool.filter(batchable);
      const base = narrow(batchablePool.length >= 3 ? batchablePool : dinnerPool, 3);
      const distinct = Math.max(2, Math.round(dayCount / 3));
      const source = base.length ? base : dinnerPool;
      keepers = seededPick(source, Math.min(distinct, source.length), runSeed + 7);
    }
    const run = [];
    for (let d = 0; d < dayCount; d += 1) {
      slotList.forEach((slot, s) => {
        let pick = null;
        if (s === dinnerIdx && d < leftoverDinners.length) {
          pick = leftoverDinners[d];
          remember(pick);
        } else if (keepers && s === dinnerIdx) {
          pick = keepers[Math.floor((d * keepers.length) / dayCount)];
          remember(pick);
        } else {
          pick = pickFor(slotPools[s], runSeed + d * 31 + s * 17);
        }
        if (pick) run.push(pick);
      });
    }
    return run;
  };

  const runs = Array.from({ length: Math.max(1, candidateRuns) }, (_, i) => buildRun(i)).filter((run) => run.length);
  if (!runs.length) {
    return finishPlan([], 'Nothing in the recipe book fits those meals — try relaxing time or budget.', wasteOptions);
  }
  const selected = chooseCandidate(runs, wasteOptions, wasteOptimisation, multiObjective);
  const meals = selected.meals;

  // A focused ingredient earns the last cell of the first slot that cooks it;
  // like focusSwap, the dish is named whether it was already chosen or pinned.
  let pinned = focus.length ? meals.find((m) => pantryHits(m, focus) >= 1)?.name || null : null;
  if (focus.length && !pinned) {
    for (let s = 0; s < slotList.length; s += 1) {
      const hitters = slotPools[s].filter((r) => pantryHits(r, focus) >= 1);
      if (!hitters.length) continue;
      const pin = seededPick(hitters, 1, seed + 101)[0];
      if (!pin) continue;
      for (let d = dayCount - 1; d >= 0; d -= 1) {
        const idx = d * slotList.length + s;
        if (meals[idx]) {
          meals[idx] = pin;
          pinned = pin.name;
          break;
        }
      }
      if (pinned) break;
    }
  }

  const distinct = new Set(meals.map((m) => m.id)).size;
  const dinnerDistinct = dinnerIdx >= 0
    ? new Set(meals.filter((_, i) => i % slotList.length === dinnerIdx).map((m) => m.id)).size
    : 0;
  const scope = `${slotList.join(', ')} for ${dayCount} day${dayCount === 1 ? '' : 's'}`;
  let base;
  if (relaxed) {
    base = availableOnly
      ? 'No complete pantry-only match was available — showing the closest fits instead.'
      : 'Nothing matched every filter — showing the closest fits instead.';
  } else if (batch && dinnerIdx >= 0) {
    // Batch repeats dinners on purpose, so its note leads: the generic
    // repeat note below would misread deliberate cook-once blocks as a
    // thin pool.
    base = `Batch dinners: ${dinnerDistinct} distinct dinner dish${dinnerDistinct === 1 ? '' : 'es'} across the run; breakfasts and lunches vary. Planned ${scope}.`;
  } else if (distinct < total) {
    base = variety
      ? 'Variety on: dishes repeat only once the kitchen runs out of distinct options.'
      : `Only ${distinct} distinct dish${distinct === 1 ? '' : 'es'} match your filters, so the plan repeats them across ${scope}.`;
  } else {
    base = `Planned ${scope}.`;
  }
  const leftoverNote = leftoverDinners.length
    ? `Leftover-first plan: ${leftoverDinners.length} dinner${leftoverDinners.length === 1 ? '' : 's'} use${leftoverDinners.length === 1 ? 's' : ''} portions already in the fridge. `
    : '';
  const note = pinned
    ? `${pinned} is pinned in — it uses ${focus.join(', ')} before it goes off. ${leftoverNote}${base}`
    : `${leftoverNote}${base}`;
  return finishPlan(meals, note, wasteOptions);
};
