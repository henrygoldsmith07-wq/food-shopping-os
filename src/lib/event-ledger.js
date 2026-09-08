/**
 * Household event ledger — one append-only timeline for everything the
 * Week Recovery Engine, Meal Decision Engine and evaluation need to know.
 *
 * Event types (stable, lowercase-hyphen not needed — PascalCase matches the
 * spec): MealPlanned, MealCooked, MealSkipped, IngredientPurchased,
 * IngredientWasted, LeftoverCreated, PantryCorrected,
 * RecommendationAccepted, RecommendationRejected.
 *
 * Pure + offline. Stored at `state.householdLedger` (capped). Legacy arrays
 * (mealPlanEvents, pantryEvents, preferenceEvents …) are left untouched for
 * backwards compatibility; new code should read the ledger first.
 */

import { dayStamp } from './kitchen-dates.js';
import { uid } from './state.js';

export const LEDGER_EVENT_TYPES = [
  'MealPlanned',
  'MealCooked',
  'MealSkipped',
  'IngredientPurchased',
  'IngredientWasted',
  'LeftoverCreated',
  'PantryCorrected',
  'RecommendationAccepted',
  'RecommendationRejected',
];

export const LEDGER_MAX = 500;
const TYPE_SET = new Set(LEDGER_EVENT_TYPES);

export const isLedgerType = (type) => TYPE_SET.has(type);

export const createLedgerEvent = (type, payload = {}, { actor = null, at = null, id = null } = {}) => {
  if (!isLedgerType(type)) throw new Error(`Unknown ledger event type: ${type}`);
  const stamp = at || new Date().toISOString();
  return {
    id: id || (typeof uid === 'function' ? uid('e') : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    type,
    at: stamp,
    day: String(stamp).slice(0, 10),
    actor,
    ...payload,
  };
};

/** Append (immutable). Caps at LEDGER_MAX, oldest first out. */
export const appendLedgerEvent = (state = {}, event) => {
  if (!event || !isLedgerType(event.type)) return state;
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const next = [...ledger, event].slice(-LEDGER_MAX);
  return { ...state, householdLedger: next };
};

export const ledgerEvents = (state = {}, { type = null, since = null, until = null, limit = null } = {}) => {
  let rows = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  if (type) {
    const types = Array.isArray(type) ? type : [type];
    rows = rows.filter((e) => types.includes(e.type));
  }
  if (since) rows = rows.filter((e) => String(e.day || e.at || '') >= String(since));
  if (until) rows = rows.filter((e) => String(e.day || e.at || '') <= String(until));
  if (limit) rows = rows.slice(-limit);
  return rows;
};

export const ledgerCounts = (state = {}) => {
  const counts = Object.fromEntries(LEDGER_EVENT_TYPES.map((t) => [t, 0]));
  for (const e of ledgerEvents(state)) {
    if (counts[e.type] !== undefined) counts[e.type] += 1;
  }
  return { ...counts, total: ledgerEvents(state).length };
};

/** Acceptance rate for recommendations — the eval input. */
export const recommendationAcceptance = (state = {}) => {
  const accepted = ledgerEvents(state, { type: 'RecommendationAccepted' }).length;
  const rejected = ledgerEvents(state, { type: 'RecommendationRejected' }).length;
  const total = accepted + rejected;
  return {
    accepted, rejected, total,
    rate: total ? Math.round((accepted / total) * 100) / 100 : null,
    confidence: total >= 8 ? 'high' : total >= 3 ? 'medium' : total > 0 ? 'low' : 'none',
  };
};

/** Store command helper: append + keep legacy arrays in sync where cheap. */
export const ledgerCommands = (set) => ({
  logLedgerEvent: (type, payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent(type, payload, meta))),
  logMealPlanned: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('MealPlanned', payload, meta))),
  logMealCooked: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('MealCooked', payload, meta))),
  logMealSkipped: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('MealSkipped', payload, meta))),
  logIngredientPurchased: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('IngredientPurchased', payload, meta))),
  logIngredientWasted: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('IngredientWasted', payload, meta))),
  logLeftoverCreated: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('LeftoverCreated', payload, meta))),
  logPantryCorrected: (payload, meta) => set((s) => appendLedgerEvent(s, createLedgerEvent('PantryCorrected', payload, meta))),
  logRecommendation: (accepted, payload, meta) => set((s) => appendLedgerEvent(
    s, createLedgerEvent(accepted ? 'RecommendationAccepted' : 'RecommendationRejected', payload, meta),
  )),
});

export const ledgerToday = () => dayStamp();
