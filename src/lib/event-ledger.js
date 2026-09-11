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
/** Detailed events kept in the live ledger; the rest compact to the archive. */
export const LEDGER_KEEP_RECENT = 400;
/** Archive batches kept on state — each names what it folded away. */
export const LEDGER_ARCHIVE_MAX = 24;
const TYPE_SET = new Set(LEDGER_EVENT_TYPES);
const ORIGIN_SET = new Set(LEDGER_ORIGINS);

export const isLedgerType = (type) => TYPE_SET.has(type);
export const isLedgerOrigin = (origin) => ORIGIN_SET.has(origin);

/**
 * The ONE canonical order for ledger events, used by replay, recovery
 * inference and evaluation alike: `at` ascending, events with no readable
 * stamp last (an unstamped event claiming to precede everything is exactly
 * the lie ordering must not tell), `id` as the tiebreak so the same set of
 * events folds identically no matter what order the array holds them in.
 */
export const compareLedgerEvents = (a, b) => {
  const atA = a?.at != null && String(a.at).trim() !== '' ? String(a.at) : null;
  const atB = b?.at != null && String(b.at).trim() !== '' ? String(b.at) : null;
  if (atA === null && atB !== null) return 1;
  if (atB === null && atA !== null) return -1;
  if (atA !== null && atB !== null && atA !== atB) return atA.localeCompare(atB);
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
};

export const sortLedgerEvents = (events = []) =>
  [...(Array.isArray(events) ? events : [])].sort(compareLedgerEvents);

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

/**
 * Fold a batch of evicted events into one honest archive summary: what
 * happened, in aggregate, with the window it covers — never the events
 * themselves, which are gone.
 */
const compactArchiveBatch = (events) => {
  const ordered = sortLedgerEvents(events);
  const counts = {};
  for (const e of ordered) counts[e.type] = (counts[e.type] || 0) + 1;
  return {
    id: `arch-${ordered[0]?.id ?? '0'}`,
    from: ordered[0]?.day || String(ordered[0]?.at || '').slice(0, 10) || null,
    to: ordered.at(-1)?.day || String(ordered.at(-1)?.at || '').slice(0, 10) || null,
    archivedAt: new Date().toISOString(),
    eventCount: ordered.length,
    counts,
  };
};

/**
 * Append (immutable) — the single write path for the ledger, so every
 * caller gets the same history guarantee:
 *
 *   1. The event joins the existing ledger. A patch object that happens to
 *      carry no ledger of its own can never erase one (that was a real bug:
 *      eating a leftover replaced five hundred events with one).
 *   2. When the ledger outgrows LEDGER_MAX, the OLDEST events compact into
 *      `state.ledgerArchive` — batch summaries with counts and the window
 *      they covered — and the LEDGER_KEEP_RECENT most recent stay detailed
 *      and replayable. Nothing is silently dropped: the archive names what
 *      it folded, and counts stay reconcilable.
 */
export const appendLedgerEvent = (state = {}, event) => {
  if (!event || !isLedgerType(event.type)) return state;
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const archive = Array.isArray(state.ledgerArchive) ? state.ledgerArchive : [];
  let nextLedger = [...ledger, event];
  let nextArchive = archive;
  if (nextLedger.length > LEDGER_MAX) {
    const evicted = nextLedger.slice(0, nextLedger.length - LEDGER_KEEP_RECENT);
    nextLedger = nextLedger.slice(nextLedger.length - LEDGER_KEEP_RECENT);
    nextArchive = [...archive, compactArchiveBatch(evicted)].slice(-LEDGER_ARCHIVE_MAX);
  }
  return { ...state, householdLedger: nextLedger, ledgerArchive: nextArchive };
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
  // Archived history keeps counting: compaction folds detail, not fact.
  const archive = Array.isArray(state.ledgerArchive) ? state.ledgerArchive : [];
  let archivedTotal = 0;
  for (const batch of archive) {
    archivedTotal += Number(batch?.eventCount) || 0;
    for (const [type, count] of Object.entries(batch?.counts || {})) {
      if (counts[type] !== undefined) counts[type] += count;
    }
  }
  return { ...counts, archivedTotal, total: all.length + archivedTotal };
};

/**
 * Replay the ledger: fold events (oldest first) into a projection of what
 * happened. The projection is the audit view — counts and last-touch stamps
 * per Plan → Shop → Eat stage, recomputed from events alone so evaluation,
 * recovery and the Household Model read one story.
 *
 * Ordering is `compareLedgerEvents` — the one canonical order every
 * ledger reader shares. Duplicate ids are replayed once — first occurrence
 * wins — and the projection reports `duplicates` so audits see what was
 * skipped rather than silently double-counting. Unknown event types never
 * enter the fold at all.
 */
export const replayLedger = (events = [], { archive = [] } = {}) => {
  const ordered = sortLedgerEvents(events).filter((e) => isLedgerType(e?.type));
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
  // The archive folds events away, not the fact that they happened: every
  // summary's counts roll up so a projection can speak for all of history.
  let archived = 0;
  const archivedCounts = {};
  for (const batch of Array.isArray(archive) ? archive : []) {
    archived += Number(batch?.eventCount) || 0;
    for (const [type, count] of Object.entries(batch?.counts || {})) {
      archivedCounts[type] = (archivedCounts[type] || 0) + count;
    }
  }
  if (archived > 0) {
    projection.archived = archived;
    projection.archivedCounts = archivedCounts;
    for (const [type, count] of Object.entries(archivedCounts)) {
      const key = ({
        MealPlanned: 'planned', MealCooked: 'cooked', MealSkipped: 'skipped',
        IngredientPurchased: 'purchased', IngredientWasted: 'wasted',
        LeftoverCreated: 'leftovers', PantryCorrected: 'pantryCorrections',
        RecommendationAccepted: 'recommendationsAccepted',
        RecommendationRejected: 'recommendationsRejected', WeekRecovered: 'weeksRecovered',
      })[type];
      if (key) projection[key] += count;
    }
    projection.total += archived;
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
