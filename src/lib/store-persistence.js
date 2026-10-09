import { DEFAULT_TARGETS } from '../data/nutrients.js';
import {
  ACCENT_IDS, EMPTY_STATE, rolloverDay, STATE_VERSION, STORAGE_KEY,
} from './state.js';
import { normalisePriceAlertConfig } from './price-alerts.js';
import { HEALTH_VAULT_KEY, withoutHealth } from './health-vault.js';
import { permissionsForRole } from './household.js';
import { predictionCorrectionEvent } from './prediction-feedback.js';
import { overrideSchemaStatus, basketSchemaStatus } from './prediction-evidence.js';
import { captureMissedMeals } from './missed-meals.js';
import { PRICE_SOURCES } from './price-provenance.js';

/**
 * Repairs for one saved install, keyed by state key.
 *
 * Hydration is the boundary between bytes somebody left behind and the object
 * the product reasons about, so it is where a malformed *nested* value has to
 * be stopped. The rule is deliberately conservative and per key, not one giant
 * schema: a bad list row is dropped, a bad price becomes unknown, a bad plan
 * entry is skipped. Anything that cannot be repaired is removed rather than
 * guessed at, because a plausible-looking invention is worse than a hole.
 *
 * Two constraints keep this honest:
 *
 *  - **Nothing is invented.** A repair only ever *removes* a value that cannot
 *    be true, or replaces it with the explicitly-unknown one. No field is added
 *    to a row that didn't have it, so a save/load round trip returns the same
 *    rows it started with — an install that has been opened twice is
 *    byte-identical to one opened once.
 *  - **A row is identified by its id.** Every row the app writes has one, and
 *    a row without one cannot be edited, ticked or removed by a screen. Such a
 *    row is dropped rather than given a made-up id.
 *
 * The array/object shape is already handled by the EMPTY_STATE pass below; this
 * covers the cases a shape check can't see — rows that are the wrong type, or
 * fields inside a row that hold the wrong type.
 */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Rows a screen can actually act on: an object with an id and a name. */
const rowsWithIdAndName = (value) => (Array.isArray(value) ? value : [])
  .filter((row) => isObject(row) && row.id && typeof row.name === 'string' && row.name);

/** Recorded rows that predate the id rule: keep anything object-shaped. */
const rowsWithLegacyId = (value, { nameKey = null } = {}) => (Array.isArray(value) ? value : [])
  .filter((row) => {
    if (!isObject(row)) return false;
    if (nameKey && typeof row[nameKey] === 'string' && row[nameKey].trim()) return true;
    if (row.id) return true;
    return false;
  });

/** Drop a field when its value could not be true; leave it alone otherwise. */
const dropIfNot = (row, key, isValid) => {
  if (row[key] === undefined) return row;
  return isValid(row[key]) ? row : { ...row, [key]: null };
};

/** A finite non-negative number, or a string, or absent. A price of "£2" is not a price. */
const isAmount = (value) => typeof value === 'number' || value === null;

/** A `YYYY-MM-DD` stamp, or absent. Anything else is not a date. */
const isDate = (value) => value === undefined || value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);

/** A map key that names a real day, or null. */
const dateOr = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/**
 * The canonical price-source vocabulary, for list-row provenance.
 *
 * One set, derived from the app's own tables rather than re-invented here:
 * every value in `PRICE_SOURCES` (price-provenance.js) plus the resolver's
 * `recorded`/`checked` states and the honest `unknown`. Writers stamp
 * 'manual', 'receipt', 'retailer', 'recorded', 'estimated', 'observed' and
 * friends (see shopping-list-mutations, receipt-import, price-evidence) —
 * nulling a valid source on load would erase provenance the household or
 * the till actually recorded. Anything outside this set is bogus and is
 * removed rather than believed.
 */
const PRICES = new Set([...Object.keys(PRICE_SOURCES), 'recorded', 'checked', 'unknown']);

const REPAIRS = {
  // A pantry row. "Use first" sorts on `expiry`, so a malformed one would read
  // as fresh food that never needs using.
  pantry: (rows) => rowsWithIdAndName(rows).map((row) => dropIfNot(
    dropIfNot(row, 'expiry', isDate),
    'qty',
    (v) => v === undefined || v === null || typeof v === 'string' || typeof v === 'number',
  )),
  shoppingList: (rows) => rowsWithIdAndName(rows).map((row) => {
    const priced = dropIfNot(row, 'price', isAmount);
    // A price must say where it came from. An unsourced number is a guess, and
    // a guess is exactly what this app must never print as a fact.
    return dropIfNot(priced, 'priceSource', (v) => v === undefined || PRICES.has(v));
  }),
  // Shops are trip records ({id,date,store,total,items[]}), not named rows:
  // they never carried `name`, and a dated trip without an id (a hand-edited
  // export, an imported history) is still real spend — it is kept as long as
  // it can be placed in time. A row with neither id nor date cannot be
  // anchored to anything and is dropped rather than guessed at.
  shops: (rows) => rowsWithLegacyId(rows, { nameKey: 'date' }).map((row) => ({
    ...dropIfNot(row, 'date', isDate),
    items: Array.isArray(row.items) ? row.items.filter(isObject) : [],
  })),
  // Cooks are outcome records ({recipeId,date}), not named rows.
  cooked: (rows) => rowsWithLegacyId(rows, { nameKey: 'recipeId' }).map((row) => dropIfNot(row, 'date', isDate)),
  // Waste rows predate ids too; keep anything naming what was thrown.
  waste: (rows) => rowsWithLegacyId(rows, { nameKey: 'name' }).map((row) => dropIfNot(row, 'date', isDate)),
  // A plan is `{ day: { slot: recipeId } }`. A non-object day, a non-object
  // meal, or a slot without a recipe id is dropped rather than rendered.
  plan: (plan) => {
    if (!isObject(plan)) return {};
    const out = {};
    for (const [day, meals] of Object.entries(plan)) {
      if (!isObject(meals) || !dateOr(day)) continue;
      const slots = Object.entries(meals)
        .filter(([, recipeId]) => typeof recipeId === 'string' && recipeId.length > 0);
      if (slots.length) out[day] = Object.fromEntries(slots);
    }
    return out;
  },
  // The diary is `{ day: entry[] }`. A malformed day is dropped whole; a
  // malformed entry inside a good day is dropped individually.
  log: (log) => {
    if (!isObject(log)) return {};
    const out = {};
    for (const [day, entries] of Object.entries(log)) {
      if (!Array.isArray(entries) || !dateOr(day)) continue;
      const kept = entries.filter((entry) => isObject(entry) && entry.foodId);
      if (kept.length) out[day] = kept;
    }
    return out;
  },
};


export const hydrate = (stored = {}) => {
  // Pure transformation: stored bytes → validated canonical state.
  //
  // Deliberately lifecycle-free. Day rollover, missed-meal capture and any
  // other `today`-dependent behaviour live in `applyBootLifecycle()` below,
  // which boot calls exactly once per session. Hydration itself must be
  // idempotent (hydrate(hydrate(x)) === hydrate(x)), must not read the clock,
  // and must be safe to call from export, import, cross-tab adoption and
  // tests without changing logical state.
  const candidate = isObject(stored) ? stored : {};
  // A fresh object, never the caller's: hydration must not hand back a live
  // reference into a backup object somebody may still hold.
  const state = {
    ...EMPTY_STATE,
    ...candidate,
    schemaVersion: STATE_VERSION,
    members: (Array.isArray(candidate.members) ? candidate.members : []).map((member) => ({
      ...member,
      role: member.role === 'child' ? 'child' : 'adult',
      permissions: {
        ...permissionsForRole(member.role === 'child' ? 'child' : 'adult'),
        ...(member.permissions || {}),
      },
      notifications: member.notifications !== false,
    })),
    body: { ...EMPTY_STATE.body, ...(isObject(candidate.body) ? candidate.body : {}) },
    targets: { ...DEFAULT_TARGETS, ...(isObject(candidate.targets) ? candidate.targets : {}) },
  };
  for (const [key, repair] of Object.entries(REPAIRS)) {
    if (key in candidate) state[key] = repair(candidate[key]);
  }
  Object.entries(EMPTY_STATE).forEach(([key, fallback]) => {
    if (Array.isArray(fallback) && !Array.isArray(state[key])) state[key] = [];
    else if (isObject(fallback) && !isObject(state[key])) state[key] = { ...fallback };
  });

  if (!ACCENT_IDS.includes(state.accent)) state.accent = EMPTY_STATE.accent;
  // v4: receipt-only rise/bargain + coupon vault
  if (!Array.isArray(state.coupons)) state.coupons = [];
  state.priceAlertConfig = normalisePriceAlertConfig(state.priceAlertConfig || {});
  if (!Array.isArray(state.priceAlerts)) state.priceAlerts = [];
  if (!Array.isArray(state.offers)) state.offers = [];
  state.predictionCorrections = (Array.isArray(state.predictionCorrections) ? state.predictionCorrections : [])
    .map((event) => predictionCorrectionEvent(event) || null)
    .filter(Boolean)
    .slice(-500);
  state.predictionSnapshots = (Array.isArray(state.predictionSnapshots) ? state.predictionSnapshots : [])
    .filter((snapshot) => snapshot?.type === 'prediction_snapshot')
    .slice(-500);
  // Versioned evidence books survive storage like the loops they describe:
  // unknown or malformed versions are DROPPED here with named reasons
  // available from the same gates evaluation uses — never carried into
  // metrics, never silently reinterpreted (task: version provenance/override
  // records).
  state.quantityOverrides = (Array.isArray(state.quantityOverrides) ? state.quantityOverrides : [])
    .filter((record) => overrideSchemaStatus(record).ok)
    .slice(-200);
  state.basketPredictions = (Array.isArray(state.basketPredictions) ? state.basketPredictions : [])
    .filter((record) => basketSchemaStatus(record).ok)
    .slice(-200);
  // The prediction book survives offline storage like the list it describes;
  // malformed or junk entries are dropped rather than carried into metrics.
  state.shoppingPredictions = (Array.isArray(state.shoppingPredictions) ? state.shoppingPredictions : [])
    .filter((p) => p && typeof p === 'object' && p.id && typeof p.name === 'string')
    .slice(-500);
  state.autopilotOutcomes = (Array.isArray(state.autopilotOutcomes) ? state.autopilotOutcomes : []).slice(-500);
  // Weekly-autopilot learning: insight dismissals/kept + cook feedback survive
  // like the loops they describe; malformed rows are dropped, never invented.
  state.insightDismissals = (Array.isArray(state.insightDismissals) ? state.insightDismissals : [])
    .filter((r) => r && (typeof r.id === 'string' || typeof r === 'string')).slice(-100);
  state.insightKept = (Array.isArray(state.insightKept) ? state.insightKept : [])
    .filter((r) => r && (typeof r.id === 'string' || typeof r === 'string')).slice(-100);
  state.cookFeedback = (Array.isArray(state.cookFeedback) ? state.cookFeedback : [])
    .filter((r) => r && typeof r.recipeId === 'string').slice(-500);
  state.planTemplates = (Array.isArray(state.planTemplates) ? state.planTemplates : []).slice(-20);
  return state;
};

/**
 * Runtime boot lifecycle, applied once per session AFTER pure hydration.
 *
 * Separated because hydration must be a deterministic `stored → canonical`
 * mapping while rollover is intentionally time-dependent: the same stored
 * bytes opened tomorrow must roll the day forward and mark silent misses,
 * but re-reading them today (export, second tab, second hydrate call) must
 * not. Callers that load persisted state for boot use
 * `applyBootLifecycle(hydrate(bytes))`; callers that serialise, import or
 * adopt state use `hydrate()` alone.
 *
 * `today` is injectable so tests pin the clock instead of racing it.
 */
export const applyBootLifecycle = (stored, { today } = {}) => {
  const state = hydrate(stored);
  const rolled = today === undefined ? rolloverDay(state) : rolloverDay(state, today);
  // A day actually passed since this household last opened the app: any
  // planned slot dated before today that never got cooked, skipped or
  // swapped is now a silent miss — mark it so the waste log sees it.
  if (rolled === state) return rolled;
  return captureMissedMeals(rolled);
};

export const parseBackup = (text) => {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  const candidate = isObject(parsed?.state) ? parsed.state : parsed;
  if (!isObject(candidate) || typeof candidate.onboarded !== 'boolean') {
    throw new Error('This is not a complete Forq backup.');
  }
  // A record from a newer Forq is never reinterpreted through this build's
  // hydration rules, and never rewritten. It is refused, loudly, with the
  // version that produced it — that data is still its owner's.
  if (isFutureVersion(candidate)) {
    const error = new Error('This data was saved by a newer version of Forq.');
    error.issue = futureVersionIssue(candidate.schemaVersion);
    throw error;
  }
  return hydrate(candidate);
};

export const serialiseBackup = (state, healthVault = null) => JSON.stringify({
  format: 'forq-backup',
  version: STATE_VERSION,
  exportedAt: new Date().toISOString(),
  state: hydrate(healthVault ? withoutHealth(state, EMPTY_STATE) : state),
  ...(healthVault ? { healthVault } : {}),
}, null, 2);

export const loadStoredState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? parseBackup(raw) : null;
    const vault = localStorage.getItem(HEALTH_VAULT_KEY);
    // Boot read, not a pure re-parse: the household's day rolls forward here
    // (once per session) while export/import/cross-tab paths stay pure.
    const booted = raw ? applyBootLifecycle(parsed) : null;
    return raw
      ? { state: booted.healthVaultEnabled && vault ? withoutHealth(booted, EMPTY_STATE) : booted, issue: null }
      : { state: { ...EMPTY_STATE }, issue: null };
  } catch (error) {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* storage itself is unavailable */ }
    return {
      state: { ...EMPTY_STATE },
      issue: {
        kind: raw ? 'corrupt' : 'unavailable',
        message: raw
          ? 'Forq could not read your saved data. It has not been overwritten.'
          : 'This browser is blocking local storage, so changes cannot be saved.',
        raw,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

/**
 * What a record from a future Forq means to this build. A newer schema is
 * never rewritten — that is somebody's data, produced by a version that knew
 * things this one doesn't. It is reported so the recovery screen can hand the
 * raw text back to its owner.
 */
export const futureVersionIssue = (storedVersion) => ({
  kind: 'future',
  message: `This data was saved by a newer version of Forq (v${storedVersion}). It has been left exactly as it is, and this version of Forq will not write over it.`,
  raw: null,
  detail: `Stored schemaVersion ${storedVersion}; this build understands ${STATE_VERSION}.`,
});

/** True when a record claims a schema this build does not know. */
export const isFutureVersion = (stored) => {
  const version = Number(stored?.schemaVersion);
  return Number.isFinite(version) && version > STATE_VERSION;
};

