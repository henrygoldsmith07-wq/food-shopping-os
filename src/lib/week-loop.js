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
import { deriveDynamicShoppingList } from './dynamic-shopping.js';
import { householdPermission } from './household.js';
import { emojiFor, uid } from './state.js';

/** Scale a free-text qty by a factor (e.g. 2 people / 1 serving). */
export const scaleQty = (qty, factor = 1) => {
  if (!qty || !(factor > 0) || Math.abs(factor - 1) < 0.05) return qty || '';
  const text = String(qty).trim();
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return text;
  const n = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(n)) return text;
  const scaled = Math.round(n * factor * 10) / 10;
  const unit = (m[2] || '').trim();
  return unit ? `${scaled} ${unit}` : String(scaled);
};

/**
 * Shopping list for the week plan, scaled to household portions and
 * reduced by pantry + leftover-covered meals.
 */
export const shoppingForWeekLoop = (app, dates = weekDates(app.day)) => {
  const people = Math.max(1, Number(app.portions) || Number(app.household) || 1);
  const raw = shoppingForPlan(app.plan || {}, dates, { pantry: app.pantry || [] });
  // shoppingForPlan uses recipe ingredient lines as written (usually 1 batch).
  // Scale each line toward household portions using the recipe’s stated servings.
  const entries = planEntries(app.plan || {}, dates);
  const recipeFactor = new Map();
  for (const entry of entries) {
    if (!entry.recipe) continue;
    const servings = Number(entry.recipe.servings) || 1;
    recipeFactor.set(entry.recipe.name, people / servings);
  }
  return raw.map((item) => {
    const factor = recipeFactor.get(item.fromRecipe) || people;
    return {
      ...item,
      qty: scaleQty(item.qty, factor),
      people,
    };
  });
};

/** Ingredients the plan needs vs what the pantry already covers (name match). */
export const pantryCheckForPlan = (app, dates = weekDates(app.day)) => {
  const need = shoppingForPlan(app.plan || {}, dates, { pantry: [] });
  // truth-aware: only confirmed_sufficient / probably_available count as have
  const sufficientNames = new Set(
    (app.pantry || [])
      .filter((row) => {
        const c = String(row.confidence || "definite").toLowerCase();
        if (c === "unknown") return false;
        if (row.low) return false;
        // Probable counts; definite counts even when the amount wasn't recorded.
        return true;
      })
      .map((p) => canonicalName(p.name, app.aliasMemory)),
  );
  const covered = need.filter((i) => sufficientNames.has(String(i.name).toLowerCase()));
  const missing = shoppingForPlan(app.plan || {}, dates, { pantry: app.pantry || [] });
  const leftoverCovered = coveredByLeftovers(app.plan || {}, dates, app.pantry || []);
  return {
    totalIngredients: need.length,
    coveredByPantry: covered.length,
    missing: missing.length,
    missingItems: missing,
    leftoverMeals: leftoverCovered.length,
    plannedMeals: planStats(app.plan || {}, dates, { people: app.portions || 1 }).meals,
  };
};

export const weekLoopSnapshot = (app) => {
  const dates = weekDates(app.day);
  const stats = planStats(app.plan || {}, dates, { people: app.portions || 1 });
  const list = app.shoppingList || [];
  const checked = list.filter((i) => i.checked);
  const pantryCheck = pantryCheckForPlan(app, dates);
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
    portions: (app.portions || app.household || 1) >= 1,
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
 * The plan's changes land in the shopping list by themselves.
 *
 * This is the transition the loop used to lose: a dish moved, dropped or
 * added left the list describing a week nobody was cooking any more, and
 * every stock change (a binned pepper, a reconciled shop, an eaten leftover)
 * silently changed what was genuinely missing. Given the next state, this
 * returns the list the plan actually needs now — and nothing else:
 *
 *  - rows the plan stopped asking for go (only unchecked, plan-derived rows;
 *    a row whose dish is still planned elsewhere in the calendar stays),
 *  - what a planned dish is missing arrives, but only for a household that
 *    already runs the plan→list flow, so a stray plan edit never conjures a
 *    list out of nothing,
 *  - untouched quantities refresh; a quantity the household edited stays.
 *
 * Returns {} when there is nothing to change, so callers can spread it.
 */
export const reconcileListWithPlan = (state, dates = weekDates(state?.day)) => {
  if (!state || !householdPermission(state, 'shopping')) return {};
  const list = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  const plan = state.plan || {};
  const aliasMemory = state.aliasMemory || {};

  // What this week's plan needs, after the pantry, the leftovers and the
  // household's own waste pattern have had their say.
  const dynamic = deriveDynamicShoppingList(state, { dates });
  const derived = wasteAwareList(dynamic.length ? dynamic : shoppingForWeekLoop(state, dates), {
    waste: state.waste || [],
    today: state.day,
    learnedAliases: aliasMemory,
  });
  const keyOf = (name) => canonicalName(name, aliasMemory);
  const needed = new Map();
  for (const row of derived) {
    const key = keyOf(row.name);
    if (key && !needed.has(key)) needed.set(key, row);
  }

  // A dish planned anywhere still owns its rows — moving Tuesday's dinner
  // into next month must not strand its shopping mid-move.
  const plannedRecipeNames = new Set(
    planEntries(plan, Object.keys(plan).sort()).map((entry) => entry.recipe?.name).filter(Boolean),
  );

  const presentKeys = new Set(list.map((row) => keyOf(row.name)));
  let changed = false;
  const nextList = [];
  for (const row of list) {
    const key = keyOf(row.name);
    const auto = Boolean(row.fromRecipe) && !row.checked;
    if (auto && !needed.has(key) && !plannedRecipeNames.has(row.fromRecipe)) {
      changed = true;
      continue; // the plan no longer asks for this
    }
    const neededRow = needed.get(key);
    if (auto && neededRow) {
      const untouched = row.lastAutoQty != null ? row.qty === row.lastAutoQty : row.qty === neededRow.qty;
      if (untouched && (row.qty !== neededRow.qty || row.wasteNote !== neededRow.wasteNote)) {
        changed = true;
        nextList.push({
          ...row,
          qty: neededRow.qty,
          lastAutoQty: neededRow.qty,
          wasteNote: neededRow.wasteNote,
          binnedCount: neededRow.binnedCount,
          lastBinnedAt: neededRow.lastBinnedAt,
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
  return { shoppingList: nextList };
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
  const follow = reconcileListWithPlan({ ...state, ...changes });
  if (follow.shoppingList && follow.shoppingList !== changes.shoppingList) {
    return { ...changes, shoppingList: follow.shoppingList };
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
