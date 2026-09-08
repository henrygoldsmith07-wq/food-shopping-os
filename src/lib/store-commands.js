/**
 * Domain commands & events — one verb per household intent.
 *
 * Commands are the only sanctioned way for new Plan → Shop → Eat code to
 * write state: each command updates exactly one domain slice and appends one
 * event to the household ledger. UI calls `app.commands.planMeals(...)`
 * instead of reaching into five setters.
 *
 * Events mirror the ledger types in event-ledger.js and exist so evaluation
 * and recovery can subscribe without importing React or the store.
 */

import { createLedgerEvent } from './event-ledger.js';
import { LEDGER_MAX } from './event-ledger.js';

const withLedger = (state, event) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  return { ...state, householdLedger: [...ledger, event].slice(-LEDGER_MAX) };
};

export const DOMAIN_COMMANDS = [
  'planMeals',
  'cookPlannedMeal',
  'skipPlannedMeal',
  'purchaseIngredients',
  'wasteIngredients',
  'createLeftover',
  'correctPantry',
  'respondToRecommendation',
];

/**
 * Build slice-scoped commands over a `setState`-like `set(patch|fn)`.
 * `catalogue` is unused today; kept so recovery can inject substitutions
 * without changing the call signature.
 */
export const buildDomainCommands = (set) => ({
  planMeals: ({ date, slot, recipeId, actor = null } = {}) => set((s) => {
    const plan = { ...(s.plan || {}) };
    plan[date] = { ...(plan[date] || {}), [slot]: recipeId };
    return withLedger({ ...s, plan }, createLedgerEvent('MealPlanned', { date, slot, recipeId }, { actor }));
  }),
  cookPlannedMeal: ({ date, slot, recipeId, portions = null, actor = null } = {}) => set((s) => {
    const cooked = [...(s.cooked || []), { recipeId, date, portions }].filter((c) => c.recipeId);
    return withLedger({ ...s, cooked }, createLedgerEvent('MealCooked', { date, slot, recipeId, portions }, { actor }));
  }),
  skipPlannedMeal: ({ date, slot, recipeId = null, reason = null, actor = null } = {}) => set((s) => {
    const mealPlanEvents = [...(s.mealPlanEvents || []), {
      id: `m${Date.now().toString(36)}`, date, slot, plannedRecipeId: recipeId, status: 'skipped', reason, at: new Date().toISOString(),
    }].slice(-500);
    return withLedger({ ...s, mealPlanEvents }, createLedgerEvent('MealSkipped', { date, slot, recipeId, reason }, { actor }));
  }),
  purchaseIngredients: ({ items = [], store = null, total = null, actor = null } = {}) => set((s) => {
    const shops = [...(s.shops || []), {
      id: `s${Date.now().toString(36)}`, date: new Date().toISOString().slice(0, 10), store, total, items,
    }];
    return withLedger({ ...s, shops }, createLedgerEvent('IngredientPurchased', { items: items.map((i) => i.name || i), store, total }, { actor }));
  }),
  wasteIngredients: ({ name, reason = 'expired', cost = null, actor = null } = {}) => set((s) => {
    const waste = [...(s.waste || []), { name, reason, cost, date: new Date().toISOString().slice(0, 10) }];
    return withLedger({ ...s, waste }, createLedgerEvent('IngredientWasted', { name, reason, cost }, { actor }));
  }),
  createLeftover: ({ name, portions = 1, safeDays = 3, actor = null } = {}) => set((s) => {
    const leftovers = [...(s.leftovers || []), {
      id: `l${Date.now().toString(36)}`, name, portions, safeDays,
      createdAt: new Date().toISOString().slice(0, 10),
    }];
    return withLedger({ ...s, leftovers }, createLedgerEvent('LeftoverCreated', { name, portions }, { actor }));
  }),
  correctPantry: ({ corrections = [], actor = null } = {}) => set((s) => {
    const pantry = (s.pantry || []).map((p) => {
      const fix = corrections.find((c) => c.id === p.id);
      return fix ? { ...p, ...fix.patch } : p;
    });
    return withLedger({ ...s, pantry }, createLedgerEvent('PantryCorrected', { corrections: corrections.map((c) => c.id) }, { actor }));
  }),
  respondToRecommendation: ({ recommendationId, accepted, recipeId = null, actor = null } = {}) => set((s) => withLedger(
    { ...s },
    createLedgerEvent(accepted ? 'RecommendationAccepted' : 'RecommendationRejected', { recommendationId, recipeId }, { actor }),
  )),
});

export const DOMAIN_EVENTS = [
  'MealPlanned', 'MealCooked', 'MealSkipped', 'IngredientPurchased',
  'IngredientWasted', 'LeftoverCreated', 'PantryCorrected',
  'RecommendationAccepted', 'RecommendationRejected',
];
