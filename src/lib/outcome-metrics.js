// @ts-check
/**
 * Outcome metrics — the household's "what was this worth" layer.
 *
 * The rule the whole module exists to keep: every number carries its
 * evidence and its assumption, and a metric with no honest number is
 * reported as silence rather than as a zero. Nothing is estimated except
 * where the estimate is stated and its basis named, and money is only ever
 * quoted from recorded prices (priceSource on the row) — an unpriced
 * ingredient contributes a count, never a fabricated value.
 *
 * Composed from the existing derivations (pantry check, savings snapshot,
 * expiring window) — no second maths on any of them.
 */
import { savingsSnapshot } from './savings.js';
import { pantryCheckForPlan } from './week-loop.js';
import { expiringSoon, weekDates } from './kitchen.js';
import { planEntries } from './mealplan.js';
import { rescuedExpiringCount } from './loop-learning.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

/** The recorded (never estimated) money behind a row, or null. */
const pricedMoney = (rows = []) => {
  const priced = rows.filter((row) => Number(row.price) > 0
    && ['receipt', 'recorded', 'manual', 'retailer'].includes(row.priceSource));
  return priced.length
    ? { value: round2(priced.reduce((sum, row) => sum + Number(row.price), 0)), of: rows.length }
    : null;
};

/**
 * The value layer for one week. Each metric is one of the questions the
 * review asks ("what did Forq save?"), with the calculation visible.
 *
 * @param {any} state
 * @param {{ today?: string }} [options]
 */
export function outcomeMetrics(state = {}, { today = state.day } = {}) {
  const savings = savingsSnapshot(state, today);
  const pantry = pantryCheckForPlan(state);
  const expiring = expiringSoon(state.pantry || [], 3, today);

  // Ingredients the kitchen covered instead of the list asking for them.
  // Money only where a recorded price exists for the covered rows; the rest
  // stay a count so the figure can never quietly include guesses.
  const coveredRows = pantry.coveredItems || [];
  const coveredMoney = pricedMoney(coveredRows);

  // Rescued = an expiring item the current plan actually uses — one shared
  // derivation with the Autopilot Week summary (loop-learning.js), fed with
  // the meals the plan actually holds.
  const plannedRecipes = planEntries(state.plan || {}, weekDates(state.day))
    .map((entry) => entry.recipe)
    .filter(Boolean);
  const rescuedCount = rescuedExpiringCount(plannedRecipes, state);

  // Duplicate prevention: repeat purchases inside the window the household
  // was warned about are recorded as list rows with purchaseWarning.
  const duplicateWarnings = (state.shoppingList || []).filter((row) => row.purchaseWarning).length;

  return {
    keptOffList: {
      label: 'Kept off this week’s list',
      value: pantry.coveredByPantry,
      unit: 'ingredients',
      detail: coveredMoney
        ? `Recorded prices put about £${coveredMoney.value.toFixed(2)} of that on your receipts`
        : 'Counted from the same pantry check the list is built from',
      evidence: `${pantry.coveredByPantry} of ${pantry.totalIngredients} planned ingredients covered by stock`,
      assumption: 'Pantry quantities matched against plan need, alias-aware',
    },
    rescuedBeforeExpiry: {
      label: 'Rescued before expiry',
      value: rescuedCount,
      unit: 'ingredients',
      detail: rescuedCount
        ? `Ingredients going off soon that planned meals use`
        : 'Nothing at risk in the next three days',
      evidence: `${expiring.length} item${expiring.length === 1 ? '' : 's'} going off within three days; ${rescuedCount} used by planned meals`,
      assumption: 'Use-by window of three days, as the plan sees it',
    },
    duplicatePurchases: {
      label: 'Duplicate purchases flagged',
      value: duplicateWarnings,
      unit: 'items',
      detail: duplicateWarnings
        ? 'Rows where Forq asked you to check before buying again'
        : 'No likely duplicates on the current list',
      evidence: `${duplicateWarnings} list row${duplicateWarnings === 1 ? '' : 's'} carry a recent-purchase warning`,
      assumption: 'Based on your own recorded shops',
    },
    honestSavings: {
      label: 'Recorded savings',
      // Silence over a fabricated zero: no recorded shop in the window means
      // there is no savings figure to state — not "£0.00 saved".
      value: savings.actual?.trips > 0 ? (savings.savings?.honestTotal ?? savings.estimatedSavings ?? null) : null,
      unit: '£',
      detail: savings.savings?.assumption || savings.baselineAssumption || 'Offers and substitutions from recorded receipts',
      evidence: savings.baselineAssumption || 'From your receipt history',
      assumption: 'Receipt-backed only — never an estimated price',
    },
    wasteCost: {
      label: 'Food thrown away',
      value: savings.waste?.discardedCount > 0 ? (savings.waste?.windowValue ?? savings.estimatedWastedValue ?? null) : null,
      unit: '£',
      detail: 'Recorded purchase cost of what was binned in this window',
      evidence: savings.waste?.assumption || 'From your waste log',
      assumption: 'Cost at purchase, not an estimate',
    },
  };
}

/**
 * The plainest honest line for a metric — the one the summary shows before
 * any detail is opened. Returns null when the metric has no number, so the
 * caller can show silence rather than "0".
 *
 * @param {{ value: number|null, label: string, unit: string }} metric
 */
export function outcomeLine(metric) {
  if (!metric || metric.value == null) return null;
  const value = metric.unit === '£' ? `£${Number(metric.value).toFixed(2)}` : String(metric.value);
  return `${metric.label}: ${value}${metric.unit === '£' ? '' : ` ${metric.unit}`}`;
}
