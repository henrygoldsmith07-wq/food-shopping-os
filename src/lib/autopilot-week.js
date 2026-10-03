// @ts-check
/**
 * Autopilot Week — Forq prepares the household's week with as little input
 * as possible.
 *
 * This is the zero-config front door over the same machinery the plan
 * generator uses: `planGeneratorModel` + `planGeneratorInput` +
 * `buildGeneratedPlan` decide the meals, `weekPlanNeed`/`pantryCheckForPlan`
 * decide what the kitchen already covers, and `listRowsForGenerated` is the
 * one Plan → List derivation. Nothing here recomputes those answers — an
 * autopilot week and a hand-built week must agree row for row.
 *
 * Pure: same app view in, same proposal out. The UI reads the proposal and
 * applies its entries through the normal plan writes.
 */
import { buildPlan, pantryHits } from './planner.js';
import {
  entriesForGenerated,
  listRowsForGenerated,
  planGeneratorInput,
  planGeneratorModel,
} from './plan-generator-model.js';
import { planStats, planEntries, leftoverCoverageForPlan } from './mealplan.js';
import { pantryCheckForPlan, weekPlanNeed } from './week-loop.js';
import { householdPortionsFor } from './portions.js';
import { expiringSoon, weekDates } from './kitchen.js';
import { rescuedExpiringCount } from './loop-learning.js';

/**
 * The zero-config form the autopilot stands on. Everything the generator's
 * screen lets a person set is inferred here instead of asked: people come
 * from the learned portions, the budget from the household's own weekly
 * allowance, waste minimisation and leftover-first turn themselves on when
 * there is anything for them to work with.
 *
 * @param {any} app
 */
export const autopilotForm = (app = {}) => {
  const portions = householdPortionsFor(app);
  return {
    scope: 'A week',
    people: portions.portions,
    budget: 2.5,
    occasion: 'Everyday',
    quick: false,
    // Busy evenings get shorter meals; a busy week is a lower-time week.
    timeAvailable: (app.calendarBusy || []).length >= 2 ? 30 : null,
    batch: false,
    usePantry: true,
    availabilityOnly: false,
    seasonal: true,
    leftoverFirst: (app.leftovers || []).length > 0,
    variety: true,
    minimiseWaste: true,
  };
};

/**
 * How much of the plan's ingredient need the kitchen already covers — the
 * same pantry truth the list is built from, never a second count.
 */
const coverageOf = (app, plan, dates) => {
  const check = pantryCheckForPlan({ ...app, plan }, dates);
  return {
    totalIngredients: check.totalIngredients,
    coveredByPantry: check.coveredByPantry,
    leftoverMeals: check.leftoverMeals,
    toBuy: check.missing,
  };
};

/**
 * Ingredients the plan rescues before they go off — one shared derivation
 * with the outcome metrics (loop-learning.js), never a second count.
 */
const rescuedExpiring = (app, generated) =>
  rescuedExpiringCount(generated || [], app);

/**
 * A full week proposal: the meals, the numbers that make it inspectable, and
 * the entries ready to write through the normal plan path.
 *
 * @param {any} app
 * @param {{ seed?: number }} [options]
 */
export function autopilotWeekProposal(app = {}, { seed = 0 } = {}) {
  const form = autopilotForm(app);
  const weekDatesInScope = weekDates(app.day);
  const model = planGeneratorModel(app, {
    scope: 'A week',
    planDates: weekDatesInScope,
    monthDates: weekDatesInScope,
    weekDates: weekDatesInScope,
  });
  const { input } = planGeneratorInput(app, form, model, seed);
  // buildPlan answers with `{ meals, ... }` — same normalisation the generator
  // screen applies (`plan?.meals`).
  const generated = buildPlan(input, seed)?.meals || [];
  const entries = entriesForGenerated(generated, 'A week', model.planDates, app.day);

  const plan = {};
  for (const entry of entries) {
    if (!entry?.recipeId) continue;
    plan[entry.date] = { ...(plan[entry.date] || {}), [entry.slot]: entry.recipeId };
  }

  const stats = planStats(plan, model.planDates, { people: form.people });
  const coverage = coverageOf(app, plan, model.planDates);
  const rows = listRowsForGenerated(entries, app, form.people);
  const leftoverCovered = leftoverCoverageForPlan(plan, model.planDates, app.pantry || [], { people: form.people });

  const busyDates = model.planDates.filter((date) => model.busyDates.has(date));
  // Meals the kitchen already covers entirely — leftovers eating a dinner
  // slot is the cheapest week there is.
  const rescued = rescuedExpiring(app, generated);

  return {
    form,
    model,
    entries,
    plan,
    generated: generated || [],
    stats,
    coverage,
    // One composed need source (weekPlanNeed) for the item count the summary
    // quotes: the same rows the shopping list would receive.
    listRows: rows,
    itemCount: rows.length,
    // What the basket should cost at the generator's estimated per-serving
    // prices. Explicitly an estimate — the receipts say what it really was.
    estimatedCost: Math.round(rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0) * 100) / 100,
    plannedCost: stats.cost,
    rescuedExpiring: rescued,
    leftoverMeals: leftoverCovered.length,
    busyDaysChanged: busyDates.length,
    busyDates,
    portions: form.people,
  };
}

/**
 * The human summary lines behind "Your week is ready" — only the facts that
 * held, in the order a person reads them. Numbers come from the proposal
 * itself so the copy can never disagree with the plan it describes.
 *
 * @param {ReturnType<typeof autopilotWeekProposal>} proposal
 */
export function autopilotWeekSummary(proposal) {
  const lines = [];
  const meals = proposal.stats.meals;
  if (meals) lines.push(`${meals} dinner${meals === 1 ? '' : 's'} planned`);
  if (proposal.rescuedExpiring > 0) {
    lines.push(`${proposal.rescuedExpiring} ingredient${proposal.rescuedExpiring === 1 ? '' : 's'} rescued before expiry`);
  }
  if (proposal.leftoverMeals > 0) {
    lines.push(`${proposal.leftoverMeals} meal${proposal.leftoverMeals === 1 ? '' : 's'} covered by leftovers`);
  }
  lines.push(`about £${(proposal.plannedCost || 0).toFixed(0)} of food`);
  lines.push(`${proposal.itemCount} item${proposal.itemCount === 1 ? '' : 's'} to buy`);
  if (proposal.coverage.coveredByPantry > 0) {
    lines.push(`${proposal.coverage.coveredByPantry} ingredient${proposal.coverage.coveredByPantry === 1 ? '' : 's'} already in your kitchen`);
  }
  if (proposal.busyDaysChanged > 0) {
    lines.push(`${proposal.busyDaysChanged} meal${proposal.busyDaysChanged === 1 ? '' : 's'} moved around busy days`);
  }
  return lines;
}

/**
 * Swap one meal of a proposal in place, keeping every other meal exactly as
 * the household last saw it. Regenerating the whole week to change one dinner
 * is how autopilots lose trust.
 *
 * @param {any} app
 * @param {ReturnType<typeof autopilotWeekProposal>} proposal
 * @param {string} date
 * @param {{ seed?: number, exclude?: string[] }} [options]
 */
export function regenerateProposalMeal(app, proposal, date, { seed = 1, exclude = [] } = {}) {
  const blocked = new Set([...exclude, proposal.plan?.[date]?.dinner].filter(Boolean));
  const form = proposal.form;
  const model = proposal.model;
  const { input } = planGeneratorInput(app, form, model, seed);
  const generated = buildPlan({ ...input, dates: [date], days: 1 }, seed)?.meals || [];
  const replacement = generated.find((recipe) => recipe && !blocked.has(recipe.id))
    || generated.find((recipe) => recipe && recipe.id !== proposal.plan?.[date]?.dinner);
  if (!replacement) return null;

  const plan = { ...proposal.plan, [date]: { ...(proposal.plan?.[date] || {}), dinner: replacement.id } };
  const entries = Object.entries(plan).flatMap(([d, slots]) =>
    Object.entries(slots).map(([slot, recipeId]) => ({ date: d, slot, recipeId })));
  const stats = planStats(plan, proposal.model.planDates, { people: form.people });
  const rows = listRowsForGenerated(entries, app, form.people);
  return {
    ...proposal,
    plan,
    entries,
    stats,
    listRows: rows,
    itemCount: rows.length,
    plannedCost: stats.cost,
    coverage: coverageOf(app, plan, proposal.model.planDates),
  };
}
