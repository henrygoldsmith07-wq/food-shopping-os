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

import { createLedgerEvent, appendLedgerEvent } from './event-ledger.js';

/**
 * One event onto the household's history via the shared append path, so
 * commands get the same compaction guarantee as every other writer.
 */
const withLedger = (state, event) => appendLedgerEvent(state, event);

export const DOMAIN_COMMANDS = [
  'planMeals',
  'cookPlannedMeal',
  'skipPlannedMeal',
  'purchaseIngredients',
  'wasteIngredients',
  'createLeftover',
  'correctPantry',
  'respondToRecommendation',
  'applyWeekRecovery',
  'reflectSkipReason',
];

/** Fold one skip reflection, exactly as the legacy SRS writer did. */
export const foldSkipReflection = (profile = {}, reasonId, stillApplies, at = Date.now()) => {
  const reason = String(reasonId || '').trim();
  if (!reason) return profile;
  const prev = profile[reason] || { applies: 0, changed: 0, lastAt: 0, lastStillApplies: null };
  return {
    ...profile,
    [reason]: {
      applies: prev.applies + (stillApplies ? 1 : 0),
      changed: prev.changed + (stillApplies ? 0 : 1),
      lastStillApplies: Boolean(stillApplies),
      lastAt: at,
    },
  };
};

/**
 * Apply one Week Recovery Engine result as a single undoable command.
 * `result` is the preview object from recoverWeek(); the patch, list changes
 * and leftover allocations all land in one write with one WeekRecovered
 * ledger event carrying the full repair summary — replayable end to end.
 */
export const applyWeekRecoveryTo = (state, result) => {
  if (!result || typeof result !== 'object') return state;
  let next = { ...state };
  const changed = [];

  // 1. Plan patch: date → { slot → recipeId | null }.
  for (const [date, slots] of Object.entries(result.planPatch || {})) {
    const day = { ...(next.plan?.[date] || {}) };
    for (const [slot, recipeId] of Object.entries(slots || {})) {
      if (recipeId) day[slot] = recipeId;
      else delete day[slot];
    }
    const plan = { ...(next.plan || {}) };
    if (Object.keys(day).length) plan[date] = day;
    else delete plan[date];
    next = { ...next, plan };
    changed.push(`plan ${date}`);
  }

  // 2. Shopping removes first, then adds — a row the repairs retire leaves
  //    the list before anything is added, so adds dedupe against survivors.
  const removeIds = new Set((result.shoppingRemove || []).map((r) => r.id));
  if (removeIds.size) {
    next = { ...next, shoppingList: (next.shoppingList || []).filter((i) => !removeIds.has(i.id)) };
    changed.push(`removed ${removeIds.size} list row${removeIds.size === 1 ? '' : 's'}`);
  }
  if (result.shoppingAdd?.length) {
    const have = new Set((next.shoppingList || []).map((i) => String(i.name || '').trim().toLowerCase()));
    const fresh = result.shoppingAdd
      .filter((r) => r.name && !have.has(String(r.name).trim().toLowerCase()))
      .map((r) => ({
        id: r.id || `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        name: r.name,
        checked: false,
        price: Number(r.price) || 0,
        qty: r.qty || 1,
        note: r.reason || '',
        priority: r.priority || 'normal',
      }));
    if (fresh.length) {
      next = { ...next, shoppingList: [...(next.shoppingList || []), ...fresh] };
      changed.push(`added ${fresh.length} list item${fresh.length === 1 ? '' : 's'}`);
    }
  }

  // 3. Leftover allocation: earmark the portion for its suggested slot. Both
  //    homes of a saved portion are covered — pantry rows (the cook flow) and
  //    the first-class leftovers slice (the domain command).
  const byLeftoverId = new Map((result.leftoverReuse || []).filter((r) => r.leftoverId).map((r) => [r.leftoverId, r]));
  if (byLeftoverId.size) {
    next = { ...next, pantry: (next.pantry || []).map((p) => {
      const reuse = byLeftoverId.get(p.id);
      if (!reuse) return p;
      const allocations = [...(p.plannedMealAllocations || []), { date: reuse.date, slot: reuse.slot, from: 'week-recovery' }];
      return { ...p, plannedMealAllocations: allocations.slice(-8) };
    }) };
    next = { ...next, leftovers: (next.leftovers || []).map((l) => {
      const reuse = byLeftoverId.get(l.id);
      return reuse ? { ...l, allocatedTo: { date: reuse.date, slot: reuse.slot, from: 'week-recovery' } } : l;
    }) };
    changed.push('allocated leftovers');
  }

  if (!changed.length) return next;

  return withLedger(next, createLedgerEvent('WeekRecovered', {
    trigger: result.trigger || null,
    repairs: (result.repairs || []).map((r) => ({ kind: r.kind, date: r.date || null, slot: r.slot || null })),
    planDates: Object.keys(result.planPatch || {}),
    addedToList: (result.shoppingAdd || []).map((r) => r.name),
    removedFromList: (result.shoppingRemove || []).map((r) => r.name),
    leftoverReuses: (result.leftoverReuse || []).length,
    budgetNote: result.budgetNote || null,
    changed,
  }, { origin: 'recovery' }));
};

/**
 * Build slice-scoped commands over a `setState`-like `set(patch|fn)`.
 * `catalogue` is unused today; kept so recovery can inject substitutions
 * without changing the call signature.
 */
export const buildDomainCommands = (set) => ({
  planMeals: ({ date, slot, recipeId, actor = null, origin = 'user' } = {}) => set((s) => {
    const plan = { ...(s.plan || {}) };
    plan[date] = { ...(plan[date] || {}), [slot]: recipeId };
    return withLedger({ ...s, plan }, createLedgerEvent('MealPlanned', { date, slot, recipeId }, { actor, origin }));
  }),
  cookPlannedMeal: ({ date, slot, recipeId, portions = null, actor = null, origin = 'user' } = {}) => set((s) => {
    const cooked = [...(s.cooked || []), { recipeId, date, portions }].filter((c) => c.recipeId);
    return withLedger({ ...s, cooked }, createLedgerEvent('MealCooked', { date, slot, recipeId, portions }, { actor, origin }));
  }),
  skipPlannedMeal: ({ date, slot, recipeId = null, reason = null, actor = null, origin = 'user' } = {}) => set((s) => {
    const mealPlanEvents = [...(s.mealPlanEvents || []), {
      id: `m${Date.now().toString(36)}`, date, slot, plannedRecipeId: recipeId, status: 'skipped', reason, at: new Date().toISOString(),
    }].slice(-500);
    return withLedger({ ...s, mealPlanEvents }, createLedgerEvent('MealSkipped', { date, slot, recipeId, reason }, { actor, origin }));
  }),
  purchaseIngredients: ({ items = [], store = null, total = null, actor = null, origin = 'user' } = {}) => set((s) => {
    const shops = [...(s.shops || []), {
      id: `s${Date.now().toString(36)}`, date: new Date().toISOString().slice(0, 10), store, total, items,
    }];
    return withLedger({ ...s, shops }, createLedgerEvent('IngredientPurchased', { items: items.map((i) => i.name || i), store, total }, { actor, origin }));
  }),
  wasteIngredients: ({ name, reason = 'expired', cost = null, actor = null, origin = 'user' } = {}) => set((s) => {
    const waste = [...(s.waste || []), { name, reason, cost, date: new Date().toISOString().slice(0, 10) }];
    return withLedger({ ...s, waste }, createLedgerEvent('IngredientWasted', { name, reason, cost }, { actor, origin }));
  }),
  createLeftover: ({ name, portions = 1, safeDays = 3, actor = null, origin = 'user' } = {}) => set((s) => {
    const leftovers = [...(s.leftovers || []), {
      id: `l${Date.now().toString(36)}`, name, portions, safeDays,
      createdAt: new Date().toISOString().slice(0, 10),
    }];
    return withLedger({ ...s, leftovers }, createLedgerEvent('LeftoverCreated', { name, portions }, { actor, origin }));
  }),
  correctPantry: ({ corrections = [], actor = null, origin = 'user' } = {}) => set((s) => {
    const pantry = (s.pantry || []).map((p) => {
      const fix = corrections.find((c) => c.id === p.id);
      return fix ? { ...p, ...fix.patch } : p;
    });
    return withLedger({ ...s, pantry }, createLedgerEvent('PantryCorrected', { corrections: corrections.map((c) => c.id) }, { actor, origin }));
  }),
  respondToRecommendation: ({ recommendationId, accepted, recipeId = null, actor = null, origin = 'user', context = null } = {}) => set((s) => withLedger(
    { ...s },
    createLedgerEvent(accepted ? 'RecommendationAccepted' : 'RecommendationRejected', { recommendationId, recipeId, context }, { actor, origin }),
  )),
  applyWeekRecovery: (result) => set((s) => applyWeekRecoveryTo(s, result)),
  reflectSkipReason: ({ reasonId, stillApplies } = {}) => set((s) => {
    const reason = String(reasonId || '').trim();
    if (!reason) return s;
    return { ...s, skipReasonProfile: foldSkipReflection(s.skipReasonProfile, reason, Boolean(stillApplies)) };
  }),
});

export const DOMAIN_EVENTS = [
  'MealPlanned', 'MealCooked', 'MealSkipped', 'IngredientPurchased',
  'IngredientWasted', 'LeftoverCreated', 'PantryCorrected',
  'RecommendationAccepted', 'RecommendationRejected', 'WeekRecovered',
];
