/**
 * Household event ledger — one append-only timeline for everything the
 * Week Recovery Engine, Meal Decision Engine and evaluation need to know.
 *
 * Event types (stable, PascalCase): MealPlanned, MealCooked, MealSkipped,
 * IngredientPurchased, IngredientWasted, LeftoverCreated, PantryCorrected,
 * RecommendationAccepted, RecommendationRejected, WeekRecovered.
 *
 * Every event carries provenance: `origin` says what caused it (user,
 * autopilot, recovery, sync, import) and `actor` who did it. Events are
 * replayable — `replayLedger` folds them back into a projection of what
 * happened, so evaluation and audits read one story, not two.
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
  'WeekRecovered',
];

/** Where an event came from — provenance for audits and replay. */
export const LEDGER_ORIGINS = ['user', 'autopilot', 'recovery', 'sync', 'import'];

export const LEDGER_MAX = 500;
const TYPE_SET = new Set(LEDGER_EVENT_TYPES);
const ORIGIN_SET = new Set(LEDGER_ORIGINS);

export const isLedgerType = (type) => TYPE_SET.has(type);
export const isLedgerOrigin = (origin) => ORIGIN_SET.has(origin);

export const createLedgerEvent = (type, payload = {}, { actor = null, at = null, id = null, origin = 'user' } = {}) => {
  if (!isLedgerType(type)) throw new Error(`Unknown ledger event type: ${type}`);
  if (!isLedgerOrigin(origin)) throw new Error(`Unknown ledger event origin: ${origin}`);
  const stamp = at || new Date().toISOString();
  return {
    id: id || (typeof uid === 'function' ? uid('e') : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    type,
    at: stamp,
    day: String(stamp).slice(0, 10),
    actor,
    origin,
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

export const ledgerEvents = (state = {}, { type = null, since = null, until = null, limit = null, origin = null } = {}) => {
  let rows = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  if (type) {
    const types = Array.isArray(type) ? type : [type];
    rows = rows.filter((e) => types.includes(e.type));
  }
  if (origin) {
    const origins = Array.isArray(origin) ? origin : [origin];
    rows = rows.filter((e) => origins.includes(e.origin || 'user'));
  }
  if (since) rows = rows.filter((e) => String(e.day || e.at || '') >= String(since));
  if (until) rows = rows.filter((e) => String(e.day || e.at || '') <= String(until));
  if (limit) rows = rows.slice(-limit);
  return rows;
};

export const ledgerCounts = (state = {}) => {
  const counts = Object.fromEntries(LEDGER_EVENT_TYPES.map((t) => [t, 0]));
  const all = ledgerEvents(state);
  for (const e of all) {
    if (counts[e.type] !== undefined) counts[e.type] += 1;
  }
  return { ...counts, total: all.length };
};

/**
 * Replay the ledger: fold events (oldest first) into a projection of what
 * happened. The projection is the audit view — counts and last-touch stamps
 * per Plan → Shop → Eat stage, recomputed from events alone so evaluation,
 * recovery and the Household Model read one story.
 *
 * Ordering is total and deterministic: `at` first, then `id` as the
 * tiebreak, so two events stamped in the same instant (or the same ledger
 * arriving in different array orders) always fold the same way. Duplicate
 * ids are replayed once — first occurrence wins — and the projection
 * reports `duplicates` so audits see what was skipped rather than silently
 * double-counting. Unknown event types never enter the fold at all, and an
 * event with no readable `at` sorts last, not first: an unstamped event
 * claiming to precede everything is exactly the lie replay must not tell.
 */
const eventStampOf = (e) => (e?.at != null && String(e.at).trim() !== '' ? String(e.at) : null);

export const replayLedger = (events = []) => {
  const ordered = [...(Array.isArray(events) ? events : [])]
    .filter((e) => isLedgerType(e?.type))
    .sort((a, b) => {
      const atA = eventStampOf(a);
      const atB = eventStampOf(b);
      if (atA === null && atB !== null) return 1;
      if (atB === null && atA !== null) return -1;
      if (atA !== null && atB !== null && atA !== atB) return atA.localeCompare(atB);
      // Same instant (or both unstamped): the id tiebreak keeps replay stable.
      return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    });
  const seen = new Set();
  const duplicates = [];
  const rows = [];
  for (const e of ordered) {
    if (e.id != null) {
      if (seen.has(e.id)) { duplicates.push(e.id); continue; }
      seen.add(e.id);
    }
    rows.push(e);
  }
  const projection = {
    total: rows.length,
    duplicates,
    planned: 0,
    cooked: 0,
    skipped: 0,
    purchased: 0,
    wasted: 0,
    leftovers: 0,
    pantryCorrections: 0,
    recommendationsAccepted: 0,
    recommendationsRejected: 0,
    weeksRecovered: 0,
    lastEvent: null,
    byDay: {},
  };
  for (const e of rows) {
    const day = String(e.day || String(e.at || '').slice(0, 10));
    projection.byDay[day] = projection.byDay[day] || { events: 0 };
    projection.byDay[day].events += 1;
    switch (e.type) {
      case 'MealPlanned': projection.planned += 1; break;
      case 'MealCooked': projection.cooked += 1; break;
      case 'MealSkipped': projection.skipped += 1; break;
      case 'IngredientPurchased': projection.purchased += 1; break;
      case 'IngredientWasted': projection.wasted += 1; break;
      case 'LeftoverCreated': projection.leftovers += 1; break;
      case 'PantryCorrected': projection.pantryCorrections += 1; break;
      case 'RecommendationAccepted': projection.recommendationsAccepted += 1; break;
      case 'RecommendationRejected': projection.recommendationsRejected += 1; break;
      case 'WeekRecovered': projection.weeksRecovered += 1; break;
      default: break;
    }
    projection.lastEvent = { id: e.id, type: e.type, at: e.at, origin: e.origin || 'user' };
  }
  return projection;
};

/**
 * Ledger integrity for audits: duplicate ids, unknown types, missing stamps
 * and missing provenance are all named, never silently tolerated.
 */
export const ledgerAudit = (state = {}) => {
  const rows = ledgerEvents(state);
  const seen = new Set();
  const problems = [];
  for (const e of rows) {
    if (!isLedgerType(e.type)) problems.push({ id: e.id, kind: 'unknown-type', detail: e.type });
    if (!e.id) problems.push({ kind: 'missing-id', detail: e.type });
    else if (seen.has(e.id)) problems.push({ id: e.id, kind: 'duplicate-id' });
    else seen.add(e.id);
    if (!e.at) problems.push({ id: e.id, kind: 'missing-at' });
    if (!isLedgerOrigin(e.origin || 'user')) problems.push({ id: e.id, kind: 'unknown-origin', detail: e.origin });
  }
  return { total: rows.length, uniqueIds: seen.size, ok: problems.length === 0, problems };
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
