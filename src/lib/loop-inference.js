/**
 * Loop inference — the automation half of the food loop.
 *
 * The loop is Plan → List → Shop → Pantry → Cook → Leftovers → Waste →
 * Next plan. Every hand-off in it can be done by hand or inferred from
 * evidence. This module reads the state that already exists (the plan,
 * cooked history, meal-plan events, the list) and returns the state
 * changes that are probable enough to propose. It never writes, and it
 * never invents an outcome: a proposal is only as strong as its evidence,
 * and says so.
 *
 * The rule set:
 *   1. A planned meal with a recorded cook of the same dish that day needs
 *      nothing — the loop already closed (it isn't pending at all).
 *   2. A planned meal with no outcome at all becomes ONE lightweight
 *      confirmation — "cooked?" — never a form, never a silent guess.
 *   3. List rows the plan now needs but the list lacks are proposed as a
 *      single one-tap top-up (the auto-sync already handles the common
 *      path; this catches the paths no trigger covers).
 *
 * The list itself is derived automatically elsewhere (withAutoListSync);
 * this module is the safety net and the outcome bookkeeping, which are the
 * two places the loop actually leaks.
 */

import { canonicalName } from './aliases.js';
import { planEntries } from './mealplan.js';
import { weekDates } from './kitchen.js';
import { shoppingListForPlan } from './loop-learning.js';
import { allRecipes } from '../data/recipes.js';

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

/**
 * Past planned meals whose recorded outcome is a guess the household can
 * still correct, oldest first. Two kinds:
 *
 *  - a slot with NO outcome at all (the rollover hasn't reached it yet);
 *  - a slot the rollover stamped `missed` within the last few days — the
 *    stamp is an assumption, not a fact, and yesterday's dinner is exactly
 *    the thing the household still knows. Older stamps stand as history.
 *
 * Slots with a real outcome (cooked, skipped with a reason, substituted)
 * are never pending — the loop already closed for them.
 */
export const pendingMealOutcomes = (state = {}, { today = state?.day, withinDays = 14, confirmWindowDays = 3 } = {}) => {
  if (!today) return [];
  const plan = state.plan || {};
  const events = Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [];
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];

  // The latest event per slot decides what the record currently says.
  const latestEvent = new Map();
  for (const e of events) {
    if (!e?.date || !e?.slot) continue;
    const key = `${e.date}|${e.slot}`;
    const prev = latestEvent.get(key);
    if (!prev || Number(e.at || 0) >= Number(prev.at || 0)) latestEvent.set(key, e);
  }
  const cookedKeys = new Set(cooked.map((c) => `${c?.date}|${c?.recipeId}`));
  // Ledger MealCooked events (the domain commands write these) — the date
  // and recipe say which planned meal they resolve.
  const ledgerCooked = new Set(
    ledger.filter((e) => e.type === 'MealCooked' && e.date && e.recipeId)
      .map((e) => `${e.date}|${e.recipeId}`),
  );

  const rows = [];
  for (const [date, slots] of Object.entries(plan)) {
    if (date >= today) continue;
    const age = daysBetween(date, today);
    if (!Number.isFinite(age) || age < 0 || age > withinDays) continue;
    for (const [slot, recipeId] of Object.entries(slots || {})) {
      if (!recipeId) continue;
      if (cookedKeys.has(`${date}|${recipeId}`)) continue;
      if (ledgerCooked.has(`${date}|${recipeId}`)) continue;
      const event = latestEvent.get(`${date}|${slot}`);
      if (!event) {
        rows.push({ date, slot, recipeId, age, stampedMissed: false });
      } else if (event.status === 'skipped' && (event.missed === true || event.reason === 'missed')) {
        // A rollover guess — confirmable while it is still fresh.
        if (age <= confirmWindowDays) rows.push({ date, slot, recipeId, age, stampedMissed: true });
      }
      // Any other event (real skip, substitution) is a closed hand-off.
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  return rows;
};

/**
 * One confirmation per pending meal: "cooked?" with skip as the correction.
 * Nothing here claims the meal happened — the household says, in one tap,
 * and the write goes through the normal domain commands (ledger events,
 * undo paths and learning all intact).
 */
export const inferOutcomeProposals = (state = {}, options = {}) => {
  const today = options.today || state?.day;
  const pending = pendingMealOutcomes(state, { today, withinDays: options.withinDays });
  const byId = new Map(
    [...(Array.isArray(state.myRecipes) ? state.myRecipes : []), ...allRecipes()]
      .filter((r) => r?.id)
      .map((r) => [r.id, r]),
  );
  return pending.map((row) => {
    const recipe = byId.get(row.recipeId) || null;
    const name = recipe?.name || 'the planned meal';
    return {
      id: `outcome:${row.date}:${row.slot}`,
      kind: 'meal-outcome',
      date: row.date,
      slot: row.slot,
      recipeId: row.recipeId,
      recipeName: recipe?.name || null,
      title: `${name} · ${row.slot} · ${row.date}`,
      description: row.stampedMissed
        ? `Forq marked ${name} as missed on ${row.date} — did it actually happen?`
        : `Did ${name} happen on ${row.date}?`,
      confidence: 'medium',
      stampedMissed: Boolean(row.stampedMissed),
      apply: { kind: 'mark-cooked', date: row.date, slot: row.slot, recipeId: row.recipeId },
      dismiss: { kind: 'mark-skipped', date: row.date, slot: row.slot, recipeId: row.recipeId },
    };
  });
};

/**
 * What the plan needs that the list doesn't have yet, deduplicated by
 * canonical name. Only proposed when the household already drives the list
 * from the plan (at least one fromRecipe row) — a stray plan edit must
 * never conjure a list out of nothing.
 *
 * The need is computed by the ONE authoritative Plan → Shopping
 * calculation — shoppingListForPlan with the same household decision
 * (configured + learned portions), waste history, cooked history, aliases,
 * pantry and date every other list path uses — so a top-up can never
 * disagree with the list the app would have generated itself. Suppressed
 * adaptations are honoured by that same call: a quantity the household
 * undid is not re-proposed here either.
 */
export const inferListTopUp = (state = {}, { today = state?.day } = {}) => {
  const list = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  if (!list.some((row) => row.fromRecipe)) return [];
  if (!today) return [];
  const need = shoppingListForPlan(state.plan, weekDates(today), {
    pantry: Array.isArray(state.pantry) ? state.pantry : [],
    waste: Array.isArray(state.waste) ? state.waste : [],
    cooked: Array.isArray(state.cooked) ? state.cooked : [],
    today,
    learnedAliases: state.aliasMemory || {},
    app: state,
    state,
  });
  const keyOf = (name) => canonicalName(name, state.aliasMemory) || String(name || '').toLowerCase();
  const have = new Set(list.filter((row) => !row.checked).map((row) => keyOf(row.name)));
  const seen = new Set();
  return need.filter((row) => {
    const key = keyOf(row.name);
    if (!key || have.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * The one entry point: the confirmations this week's loop still needs.
 * Ordered oldest-first (a missed meal from Monday matters more than
 * yesterday's), capped so the surface never becomes a wall of questions.
 */
export const loopInference = (state = {}, { today = state?.day, maxProposals = 4 } = {}) => {
  const outcomes = inferOutcomeProposals(state, { today }).slice(0, maxProposals);
  const topUp = inferListTopUp(state, { today });
  return {
    proposals: outcomes,
    listTopUp: topUp,
    total: outcomes.length + (topUp.length ? 1 : 0),
  };
};

/** Planned meals actually coming up (today onward) — for the This Week strip. */
export const upcomingMeals = (state = {}, { today = state?.day, days = 7 } = {}) => {
  if (!today) return [];
  const dates = weekDates(today).filter((d) => d >= today).slice(0, days);
  return planEntries(state.plan || {}, dates).map((entry) => ({
    date: entry.date,
    slot: entry.slot,
    recipeId: entry.recipeId,
    recipe: entry.recipe || null,
  }));
};

/** How much manual bookkeeping is left this week — the number automation is judged on. */
export const bookkeepingLoad = (state = {}, options = {}) => {
  const { proposals, listTopUp, total } = loopInference(state, options);
  return {
    pendingOutcomes: proposals.length,
    listTopUp: listTopUp.length,
    total,
  };
};
