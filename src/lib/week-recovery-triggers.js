/**
 * Week Recovery triggers — reading the household ledger for everything that
 * needs repairing.
 *
 * The engine (week-recovery.js) repairs; this module listens. Split out so
 * each stays readable and testable: this is the "what happened" half, that
 * is the "what to do about it" half.
 *
 * A trigger is any Plan → Shop → Eat event the week has not absorbed yet.
 * Everything since the last completed recovery counts — not just the newest
 * event — because a skipped lunch, a wasted bag of spinach and a pantry
 * correction in the same week each name a different problem.
 */

import { sortLedgerEvents } from './event-ledger.js';

const norm = (s) => String(s || '').trim().toLowerCase();

const ingredientsOf = (recipe) => (recipe?.ingredients || []).map((i) => norm(i.name || i));/**
 * Infer the newest unresolved Plan → Shop → Eat event that needs recovery.
 * Back-compatible single-trigger view over `inferWeekRecoveryTriggers`.
 */
export const inferWeekRecoveryTrigger = (state = {}, recipeBook = []) =>
  inferWeekRecoveryTriggers(state, recipeBook).at(-1) || null;

/**
 * Every unresolved trigger since the last completed recovery — not just the
 * newest one. A skipped lunch, a wasted bag of spinach and a pantry
 * correction that all happened since Sunday each name a different problem
 * in the same week; folding only the newest silently bypasses the rest.
 * Oldest first, deterministic; the last WeekRecovered (by replay order)
 * answers everything before it.
 */
export const inferWeekRecoveryTriggers = (state = {}, recipeBook = []) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const recipesById = Object.fromEntries((recipeBook || []).filter((r) => r?.id).map((r) => [r.id, r]));
  const pantryById = new Map((Array.isArray(state.pantry) ? state.pantry : []).filter((p) => p?.id).map((p) => [p.id, p]));
  // The one canonical ledger order (see event-ledger.js) — array position
  // is not chronology, and recovery must read the same story replay reads.
  const rows = sortLedgerEvents(ledger);
  const recoveryIndex = rows.map((e) => e?.type).lastIndexOf('WeekRecovered');
  const unresolved = recoveryIndex >= 0 ? rows.slice(recoveryIndex + 1) : rows;

  const triggers = [];
  for (const event of unresolved) {
    if (event?.type === 'MealSkipped') {
      triggers.push({
        kind: 'MealSkipped',
        date: event.date,
        slot: event.slot || 'dinner',
        recipeId: event.recipeId || event.plannedRecipeId,
        at: event.at, id: event.id,
      });
    } else if (event?.type === 'IngredientWasted') {
      triggers.push({ kind: 'IngredientWasted', ingredient: event.ingredient || event.name, at: event.at, id: event.id });
    } else if (event?.type === 'PantryCorrected') {
      const corrections = Array.isArray(event.corrections) ? event.corrections : [];
      const names = corrections
        .map((c) => c?.name || c?.itemName || pantryById.get(c?.id)?.name)
        .filter(Boolean);
      triggers.push({ kind: 'PantryCorrected', name: names[0] || event.name || event.ingredient, corrections, at: event.at, id: event.id });
    } else if (event?.type === 'LeftoverCreated') {
      triggers.push({ kind: 'LeftoverCreated', name: event.name, at: event.at, id: event.id });
    } else if (event?.type === 'IngredientPurchased' && (event.unplanned || event.offPlan || event.triggerKind === 'UnplannedShop')) {
      triggers.push({ kind: 'UnplannedShop', items: event.items || [], at: event.at, id: event.id });
    } else if (event?.type === 'MealCooked' && event.substituted && event.plannedRecipeId) {
      const actualRecipe = recipesById[event.recipeId] || recipesById[event.actualRecipeId] || null;
      triggers.push({
        kind: 'MealCooked',
        substituted: true,
        plannedRecipeId: event.plannedRecipeId,
        substitutionIngredients: event.substitutionIngredients || ingredientsOf(actualRecipe),
        at: event.at, id: event.id,
      });
    }
  }

  if (triggers.length) return triggers;

  // Restored backups and older installs may not have a ledger yet.
  if (!ledger.length) {
    const legacy = [];
    const skipped = [...(Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [])]
      .reverse().find((e) => e?.status === 'skipped' && (!state.day || !e.date || e.date >= state.day));
    if (skipped) legacy.push({ kind: 'MealSkipped', date: skipped.date, slot: skipped.slot || 'dinner', recipeId: skipped.plannedRecipeId });
    const wasted = [...(Array.isArray(state.waste) ? state.waste : [])].reverse()[0];
    if (wasted?.name) legacy.push({ kind: 'IngredientWasted', ingredient: wasted.name });
    const leftover = [...(Array.isArray(state.leftovers) ? state.leftovers : [])]
      .reverse().find((l) => l?.createdAt === state.day);
    if (leftover?.name) legacy.push({ kind: 'LeftoverCreated', name: leftover.name });
    return legacy;
  }
  return [];
};
