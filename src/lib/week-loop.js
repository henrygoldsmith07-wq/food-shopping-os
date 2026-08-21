/**
 * Progress and list helpers for the guided week loop.
 */

import { weekDates } from './kitchen.js';import { coveredByLeftovers,
  planEntries,
  planStats,
  shoppingForPlan,
} from './mealplan.js';
import { canonicalName } from './aliases.js';
import { compareStores, groupForStore, savingsAvailable } from './shopping.js';
import { WEEK_LOOP_STEPS } from '../data/weekLoop.js';

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
