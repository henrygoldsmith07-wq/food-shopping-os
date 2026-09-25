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
import { buildShopRecord, listSnapshotSync } from './shopping-predictions.js';
import { allRecipes } from '../data/recipes.js';
import { leftoverEntry } from './mealplan.js';
import { createLeftover as createLeftoverRecord } from './leftover-planning.js';
import { addDays } from './kitchen-dates.js';

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
  'resolveMealOutcome',
  'undoAdaptation',
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
    // Rows the repairs retire leave WITH their live snapshots (list ↔
    // snapshot consistency) — frozen copies on shop records are untouched.
    const synced = listSnapshotSync(next.shoppingList, next.shoppingPredictions);
    next = { ...next, shoppingPredictions: synced.shoppingPredictions };
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
    // Provenance is explicit: the household did this, Forq did not guess it.
    return withLedger({ ...s, cooked }, createLedgerEvent('MealCooked', { date, slot, recipeId, portions, source: 'user-confirmed' }, { actor, origin }));
  }),
  skipPlannedMeal: ({ date, slot, recipeId = null, reason = null, actor = null, origin = 'user' } = {}) => set((s) => {
    const mealPlanEvents = [...(s.mealPlanEvents || []), {
      id: `m${Date.now().toString(36)}`, date, slot, plannedRecipeId: recipeId, status: 'skipped', reason, source: 'user-confirmed', at: new Date().toISOString(),
    }].slice(-500);
    return withLedger({ ...s, mealPlanEvents }, createLedgerEvent('MealSkipped', { date, slot, recipeId, reason, source: 'user-confirmed' }, { actor, origin }));
  }),
  purchaseIngredients: ({ items = [], store = null, total = null, id = null, actor = null, origin = 'user' } = {}) => set((s) => {
    // One shared purchase-recording shape (see shopping-predictions.js): the
    // same frozen basket prediction and row snapshots as recordShop, so no
    // sanctioned path can write a shop evaluation cannot read. The FULL
    // recordShop lifecycle rides along: build through the one helper, freeze
    // per-row predictions and the basket cost, append the purchase event, and
    // consume the bought rows' snapshots from the live book (they now live on
    // the shop record, exactly as the checked-rows path leaves them).
    const normalised = (Array.isArray(items) ? items : []).map((item) => (item && typeof item === 'object'
      ? { ...item }
      : { id: null, name: String(item || ''), qty: null, price: 0 }));
    if (!normalised.length) return {};
    const shopId = id || `s${Date.now().toString(36)}`;
    // Idempotent replay: a shop id already recorded IS the same purchase —
    // appending it again would let evaluation count one till run twice.
    if ((s.shops || []).some((h) => h?.id === shopId)) return {};
    // No `predictedCost`: the spend prediction is the pre-till freeze
    // matched from basketPredictions (see shop-record.js) — copied verbatim;
    // with no row ids and no honest day-match, `predicted` stays null and
    // spend accuracy excludes the shop instead of reconstructing.
    const shop = buildShopRecord({
      state: s,
      items: normalised,
      store,
      total,
      id: shopId,
      day: s.day,
    });
    return {
      ...withLedger({ ...s, shops: [...(s.shops || []), shop] }, createLedgerEvent('IngredientPurchased', { shopId: shop.id, items: normalised.map((i) => i.name), store, total }, { actor, origin })),
      // The bought rows' snapshots now live on the shop record — the book
      // only describes rows currently on show (same consume as recordShop).
      shoppingPredictions: (s.shoppingPredictions || []).filter((p) => !normalised.some((i) => i.id != null && i.id === p.id)),
    };
  }),
  wasteIngredients: ({ name, reason = 'expired', cost = null, actor = null, origin = 'user' } = {}) => set((s) => {
    const waste = [...(s.waste || []), { name, reason, cost, date: new Date().toISOString().slice(0, 10) }];
    return withLedger({ ...s, waste }, createLedgerEvent('IngredientWasted', { name, reason, cost }, { actor, origin }));
  }),
  createLeftover: ({ name, recipeId = null, portions = 1, safeDays = 3, actor = null, origin = 'user' } = {}) => set((s) => {
    const count = Math.max(0, Math.round(Number(portions) || 0));
    if (!count || (!name && !recipeId)) return {};
    const day = String(s.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const targetName = String(name || '').trim().toLowerCase();
    const recipe = allRecipes().find((row) => recipeId && row.id === recipeId)
      || allRecipes().find((row) => targetName && String(row.name || '').trim().toLowerCase() === targetName)
      || { id: recipeId || null, name: name || 'Leftovers', emoji: '🍽️' };
    const lifecycle = createLeftoverRecord({
      recipe,
      cookedPortions: count,
      eatenPortions: 0,
      date: day,
      safeDays,
    });
    const pantryBase = leftoverEntry(recipe, count, day);
    const pantryRow = {
      id: `p-${lifecycle.id}`,
      low: false,
      ...pantryBase,
      expiry: addDays(day, Math.max(1, Math.round(Number(safeDays) || 3))),
    };
    const samePantryLeftover = (row) => row?.cat === 'Leftovers' && row?.addedAt === day
      && (recipe.id ? row.recipeId === recipe.id : String(row.name || '').toLowerCase() === String(pantryRow.name || '').toLowerCase());
    const pantry = [...(s.pantry || []).filter((row) => !samePantryLeftover(row)), pantryRow];
    const leftovers = [...(s.leftovers || []).filter((row) => row.id !== lifecycle.id), lifecycle].slice(-200);
    return withLedger(
      { ...s, pantry, leftovers },
      createLedgerEvent('LeftoverCreated', {
        name: recipe.name,
        recipeId: recipe.id || null,
        portions: count,
        safeUntil: lifecycle.safeUntil,
      }, { actor, origin }),
    );
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
  // Loop closure: one tap resolves a planned meal the week left open. Both
  // branches ride the existing writers, so the ledger, the undo stack and
  // the learning see exactly what a manual log would have. When the
  // rollover had stamped the slot as silently missed, the household's
  // answer corrects that record — the newest event per slot wins, so the
  // correction reads cleanly in plan-outcome and the waste log.
  resolveMealOutcome: ({ date, slot, recipeId, cooked = true, reason = null, actor = null, origin = 'user' } = {}) => set((s) => {
    if (!date || !slot) return {};
    if (cooked) {
      const mealPlanEvents = [...(s.mealPlanEvents || []), {
        id: `m${Date.now().toString(36)}`, date, slot, plannedRecipeId: recipeId || null, actualRecipeId: recipeId || null, status: 'cooked', source: 'user-confirmed', at: Date.now(),
      }].slice(-500);
      const cookedRows = recipeId ? [...(s.cooked || []), { recipeId, date, portions: null }] : (s.cooked || []);
      const next = { ...s, mealPlanEvents, cooked: cookedRows };
      // The household answered the one-tap question — user-confirmed, never
      // inferred. Forq did not guess this outcome; it asked.
      return recipeId
        ? withLedger(next, createLedgerEvent('MealCooked', { date, slot, recipeId, portions: null, source: 'user-confirmed' }, { actor, origin }))
        : next;
    }
    const mealPlanEvents = [...(s.mealPlanEvents || []), {
      id: `m${Date.now().toString(36)}`, date, slot, plannedRecipeId: recipeId || null, status: 'skipped', reason: reason || 'not-cooked', source: 'user-confirmed', at: Date.now(),
    }].slice(-500);
    return withLedger({ ...s, mealPlanEvents }, createLedgerEvent('MealSkipped', { date, slot, recipeId, reason: reason || 'not-cooked', source: 'user-confirmed' }, { actor, origin }));
  }),
  // Taking back an adaptation: the quantity goes back, the household's
  // choice lands in the ledger as a rejection carrying the adaptation key,
  // and an explicit suppression stamp records the day — so regenerating the
  // list never re-applies a change the household undid (see
  // adaptation-suppression.js). Repeated reversals reach the suppression
  // threshold, and the change stops being applied until its window ages
  // out or new evidence earns it back.
  undoAdaptation: (adaptation) => set((s) => {
    if (!adaptation?.undo) return {};
    const { undo } = adaptation;
    const stampSuppression = (next, key, eventId = null) => {
      const day = String(next.day || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const existing = next.adaptationSuppression?.[key];
      // One rejection is one event: its ledger id rides the stamp, so the
      // ledger copy and the stamp copy can never be counted as two. Legacy
      // stamps (days only) keep working through the day-coverage fallback.
      const events = [...(Array.isArray(existing?.events) ? existing.events : []), ...(eventId ? [{ id: String(eventId), day }] : [])]
        .filter((e, i, all) => e && e.day && all.findIndex((x) => x.id === e.id) === i)
        .slice(-10);
      const rejections = [...new Set([
        ...(Array.isArray(existing?.rejections) ? existing.rejections : []),
        ...events.map((e) => e.day),
      ])].filter(Boolean).sort().slice(-10);
      return { ...next, adaptationSuppression: { ...(next.adaptationSuppression || {}), [key]: { events, rejections, lastRejectedAt: day } } };
    };
    if (undo.kind === 'waste-qty') {
      const shoppingList = (s.shoppingList || []).map((item) => (item.id === undo.itemId
        ? { ...item, qty: undo.fromQty, autoReduction: null, wasteNote: null, lastAutoQty: null }
        : item));
      const event = createLedgerEvent('RecommendationRejected', {
        recommendationId: `adaptation:${undo.key}`,
        context: { kind: 'adaptation', key: undo.key, undo: 'waste-qty' },
      }, { origin: 'user' });
      return withLedger(
        stampSuppression({ ...s, shoppingList }, undo.key, event.id),
        event,
      );
    }
    if (undo.kind === 'portions') {
      const event = createLedgerEvent('RecommendationRejected', {
        recommendationId: 'adaptation:portions',
        context: { kind: 'adaptation', key: 'portions', undo: 'portions' },
      }, { origin: 'user' });
      return withLedger(
        stampSuppression({ ...s, portionsOverride: undo.override }, 'portions', event.id),
        event,
      );
    }
    return {};
  }),
});

export const DOMAIN_EVENTS = [
  'MealPlanned', 'MealCooked', 'MealSkipped', 'IngredientPurchased',
  'IngredientWasted', 'LeftoverCreated', 'PantryCorrected',
  'RecommendationAccepted', 'RecommendationRejected', 'WeekRecovered',
];
