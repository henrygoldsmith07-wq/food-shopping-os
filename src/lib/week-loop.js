/**
 * Progress and list helpers for the guided week loop.
 */

import { weekDates } from './kitchen.js';import { coveredByLeftovers,
  planEntries,
  planStats,
  shoppingForPlan,
} from './mealplan.js';
import { canonicalName } from './aliases.js';
import { aisleFor, compareStores, groupForStore, savingsAvailable } from './shopping.js';
import { WEEK_LOOP_STEPS } from '../data/weekLoop.js';
import { wasteAwareList } from './loop-learning.js';
import { heldAdaptationKeys } from './adaptation-suppression.js';
import { replacePredictionsForList } from './shopping-predictions.js';
import { deriveDynamicShoppingList } from './dynamic-shopping.js';
import { householdPermission } from './household.js';
import { uid } from './state.js';
import { emojiFor } from './food-lookup.js';
import { householdPortionsFor } from './portions.js';

/** Single scaling implementation — see portions.js. Kept as a re-export so
 * existing imports from this module keep working. */
export { scaleQty } from './portions.js';

/**
 * The week loop's portions and list scaling live in `portions.js` — one
 * decision shared with every other plan-to-list path, so the loop cannot
 * disagree with the plan generator about how much to buy.
 */
export { householdPortionsFor } from './portions.js';

/**
 * Shopping list for the week plan, scaled to household portions and
 * reduced by pantry + leftover-covered meals.
 *
 * Portions follow `householdPortionsFor` — the configured household size,
 * or the learned appetite when recorded cooks consistently disagree with
 * it — and the result says which one it used.
 */
export const shoppingForWeekLoop = (app, dates = weekDates(app.day)) => {
  // The same waste learning every other Plan → List hand-off applies: an
  // ingredient the household keeps binning arrives one unit lighter, here
  // too. The loop's own "generate" used to skip this, so its added list
  // disagreed with the reconciled list for the same plan. Composed from
  // weekPlanNeed so preview, reconcile and dynamic list share one need.
  const { rows, portions } = weekPlanNeed(app, dates);
  return { items: rows.map((item) => ({ ...item, people: portions.portions })), portions };
};

/** Ingredients the plan needs vs what the pantry actually covers. */
export const pantryCheckForPlan = (app, dates = weekDates(app.day)) => {
  const household = householdPortionsFor(app);
  const options = {
    today: app.day, learnedAliases: app.aliasMemory || {}, people: household.portions,
  };
  const need = shoppingForPlan(app.plan || {}, dates, {
    pantry: [], ...options,
  });
  // Measure pantry coverage through the same quantity-/alias-/confidence-aware
  // calculation that builds the list. A name match alone used to call 2 thighs
  // "covered" even when the household needed 8, and aliases could disagree
  // with the shopping result. Exclude leftover rows here so the pantry count
  // remains distinct from the leftoverMeals metric below.
  const pantryOnly = (app.pantry || []).filter((row) => row.cat !== 'Leftovers');
  const afterPantry = shoppingForPlan(app.plan || {}, dates, { pantry: pantryOnly, ...options });
  const stillNeeded = new Set(afterPantry.map((item) => canonicalName(item.name, app.aliasMemory)));
  const covered = need.filter((item) => !stillNeeded.has(canonicalName(item.name, app.aliasMemory)));
  const missing = shoppingForPlan(app.plan || {}, dates, {
    pantry: app.pantry || [], ...options,
  });
  const leftoverCovered = coveredByLeftovers(app.plan || {}, dates, app.pantry || [], { people: household.portions });
  return {
    totalIngredients: need.length,
    coveredByPantry: covered.length,
    missing: missing.length,
    missingItems: missing,
    leftoverMeals: leftoverCovered.length,
    plannedMeals: planStats(app.plan || {}, dates, { people: household.portions }).meals,
  };
};

export const weekLoopSnapshot = (app) => {
  const dates = weekDates(app.day);
  const household = householdPortionsFor(app);
  const stats = planStats(app.plan || {}, dates, { people: household.portions });
  const list = app.shoppingList || [];
  const checked = list.filter((i) => i.checked);
  const pantryCheck = pantryCheckForPlan(app, dates);
  // The one preview the loop's list step compares against: the plan's need
  // MINUS pantry quantities. shoppingForPlan already subtracts them, so the
  // preview and the generated list can never disagree about "still to buy".
  const listPreview = shoppingForWeekLoop(app, dates);
  const shopsToday = (app.shops || []).filter((s) => s.date === app.day);
  const cookedToday = (app.cooked || []).filter((c) => c.date === app.day);
  const leftovers = (app.leftovers || app.pantry || []).filter((p) => p.cat === 'Leftovers' || p.recipeId);
  const plannedToday = planEntries(app.plan || {}, [app.day]);
  const stores = compareStores(list, app.shops || []);
  const savings = savingsAvailable(list, app.shops || []);
  const aisleGroups = groupForStore(list, {
    store: null,
    routes: app.storeRoutes || {},
    memory: app.aisleMemory || {},
  });

  const done = {
    plan: stats.meals > 0,
    portions: household.portions >= 1,
    pantry: stats.meals > 0, // reviewable once planned
    list: list.length > 0 || (stats.meals > 0 && pantryCheck.missing === 0),
    prices: true, // optional
    shop: checked.length > 0 || (list.length === 0 && shopsToday.length > 0),
    stock: shopsToday.length > 0,
    cook: cookedToday.length > 0,
    leftovers: leftovers.length > 0 || cookedToday.length > 0,
    reuse: leftovers.some((l) => {
      // scheduled if leftover recipe appears again on a later plan day
      const later = planEntries(app.plan || {}, dates.filter((d) => d > app.day));
      return later.some((e) => e.recipeId === l.recipeId);
    }) || leftovers.length === 0,
  };

  const firstOpen = WEEK_LOOP_STEPS.find((s) => !done[s.id]) || WEEK_LOOP_STEPS[WEEK_LOOP_STEPS.length - 1];

  return {
    dates,
    stats,
    pantryCheck,
    list,
    listPreview: listPreview.items,
    portions: listPreview.portions,
    checkedCount: checked.length,
    shopsToday,
    cookedToday,
    plannedToday,
    leftovers: app.leftovers || leftovers,
    stores,
    savings,
    aisleGroups,
    done,
    nextStepId: firstOpen.id,
    stepIndex: WEEK_LOOP_STEPS.findIndex((s) => s.id === firstOpen.id),
  };
};

/**
 * The week's plan-derived need, before staples/manual rows join it.
 *
 * One composed source of truth for every weekly-list entry point: the
 * preview (`weekLoopSnapshot.listPreview`), the reconciler below and the
 * dynamic list builder all start from these rows. `deriveDynamicShoppingList`
 * then adds staples, manual and requested rows only — it never recomputes
 * plan need, pantry deduction or waste learning.
 */
export const weekPlanNeed = (state, dates = weekDates(state?.day)) => {
  const aliasMemory = state.aliasMemory || {};
  const household = householdPortionsFor(state);
  return {
    rows: wasteAwareList(shoppingForPlan(state.plan || {}, dates, {
      pantry: state.pantry || [], today: state.day, learnedAliases: aliasMemory,
      people: household.portions,
    }), {
      waste: state.waste || [],
      cooked: state.cooked || [],
      today: state.day,
      learnedAliases: aliasMemory,
      held: heldAdaptationKeys(state, { today: state.day }),
    }),
    portions: household,
    aliasMemory,
  };
};

export const reconcileListWithPlan = (state, dates = weekDates(state?.day), { planChanged = false } = {}) => {
  if (!state || !householdPermission(state, 'shopping')) return {};
  const list = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  const plan = state.plan || {};
  // One need source of truth (see weekPlanNeed): the dynamic builder only
  // adds staples/manual/requested rows on top of these same plan rows, and
  // the fallback below is those rows unadorned — so preview, generated list
  // and reconcile share identical plan need, pantry deduction and waste
  // learning, differing only by intentionally added rows and preserved
  // household edits (checked, hand quantities, hand rows).
  const { rows: needRows, aliasMemory } = weekPlanNeed(state, dates);
  // The household's "not for me" set — read once, used both to hold the
  // rows and to label the prediction snapshots below.
  const held = heldAdaptationKeys(state, { today: state.day });

  // What this week's plan needs, after the pantry, the leftovers and the
  // household's own waste pattern have had their say — fed with the exact
  // rows above so neither path can drift. One waste pass over the composed
  // result: plan rows were already adjusted in weekPlanNeed (the guard in
  // wasteAwareList skips them), while staples and manual rows get their
  // first — never a second — adjustment here.
  const dynamic = deriveDynamicShoppingList(state, { dates, planNeed: needRows });
  const composed = dynamic.length ? dynamic : needRows;
  const derived = wasteAwareList(composed, {
    waste: state.waste || [],
    cooked: state.cooked || [],
    today: state.day,
    learnedAliases: aliasMemory,
    // "Not for me" outlives regeneration: a rejected adaptation's row
    // arrives untouched here, so the refresh below can never overwrite the
    // household's undo with a fresh reduction (see adaptation-suppression.js).
    held,
  });
  const keyOf = (name) => canonicalName(name, aliasMemory);
  const needed = new Map();
  for (const row of derived) {
    const key = keyOf(row.name);
    if (key && !needed.has(key)) needed.set(key, row);
  }

  // Rows that belong ONLY to a plan outside this synced range must survive a
  // current-week pantry/portion refresh — moving Tuesday's dinner into next
  // month must not strand its shopping. But a row for a meal inside `dates`
  // is allowed to disappear when the pantry now covers it; the old
  // "recipe planned anywhere" guard kept covered current-week food on the
  // shopping list indefinitely.
  const planEntriesAll = planEntries(plan, Object.keys(plan).sort());
  const rangeDates = new Set(dates);
  const plannedRecipeNames = new Set(
    planEntriesAll.map((entry) => entry.recipe?.name).filter(Boolean),
  );
  const plannedOutsideRangeNames = new Set(
    planEntriesAll
      .filter((entry) => !rangeDates.has(entry.date))
      .map((entry) => entry.recipe?.name)
      .filter(Boolean),
  );

  // Only prune when this list answers to a plan this state can actually see:
  // the write itself changed the plan, or the plan holds entries that could
  // own the rows. A pantry or portion write against an empty plan (rows from
  // a proposal the loop has not committed yet) must never empty unchecked
  // rows — the removal branch below can only prove a row unwanted against a
  // plan it is looking at.
  const canPrune = planChanged || planEntriesAll.length > 0;

  const presentKeys = new Set(list.map((row) => keyOf(row.name)));
  let changed = false;
  const nextList = [];
  for (const row of list) {
    const key = keyOf(row.name);
    const auto = Boolean(row.fromRecipe) && !row.checked;
    const owners = Array.isArray(row.sourceRecipes) && row.sourceRecipes.length
      ? row.sourceRecipes
      : [row.fromRecipe].filter(Boolean);
    // During a plan edit, a row can predate the committed plan (for example a
    // proposal the household is accepting). Preserve it when the same recipe
    // is now present; a later pantry/portion refresh can safely remove it if
    // stock proves it unnecessary. When the plan edit removed its recipe,
    // there is no owner and it is pruned immediately.
    const ownedByCommittedPlan = owners.some((name) => plannedRecipeNames.has(name));
    const ownedOutsideRange = owners.some((name) => plannedOutsideRangeNames.has(name));
    const preserveUnneeded = planChanged ? ownedByCommittedPlan : ownedOutsideRange;
    if (canPrune && auto && !needed.has(key) && !preserveUnneeded) {
      changed = true;
      continue; // the plan no longer asks for this
    }
    const neededRow = needed.get(key);
    if (auto && neededRow) {
      const untouched = row.lastAutoQty != null ? row.qty === row.lastAutoQty : row.qty === neededRow.qty;
      const refreshed = {
        qty: neededRow.qty,
        lastAutoQty: neededRow.qty,
        wasteNote: neededRow.wasteNote,
        autoReduction: neededRow.autoReduction || null,
        binnedCount: neededRow.binnedCount,
        lastBinnedAt: neededRow.lastBinnedAt,
        requiredQty: neededRow.requiredQty,
        pantryQty: neededRow.pantryQty || '',
        shortfallQty: neededRow.shortfallQty || '',
        sourceRecipes: neededRow.sourceRecipes || (neededRow.fromRecipe ? [neededRow.fromRecipe] : []),
        explanation: neededRow.explanation,
        pantryTruth: neededRow.pantryTruth,
      };
      const currentEvidence = {
        qty: row.qty,
        lastAutoQty: row.lastAutoQty,
        wasteNote: row.wasteNote,
        autoReduction: row.autoReduction || null,
        binnedCount: row.binnedCount,
        lastBinnedAt: row.lastBinnedAt,
        requiredQty: row.requiredQty,
        pantryQty: row.pantryQty || '',
        shortfallQty: row.shortfallQty || '',
        sourceRecipes: row.sourceRecipes || (row.fromRecipe ? [row.fromRecipe] : []),
        explanation: row.explanation,
        pantryTruth: row.pantryTruth,
      };
      const evidenceChanged = JSON.stringify(currentEvidence) !== JSON.stringify(refreshed);
      if (untouched && evidenceChanged) {
        changed = true;
        nextList.push({
          ...row,
          ...refreshed,
        });
        continue;
      }
    }
    nextList.push(row);
  }

  // Fill in what is newly missing — but only into a list the household
  // already drives from the plan.
  if (list.some((row) => row.fromRecipe)) {
    for (const [key, row] of needed.entries()) {
      if (presentKeys.has(key)) continue;
      changed = true;
      nextList.push({
        ...row,
        id: uid('s'),
        checked: false,
        price: Number(row.price) || 0,
        priceSource: Number(row.price) > 0 ? 'recorded' : 'unknown',
        autoListed: true,
        lastAutoQty: row.qty,
        emoji: row.emoji || emojiFor(row.name),
        aisle: aisleFor(row.name, state.aisleMemory),
        note: '',
        priority: 'normal',
      });
    }
  }

  if (!changed) return {};
  // The prediction book rides with the list: every row on screen gets its
  // exact displayed quantity frozen as the store updates — the evaluation
  // layer scores this, never a post-hoc reconstruction from the recipes.
  return {
    shoppingList: nextList,
    shoppingPredictions: replacePredictionsForList(nextList, state.shoppingPredictions, {
      portionsDecision: householdPortionsFor(state),
      suppressedKeys: held,
      pantry: state.pantry || [],
      learnedAliases: aliasMemory,
      day: state.day,
    }),
  };
};

/**
 * Writes that change what the list should ask for carry the list with them.
 *
 * A plan edit, a pantry spent by cooking, a binned ingredient, a portion
 * count corrected — each lands in the same write as the list it re-derives,
 * so no separate “refresh the list” step can be forgotten. Manual rows
 * (checked, hand-typed, hand-quantitied) are never overwritten, and a
 * household without a plan-driven list is left exactly as it was.
 */
export const LIST_SYNC_TRIGGERS = ['plan', 'pantry', 'waste', 'aliasMemory', 'portions', 'household', 'day'];
export const withAutoListSync = (state, changes) => {
  const keys = Object.keys(changes || {});
  if (!keys.length || !keys.some((key) => LIST_SYNC_TRIGGERS.includes(key))) return changes;
  const nextState = { ...state, ...changes };
  const follow = reconcileListWithPlan(nextState, undefined, { planChanged: keys.includes('plan') });
  if (follow.shoppingList && follow.shoppingList !== changes.shoppingList) {
    // The follow patch carries the refreshed list AND its prediction
    // snapshots — one write, no bookkeeping step to forget.
    return { ...changes, ...follow };
  }
  return changes;
};

export const nextWeekLoopStep = (currentId) => {
  const i = WEEK_LOOP_STEPS.findIndex((s) => s.id === currentId);
  if (i < 0 || i >= WEEK_LOOP_STEPS.length - 1) return null;
  return WEEK_LOOP_STEPS[i + 1];
};

export const prevWeekLoopStep = (currentId) => {
  const i = WEEK_LOOP_STEPS.findIndex((s) => s.id === currentId);
  if (i <= 0) return null;
  return WEEK_LOOP_STEPS[i - 1];
};
