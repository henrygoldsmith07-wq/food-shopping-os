// @ts-check
/**
 * The plan generator's derivation, lifted out of the screen.
 *
 * Components orchestrate; domain modules decide. `PlanGenerator.jsx` owns the
 * generator's form state and nothing else: which dates are in scope, the
 * budget window they rank against, the `buildPlan` input, the dated entries
 * the plan writes and the list hand-off all live here, so the generator, the
 * calendar and the simulator cannot drift into three different answers.
 *
 * Everything here is pure: same app view + same form in, same model out.
 */
import { buildPlan, pantryHits, scopeMeals, windowBudget } from './planner.js';
import { shoppingForGeneratedEntries } from './mealplan.js';
import { wasteAwareList } from './loop-learning.js';
import { monthOf } from '../data/seasons.js';
import { expiringSoon } from './kitchen.js';

/**
 * The dates and the budget window a scope ranks against, with calendar-busy
 * evenings left out of the plan but still reported back to the user.
 *
 * @param {any} app
 * @param {{ scope: string, planDates?: string[], monthDates: string[], weekDates: string[] }} form
 */
export function planGeneratorModel(app, form) {
  const { scope, monthDates, weekDates } = form;
  const month = monthOf(app.day);
  const dates = scope === 'A month' ? monthDates : weekDates;
  const busyDates = new Set((app.calendarBusy || []).map((item) => item.date));
  const busyInScope = dates.filter((date) => busyDates.has(date)).length;
  const planDates = (form.planDates || dates).filter((date) => !busyDates.has(date));
  const noOpenDates = ['A week', 'A month'].includes(scope) && planDates.length === 0;
  // Meals rank against this window's budget: the weekly allowance scaled to
  // the scope, minus what its shops already took. Days and single meals have
  // no window, so there is nothing to rank against.
  const windowDays = scope === 'A month' ? monthDates.length : scope === 'A week' ? weekDates.length : 0;
  const weeklyBudget = windowDays ? windowBudget(app.weeklyBudget, windowDays) : null;
  const budgetSpent = scope === 'A month' ? Number(app.spentThisMonth) || 0 : scope === 'A week' ? Number(app.spentThisWeek) || 0 : 0;
  // Each 7-meal chunk is held to the true weekly allowance, so spend can't
  // pool into one week of a month plan.
  const weekChunks = (scope === 'A month' && planDates.length > 7)
    ? Array.from({ length: Math.ceil(planDates.length / 7) }, (_, i) => Math.min(7, planDates.length - i * 7))
    : null;
  const weeklyCap = weekChunks ? Number(app.weeklyBudget) || 0 : null;
  return { month, dates, busyDates, busyInScope, planDates, noOpenDates, windowDays, weeklyBudget, budgetSpent, weekChunks, weeklyCap };
}

/**
 * BuildPlan input from the form + derived model — one place, tested.
 * @param {any} app
 * @param {object} form
 * @param {object} model
 * @param {number} seed
 */
export function planGeneratorInput(app, form, model, seed) {
  const pantryNames = app.pantry.map((p) => p.name);
  const focusList = (Array.isArray(form.focusItems) ? form.focusItems : form.focusItems ? [form.focusItems] : []).map((n) => String(n || '').trim()).filter(Boolean);
  const expiringNames = [...new Set([
    ...(app.useSoonIngredients?.length
      ? app.useSoonIngredients.map((row) => row.item.name)
      : expiringSoon(app.pantry, 3, app.day).map((p) => p.name)),
    ...focusList,
  ])];
  return {
    input: {
      scope: form.scope,
      diets: app.planDiets,
      goal: app.goal,
      budget: form.budget,
      maxTime: form.timeAvailable || (form.quick ? 30 : null),
      occasion: form.occasion,
      people: form.people,
      batch: form.batch,
      pantry: form.usePantry ? pantryNames : [],
      month: form.seasonal ? model.month : null,
      days: ['A week', 'A month'].includes(form.scope) ? model.planDates.length : null,
      recipes: app.safeRecipes,
      taste: app.tasteProfile,
      leftovers: form.leftoverFirst ? app.leftovers : [],
      equipment: (app.equipment || []).length ? app.equipment : null,
      pantryItems: app.pantry,
      availableOnly: form.availabilityOnly,
      expiry: form.usePantry ? expiringNames : [],
      focus: focusList,
      variety: form.variety,
      wasteOptimisation: form.minimiseWaste,
      multiObjective: true,
      wasteProfile: app.wasteProfile,
      dates: form.scope === 'A day' ? [app.day, app.day, app.day] : form.scope === '1 meal' ? [app.day] : model.planDates,
      today: app.day,
      learnedAliases: app.aliasMemory || {},
      weeklyBudget: model.weeklyBudget,
      budgetSpent: model.budgetSpent,
      weeklyCap: model.weeklyCap,
      weekChunks: model.weekChunks,
      skipProfile: app.skipReasonProfile,
    },
    seed,
    focusList,
    focusUnusable: focusList.length > 0 && !app.safeRecipes.some((r) => pantryHits(r, focusList) >= 1),
  };
}

/**
 * Generated entries for the plan scopes — the dated slots applyPlanEntries writes.
 * @param {Array<any>|null} generated
 * @param {string} scope
 * @param {Array<string>} planDates
 * @param {string} today
 */
export function entriesForGenerated(generated, scope, planDates, today) {
  if (!generated) return [];
  if (scope === 'A day') {
    return scopeMeals('A day').map((slot, i) => ({ date: today, slot, recipeId: generated[i]?.id }));
  }
  if (scope === '1 meal') return [{ date: today, slot: 'dinner', recipeId: generated[0]?.id }];
  return planDates.map((date, i) => ({ date, slot: 'dinner', recipeId: generated[i]?.id }));
}

/**
 * The generator's list hand-off: same authoritative path as every other
 * Plan → List derivation (scaled entries → waste learning).
 * @param {Array<any>} entries
 * @param {any} app
 * @param {number} people
 */
export function listRowsForGenerated(entries, app, people) {
  const scaled = shoppingForGeneratedEntries(entries, {
    pantry: app.pantry,
    people,
    today: app.day,
    learnedAliases: app.aliasMemory || {},
  });
  return wasteAwareList(scaled, {
    waste: app.waste, cooked: app.cooked, today: app.day, learnedAliases: app.aliasMemory || {},
  });
}

/** Deterministic buildPlan wrapper (seed + input) for tests. */
export const buildGeneratedPlan = (input, seed) => buildPlan(input, seed);
