// @ts-check
/**
 * The Week Manager — one orchestration derivation for the household's food
 * week.
 *
 * Planning, pantry, shopping and cooking are not four modules to a person:
 * they are one week. This module is the single place that looks at the whole
 * of it and answers four questions in one read:
 *
 *   1. What state is the week in?      → one status, derived from real state
 *   2. What needs a human?             → the exceptions, and only those
 *   3. What is the smallest useful
 *      intervention?                  → one primary action, or silence
 *   4. What has Forq already handled?  → the quiet-success line
 *
 * Everything here composes existing derivations — the week loop snapshot,
 * the autopilot proposal, the recovery engine, the adaptation collection,
 * the outcome metrics. Nothing is recomputed; two surfaces reading the
 * manager can never disagree with the systems underneath it.
 */
import { weekLoopSnapshot } from './week-loop.js';
import { collectAdaptations } from './adaptations.js';
import { rescuedExpiringCount } from './loop-learning.js';
import { expiringSoon } from './kitchen.js';
import { planEntries } from './mealplan.js';

/** The week-level status — one word a household can act on, never a score. */
export const WEEK_STATES = {
  planning: 'Planning',
  readyToShop: 'Ready to shop',
  shopping: 'Shopping',
  ready: 'Ready for the week',
  inProgress: 'In progress',
  needsAttention: 'Needs attention',
  reviewAvailable: 'Review available',
};

/**
 * The one week-level derivation.
 *
 * @param {any} app the derived app view (deriveApp)
 * @param {{ today?: string }} [options]
 */
export function weekManager(app = {}, { today = app.day } = {}) {
  const snap = weekLoopSnapshot(app);
  const dates = snap.dates;
  const plannedMeals = snap.stats.meals;
  const plannedDays = new Set(planEntries(app.plan || {}, dates).map((entry) => entry.date));
  const upcomingDays = dates.filter((date) => date >= today);
  const plannedUpcoming = upcomingDays.filter((date) => plannedDays.has(date)).length;
  const openDays = upcomingDays.length - plannedUpcoming;

  const list = app.shoppingList || [];
  const unchecked = list.filter((row) => !row.checked).length;
  const checked = list.length - unchecked;
  const shopsToday = snap.shopsToday.length > 0;

  const expiring = expiringSoon(app.pantry || [], 3, today);
  const leftovers = (app.leftovers || []).filter((row) => row.cat === 'Leftovers' || row.recipeId);
  const adaptations = collectAdaptations(app, { today }).adaptations;

  // --- Exceptions: only what genuinely needs a human, each one actionable.
  const exceptions = [];

  // A week that needs repairing (reality diverged from the plan) is the
  // highest-value exception: the recovery engine has repairs ready to apply.
  const recovery = app.weekRecovery;
  if (recovery?.repairs?.length) {
    exceptions.push({
      id: 'repair-week',
      severity: 'warn',
      title: 'Your week needs a quick repair',
      detail: recovery.explanations?.[0] || `${recovery.repairs.length} planned day${recovery.repairs.length === 1 ? '' : 's'} need adjusting.`,
      goTab: 'plan',
      actionLabel: 'Repair week',
    });
  }

  if (expiring.length > 0) {
    const usesIt = snap.listPreview.some((row) => expiring.some((item) => {
      const name = String(item.name || '').toLowerCase();
      const rowName = String(row.name || '').toLowerCase();
      return rowName.includes(name) || name.includes(rowName);
    }));
    if (!usesIt) {
      exceptions.push({
        id: 'expiring',
        severity: 'warn',
        title: `${expiring.length} ingredient${expiring.length === 1 ? '' : 's'} expire soon`,
        detail: expiring.slice(0, 3).map((item) => item.name).join(', '),
        goTab: 'plan',
        actionLabel: 'Plan around them',
      });
    }
  }

  if (openDays > 0) {
    exceptions.push({
      id: 'open-days',
      severity: 'info',
      title: `${openDays} day${openDays === 1 ? '' : 's'} still unplanned`,
      detail: 'Forq can fill them in around what you already have.',
      goTab: 'plan',
      actionLabel: 'Fill the week',
    });
  }

  if (unchecked > 0 && shopsToday === false && plannedUpcoming > 0) {
    exceptions.push({
      id: 'to-buy',
      severity: 'info',
      title: `${unchecked} item${unchecked === 1 ? '' : 's'} still to buy`,
      detail: 'The list was built from the plan — pantry already subtracted.',
      goTab: 'shop',
      actionLabel: 'Open the list',
    });
  }

  if (adaptations.length > 0) {
    exceptions.push({
      id: 'adaptation-review',
      severity: 'info',
      title: `${adaptations.length} change${adaptations.length === 1 ? '' : 's'} Forq wants to make`,
      detail: adaptations[0].title,
      goTab: 'learn',
      actionLabel: 'Review changes',
    });
  }

  if (leftovers.length > 0) {
    const plannedUsesLeftovers = snap.pantryCheck.leftoverMeals > 0;
    if (!plannedUsesLeftovers) {
      exceptions.push({
        id: 'leftovers',
        severity: 'info',
        title: `${leftovers.length} leftover${leftovers.length === 1 ? '' : 's'} need using`,
        detail: 'Slotting them into the plan means buying less next time.',
        goTab: 'plan',
        actionLabel: 'Plan around them',
      });
    }
  }

  // --- Status: derived from what the week actually holds.
  const needsAttention = exceptions.some((e) => e.severity === 'warn');
  const weekComplete = dates.every((date) => date < today || plannedDays.has(date));
  const reviewDue = dates.filter((date) => date < today).length >= 2
    && (app.cooked || []).length > 0;

  let state;
  if (needsAttention) state = WEEK_STATES.needsAttention;
  else if (reviewDue && openDays === 0) state = WEEK_STATES.reviewAvailable;
  else if (openDays > 0 && plannedUpcoming > 0) state = WEEK_STATES.planning;
  else if (openDays > 0) state = WEEK_STATES.planning;
  else if (unchecked > 0) state = WEEK_STATES.readyToShop;
  else if (checked > 0 && !shopsToday) state = WEEK_STATES.shopping;
  else if (shopsToday || checked > 0) state = WEEK_STATES.inProgress;
  else state = WEEK_STATES.ready;

  // --- The one intervention, or silence. Quiet success is a real answer.
  // The primary action comes from the canonical next-action ranker
  // (lib/next-action.js) — this module never becomes a competing ranker, it
  // only decides whether the week needs anything at all.
  let primary = null;
  if (exceptions.length) {
    const top = exceptions.find((e) => e.severity === 'warn') || exceptions[0];
    primary = {
      id: top.id,
      title: top.actionLabel || top.title,
      detail: top.title,
      run: { goTab: top.goTab },
    };
  } else if (state === WEEK_STATES.ready) {
    primary = null; // "Nothing needs attention" — the calm state is the answer.
  } else if (state === WEEK_STATES.reviewAvailable) {
    primary = { id: 'review', title: 'Review this week', detail: 'A short review is ready.', run: { goTab: 'learn' } };
  }

  // --- Quiet success: what Forq already handled.
  const handled = [];
  if (plannedMeals > 0) handled.push(`${plannedMeals} meal${plannedMeals === 1 ? '' : 's'} planned`);
  if (snap.pantryCheck.coveredByPantry > 0) {
    handled.push(`${snap.pantryCheck.coveredByPantry} pantry item${snap.pantryCheck.coveredByPantry === 1 ? '' : 's'} accounted for`);
  }
  if (snap.pantryCheck.leftoverMeals > 0) {
    handled.push(`${snap.pantryCheck.leftoverMeals} meal${snap.pantryCheck.leftoverMeals === 1 ? '' : 's'} covered by leftovers`);
  }
  if (snap.pantryCheck.leftoverMeals > 0 || snap.listPreview.length > 0) {
    // Expiry rescue is one shared derivation (loop-learning.js) — the same
    // count the Autopilot summary and outcome metrics quote.
    const rescued = rescuedExpiringCount(
      planEntries(app.plan || {}, dates).map((entry) => entry.recipe).filter(Boolean),
      app,
    );
    if (rescued > 0) handled.push(`${rescued} ingredient${rescued === 1 ? '' : 's'} rescued before expiry`);
  }

  return {
    state,
    statusLine: state === WEEK_STATES.ready ? 'Week ready' : state,
    summary: handled,
    exceptions,
    primary,
    quiet: exceptions.length === 0,
    plannedMeals,
    plannedUpcoming,
    openDays,
    unchecked,
    expiring: expiring.length,
    needsAttention,
    dates,
  };
}
