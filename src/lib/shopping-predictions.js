/**
 * Shopping prediction snapshots — what Forq actually told the household to buy.
 *
 * "How accurate was my quantity advice?" used to be answered by rebuilding the
 * prediction from the plan's recipes after the shop had already happened —
 * which quietly answers a different question: the list the household saw was
 * also shaped by the pantry deduction, the household's portions, the waste
 * learning and any suppressed adaptations, and a reconstruction sees none of
 * that. So the list builder now freezes the quantity it is about to show:
 *
 *   one row, one snapshot, written in the same state update that shows it.
 *
 * The store holds `shoppingPredictions`, keyed by a stable prediction id
 * (list item id) — re-deriving the same row overwrites the snapshot in place,
 * so the store never accumulates a snapshot per refresh. Rows that leave the
 * list have their snapshot evicted; `buildShopRecord` freezes the bought
 * rows' snapshots onto the shop record, where evaluation keeps reading them
 * even after the list has moved on.
 *
 * The lifecycle API is explicit so a caller cannot accidentally evict
 * snapshots it never mentioned:
 *
 *   - `upsertPredictions(rows, previous, context)`      — add/refresh ONLY the
 *     rows named; every other snapshot survives untouched. Use when rows are
 *     added or edited (top-ups, manual rows, single-row updates).
 *   - `replacePredictionsForList(fullList, previous, context)` — the full
 *     visible list is the input; rows that left it are evicted. Use ONLY when
 *     the caller genuinely passed the complete list (regeneration, week loop).
 *   - `attachPredictions(list, previous, context)`       — retained alias for
 *     `replacePredictionsForList`, for existing callers and tests.
 */

import { canonicalName } from './aliases.js';
import { parseQuantity } from './measure.js';
import { DAY_RE } from './evaluation-time.js';

/**
 * The frozen-evidence schema version (task: version frozen evidence).
 *
 *   1 — legacy: snapshots written before identity/schema freezing existed;
 *       no `subjectKey`, no `schemaVersion` field. Handled DELIBERATELY at
 *       validation (subject resolved at read time, labelled as such) — never
 *       silently reinterpreted under modern rules.
 *   2 — current: the validated normalized snapshot, frozen ONCE with canonical
 *       subject identity (`subjectKey`), measurement meaning (`normalized`,
 *       `dimension`), provenance (`day`/`at`), substitution lineage and this
 *       version stamp. Evaluation reads the stored identity; later alias or
 *       schema changes cannot alter what the evidence meant.
 */
export const SNAPSHOT_SCHEMA_VERSION = 2;
export const SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS = [1, SNAPSHOT_SCHEMA_VERSION];

/**
 * One prediction row: the decision record behind the quantity on screen.
 * Every field answers "why this number" — the exact decision stack the task
 * names, in the order it applied:
 *
 *   plan need → pantry deduction → household portions → waste adjustment →
 *   adaptation/suppression state → the quantity finally displayed.
 */
export const shoppingPrediction = ({
  itemId = null,
  name = '',
  qty = null,
  subjectKey = null,
  sourceRecipes = [],
  portionsDecision = null,
  pantryDeduction = null,
  wasteAdjustment = null,
  suppressed = false,
  substitutedFrom = null,
  substitutionWhy = '',
  week = null,
  day = null,
} = {}) => {
  const parsed = parseQuantity(qty, { ingredient: name });
  return {
    id: String(itemId || `pred-${Math.random().toString(36).slice(2, 10)}`),
    predictionKey: canonicalName(name) || String(name || '').trim().toLowerCase(),
    name: String(name || ''),
    qty: qty == null ? null : String(qty),
    // Normalized where the engine can vouch for it; null for counts, hedged
    // quantities and anything else the engine will not sign.
    normalized: parsed && parsed.confidence === 'exact'
      ? { amount: parsed.amount, dim: parsed.dim, unit: parsed.unit }
      : null,
    // Canonical subject identity, resolved at PREDICTION time and carried on
    // the snapshot so the freeze at purchase never has to re-derive it.
    subjectKey: String(subjectKey || canonicalName(name) || String(name || '').trim().toLowerCase()),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sourceRecipes: Array.isArray(sourceRecipes) ? sourceRecipes.filter(Boolean) : [],
    portionsDecision,
    pantryDeduction,
    wasteAdjustment,
    suppressed: Boolean(suppressed),
    // Substitution lineage: when this row replaced a DIFFERENT ingredient,
    // the snapshot says so — the row id alone is not identity, and a Quinoa
    // purchase must never be scored against a Rice prediction.
    substitutedFrom: substitutedFrom == null ? null : String(substitutedFrom),
    substitutionWhy: String(substitutionWhy || ''),
    isSubstitution: Boolean(substitutedFrom),
    week: week == null ? null : String(week),
    day: day == null ? null : String(day).slice(0, 10),
    at: Date.now(),
  };
};

/** The week stamp (Monday of `day`'s week) for grouping predictions. */
export const weekStamp = (day) => {
  const stamp = String(day || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
  const date = new Date(`${stamp}T12:00:00`);
  const dow = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - dow);
  return date.toISOString().slice(0, 10);
};

/**
 * The decision context behind one list row, as the plan-to-list paths know
 * it — the exact inputs the snapshot must carry so evaluation never has to
 * reconstruct them.
 */
const decisionFor = (row, {
  portionsDecision = null,
  suppressed = false,
  pantry = [],
  learnedAliases = {},
} = {}) => ({
  sourceRecipes: Array.isArray(row.sourceRecipes) && row.sourceRecipes.length
    ? row.sourceRecipes
    : (row.fromRecipe ? [row.fromRecipe] : []),
  portionsDecision,
  pantryDeduction: row.requiredQty != null
    ? {
      requiredQty: row.requiredQty,
      pantryQty: row.pantryQty || '',
      shortfallQty: row.shortfallQty || '',
      deducted: Boolean(row.pantryQty),
    }
    : null,
  wasteAdjustment: row.autoReduction || null,
  suppressed,
  pantry,
  learnedAliases,
});

/**
 * Upsert: add or refresh ONLY the snapshots for the rows named. Snapshots
 * for rows not named here are preserved untouched — adding one item must
 * never evict the snapshots of items already on the list, and updating one
 * row must never disturb its neighbours. Shared implementation for both
 * entry points below.
 *
 * `context` carries the household decision and the suppression set so each
 * row's record says what shaped it: { portionsDecision, suppressedKeys,
 * pantry, learnedAliases, day }.
 */
const upsertInto = (rows, previous, context) => {
  const {
    portionsDecision = null,
    suppressedKeys = null,
    pantry = [],
    learnedAliases = {},
    day = null,
  } = context;
  // Held keys arrive in whatever language the rejection was recorded in;
  // both sides meet on the canonical name so a raw key still matches its
  // row.
  const suppressedSet = new Set(
    [...(suppressedKeys instanceof Set ? suppressedKeys : (suppressedKeys || []))]
      .map((k) => canonicalName(String(k), learnedAliases) || String(k).trim().toLowerCase()),
  );
  const week = weekStamp(day);
  const keep = new Map((Array.isArray(previous) ? previous : []).map((p) => [p.id, p]));
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.name || !row?.id) continue;
    const key = canonicalName(row.name, learnedAliases) || String(row.name).trim().toLowerCase();
    keep.set(row.id, shoppingPrediction({
      itemId: row.id,
      name: row.name,
      qty: row.qty,
      // Subject identity resolved with the alias memory as of NOW — this is
      // the one moment the household's naming decides what the snapshot means.
      subjectKey: key,
      sourceRecipes: decisionFor(row, { portionsDecision, suppressed: suppressedSet.has(key), pantry, learnedAliases }).sourceRecipes,
      portionsDecision,
      pantryDeduction: row.requiredQty != null
        ? {
          requiredQty: row.requiredQty,
          pantryQty: row.pantryQty || '',
          shortfallQty: row.shortfallQty || '',
          deducted: Boolean(row.pantryQty),
        }
        : null,
      wasteAdjustment: row.autoReduction || null,
      suppressed: suppressedSet.has(key),
      substitutedFrom: row.substitutedFrom == null ? null : String(row.substitutedFrom),
      substitutionWhy: String(row.substitutionWhy || row.substitutionReason || ''),
      week,
      day,
    }));
  }
  return [...keep.values()];
};

export const upsertPredictions = (rows = [], previous = [], context = {}) =>
  upsertInto(Array.isArray(rows) ? rows : [], previous, context).slice(-500);

/**
 * Replace: the caller asserts `list` is the COMPLETE visible list, so a
 * snapshot for a row no longer on it is evicted — a snapshot describes a row
 * currently on show, and the frozen copies that matter live on the shop
 * records that consumed them. Regeneration and the week loop pass the whole
 * list here; anything less must use `upsertPredictions`.
 */
export const replacePredictionsForList = (list = [], previous = [], context = {}) => {
  const rows = Array.isArray(list) ? list : [];
  // NOTE: no early return on an empty list — an emptied list means every
  // row left the screen, so every book entry is evicted (frozen copies
  // survive on the shop records that consumed them).
  const next = upsertInto(rows, previous, context);
  const onList = new Set(rows.filter((r) => r?.id).map((r) => r.id));
  return next.filter((p) => onList.has(p.id)).slice(-500);
};

/**
 * Retained alias for `replacePredictionsForList`. Existing callers and
 * tests use it; new code should name its intent with the explicit API.
 */
export const attachPredictions = (list, previous, context) =>
  replacePredictionsForList(list, previous, context);

const basketPrediction = (items = []) => Math.round((Array.isArray(items) ? items : [])
  .reduce((sum, row) => sum + (Number(row?.price) || 0), 0) * 100) / 100;

/**
 * The one purchase-recording shape. Both sanctioned paths — `recordShop`'s
 * checked-rows flow and the `purchaseIngredients` domain command — build the
 * shop record here, so every shop carries the same prediction metadata and
 * evaluation never meets a shop it cannot read.
 *
 * The frozen `predictions` are the VALIDATED NORMALIZED snapshots looked up
 * from the store's prediction book at purchase time — NOT the raw book rows.
 * Freezing the normalized copy is the point: it carries exactly the fields
 * evaluation is allowed to read (identity, measurement meaning, provenance,
 * lineage, schema version), drops anything else the raw row happened to
 * carry, and is `Object.freeze`d so nothing downstream can quietly rewrite
 * what was shown. Each frozen snapshot persists:
 *
 *   `id` / `predictionId` — the row it advised;  `subjectKey` — canonical
 *   subject resolved with the alias memory AS OF PURCHASE TIME (never
 *   re-derived later);  `name`, `qty` — exactly what was displayed;
 *   `normalized` + `dimension` — the engine-signed measurement meaning;
 *   `day` / `at` — when it was on show;  `substitutedFrom` / `isSubstitution`
 *   — substitution lineage;  `schemaVersion` — the frozen-evidence schema.
 *
 * The bought rows are stamped with `subjectKey` too: the OUTCOME side of the
 * comparison is frozen at the same moment, so a later alias lesson cannot
 * re-describe what was actually purchased.
 *
 * Snapshots that fail the canonical gate are NOT frozen silently: the record
 * carries `predictionRejections` naming the row and the gate's reason, so
 * evaluation can report why a row is unscoreable instead of guessing.
 *
 * `items` are the writer's final item rows (the writer keeps shaping them);
 * `predictedCost` is the writer's own pre-till basket snapshot when it has
 * one, otherwise the sum of the row prices the household saw.
 */
export const buildShopRecord = ({ state = {}, items = [], store = null, total = null, predictedCost = null, id, day }) => {
  const book = Array.isArray(state.shoppingPredictions) ? state.shoppingPredictions : [];
  const byId = new Map(book.map((p) => [p.id, p]));
  // Only snapshots that pass the canonical schema are frozen onto the shop
  // record — evaluation must never meet a frozen row it cannot read. Alias
  // memory rides along so the canonical subject is resolved and frozen with
  // the snapshot, ONCE, at the moment of purchase.
  const aliasMemory = state.aliasMemory || {};
  const predictions = [];
  const predictionRejections = [];
  for (const row of Array.isArray(items) ? items : []) {
    const snap = (row?.id != null && byId.get(row.id)) || null;
    if (!snap) continue;
    const verdict = validatePredictionSnapshotWithReason(snap, { aliasMemory });
    if (!verdict.ok) {
      predictionRejections.push({ id: row.id, name: row?.name || null, reason: verdict.reason });
      continue;
    }
    predictions.push(Object.freeze({
      ...verdict.snapshot,
      // The frozen record always conforms to the CURRENT freeze schema: the
      // freeze is the deliberate migration moment. A legacy book row's
      // identity is resolved HERE, at purchase time — and stamped as such —
      // so evaluation never has to re-derive it under later alias rules.
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sourceSchemaVersion: verdict.snapshot.schemaVersion,
      subjectKeyProvenance: verdict.snapshot.legacy ? 'frozen-at-purchase' : verdict.snapshot.subjectKeyProvenance,
      legacy: false,
      // Explicit prediction id alongside the row id (same value, named for
      // what it is — the identity evaluation must read, never re-derive).
      predictionId: verdict.snapshot.id,
      // The bought row's own canonical subject, resolved with the SAME alias
      // memory at the SAME moment — outcome identity frozen at purchase.
      outcomeSubjectKey: canonicalName(String(row?.name ?? '').trim(), aliasMemory)
        || String(row?.name ?? '').trim().toLowerCase(),
    }));
  }
  const stampedItems = (Array.isArray(items) ? items : []).map((item) => (item && typeof item === 'object'
    ? {
      ...item,
      subjectKey: canonicalName(String(item?.name ?? '').trim(), aliasMemory)
        || String(item?.name ?? '').trim().toLowerCase(),
    }
    : item));
  return {
    id,
    date: String(day || '').slice(0, 10),
    store: store || 'Unnamed shop',
    total: Math.round((Number(total) || 0) * 100) / 100,
    predicted: predictedCost != null && Number.isFinite(Number(predictedCost))
      ? Math.round(Number(predictedCost) * 100) / 100
      : basketPrediction(stampedItems),
    items: stampedItems,
    predictions: Object.freeze(predictions),
    predictionRejections: Object.freeze(predictionRejections),
  };
};

/**
 * The CANONICAL snapshot schema, validated centrally. Every consumer of a
 * frozen prediction — evaluation, the shop record, the evaluable filter —
 * goes through this one gate; nobody re-derives what a snapshot is.
 *
 * A snapshot is VALID when ALL of these hold:
 *
 *   - it names its row (`id`);
 *   - it carries a non-empty displayed quantity (`qty`) that resolves to a
 *     measurement dimension — through the engine-signed `normalized` block
 *     or a fresh exact parse (hedged quantities like "a few" are invalid:
 *     relative error against them would be a guess);
 *   - it carries usable SUBJECT identity: a canonical subject key resolved
 *     alias-aware from `predictionKey` (falling back to `name`). A snapshot
 *     that does not say WHAT it was about cannot prove that a later outcome
 *     measured the same thing — evaluation must not guess;
 *   - it carries usable PROVENANCE: when it was shown, as `day`
 *     (YYYY-MM-DD) or `at` (epoch millis). With BOTH missing the sample has
 *     no "when" and is rejected as `missing-prediction-provenance`.
 *
 * `validatePredictionSnapshot` returns a normalized copy or null, so
 * existing truthiness callers keep working; `validatePredictionSnapshotWithReason`
 * is the explicit form evaluation uses to name WHY a snapshot was rejected.
 */

export const SNAPSHOT_REJECTION_REASONS = {
  NOT_AN_OBJECT: 'malformed-snapshot',
  NO_ID: 'snapshot-missing-id',
  NO_QTY: 'snapshot-missing-qty',
  NO_DIMENSION: 'snapshot-unreadable-quantity',
  NO_SUBJECT: 'snapshot-missing-subject',
  NO_PROVENANCE: 'missing-prediction-provenance',
  MALFORMED_SCHEMA: 'malformed-snapshot-schema',
  UNKNOWN_SCHEMA: 'unsupported-snapshot-schema',
  V2_MISSING_SUBJECT: 'snapshot-v2-missing-subject',
};

/**
 * Stable canonical subject identity: WHICH ingredient this prediction was
 * about, resolved through the same alias table the rest of the app speaks
 * ("Chickpeas (tins)" and "chickpeas" are one subject). Evaluation compares
 * snapshot subject to outcome subject — prediction id alone is not identity:
 * a substituted row keeps its id while changing ingredient.
 */
export const snapshotSubjectKey = (snap, aliasMemory = {}) => {
  const raw = snap?.predictionKey != null && String(snap.predictionKey).trim() !== ''
    ? snap.predictionKey
    : snap?.name;
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  return canonicalName(trimmed, aliasMemory) || trimmed.toLowerCase();
};

/**
 * The frozen-evidence version gate (task: version frozen evidence). A
 * snapshot either declares a SUPPORTED schema version or predates versioning:
 *
 *   - `schemaVersion` absent               → legacy v1, handled deliberately
 *     (subject resolved at read time and labelled — v1's documented semantic,
 *     not a silent reinterpretation);
 *   - an integer in SUPPORTED versions     → accepted as that version;
 *   - numeric but outside the support set  → rejected `unsupported-snapshot-schema`;
 *   - anything else (non-numeric garbage)  → rejected `malformed-snapshot-schema`.
 *
 * Unknown or malformed versions are ALWAYS rejected with their named reason —
 * evaluation must never guess what a future (or corrupted) schema meant.
 */
export const snapshotSchemaStatus = (snap) => {
  if (!snap || typeof snap !== 'object') return { ok: false, reason: SNAPSHOT_REJECTION_REASONS.MALFORMED_SCHEMA };
  const raw = snap.schemaVersion;
  if (raw == null) return { ok: true, version: 1, legacy: true };
  const version = Number(raw);
  if (!Number.isInteger(version)) return { ok: false, reason: SNAPSHOT_REJECTION_REASONS.MALFORMED_SCHEMA };
  if (!SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS.includes(version)) {
    return { ok: false, reason: SNAPSHOT_REJECTION_REASONS.UNKNOWN_SCHEMA };
  }
  return { ok: true, version, legacy: version < SNAPSHOT_SCHEMA_VERSION };
};

export const validatePredictionSnapshotWithReason = (snap, { aliasMemory = {}, requireProvenance = true } = {}) => {
  const reject = (reason) => ({ ok: false, reason, snapshot: null });
  if (!snap || typeof snap !== 'object') return reject(SNAPSHOT_REJECTION_REASONS.NOT_AN_OBJECT);
  // The version gate runs FIRST: an unknown or malformed schema version means
  // the record cannot be read under any known rules — reject, never guess.
  const schema = snapshotSchemaStatus(snap);
  if (!schema.ok) return reject(schema.reason);
  const id = snap.id == null ? null : String(snap.id);
  if (!id) return reject(SNAPSHOT_REJECTION_REASONS.NO_ID);
  if (snap.qty == null || snap.qty === '') return reject(SNAPSHOT_REJECTION_REASONS.NO_QTY);
  const at = snap.at == null || !Number.isFinite(Number(snap.at)) ? null : Number(snap.at);
  const normalized = snap.normalized
    && Number.isFinite(Number(snap.normalized.amount))
    && ['mass', 'volume', 'count'].includes(snap.normalized.dim)
    ? { amount: Number(snap.normalized.amount), dim: snap.normalized.dim, unit: String(snap.normalized.unit || '') }
    : null;
  const parsed = normalized ? null : parseQuantity(snap.qty, { ingredient: snap.name });
  const dimension = normalized?.dim || (parsed && parsed.confidence === 'exact' ? parsed.dim : null);
  if (!dimension) return reject(SNAPSHOT_REJECTION_REASONS.NO_DIMENSION);
  // Identity: a v2 snapshot CARRIES its frozen subjectKey (resolved when the
  // snapshot was frozen) and it is used AS-IS — the current alias memory is
  // never consulted for identity that was already frozen. Only legacy v1
  // snapshots resolve their subject at read time, and say so.
  const storedSubject = !schema.legacy && typeof snap.subjectKey === 'string' && snap.subjectKey.trim() !== ''
    ? snap.subjectKey.trim()
    : null;
  if (!schema.legacy && storedSubject == null) {
    return reject(SNAPSHOT_REJECTION_REASONS.V2_MISSING_SUBJECT);
  }
  const subjectKey = storedSubject || snapshotSubjectKey(snap, aliasMemory);
  if (!subjectKey) return reject(SNAPSHOT_REJECTION_REASONS.NO_SUBJECT);
  const day = snap.day == null ? null : String(snap.day).slice(0, 10);
  const hasDay = Boolean(day && DAY_RE.test(day));
  if (requireProvenance && !hasDay && at == null) {
    return reject(SNAPSHOT_REJECTION_REASONS.NO_PROVENANCE);
  }
  return {
    ok: true,
    reason: null,
    snapshot: {
      id,
      predictionKey: String(snap.predictionKey || ''),
      name: String(snap.name || ''),
      subjectKey,
      // Where the subject identity came from — frozen with the evidence, or
      // deliberately resolved at read time for legacy rows.
      subjectKeyProvenance: storedSubject ? 'frozen-at-prediction-time' : 'resolved-at-evaluation',
      qty: String(snap.qty),
      normalized,
      dimension,
      substitutedFrom: snap.substitutedFrom == null ? null : String(snap.substitutedFrom),
      substitutionWhy: String(snap.substitutionWhy || ''),
      isSubstitution: Boolean(snap.substitutedFrom),
      sourceRecipes: Array.isArray(snap.sourceRecipes) ? snap.sourceRecipes.filter(Boolean) : [],
      portionsDecision: snap.portionsDecision ?? null,
      pantryDeduction: snap.pantryDeduction ?? null,
      wasteAdjustment: snap.wasteAdjustment ?? null,
      suppressed: Boolean(snap.suppressed),
      week: snap.week == null ? null : String(snap.week),
      day: hasDay ? day : null,
      at,
      schemaVersion: schema.version,
      legacy: schema.legacy,
    },
  };
};

export const validatePredictionSnapshot = (snap, opts = {}) =>
  validatePredictionSnapshotWithReason(snap, opts).snapshot;

/**
 * Snapshots usable for evaluation: a displayed quantity that is not a
 * manual row (no sourceRecipes → the household's own line, not Forq's
 * advice) and carries a readable quantity. The plan-derived test reads the
 * canonical snapshot fields — `sourceRecipes` and `wasteAdjustment` (the
 * waste adaptation frozen at snapshot time). A row whose ONLY claim is a
 * waste adjustment is still Forq's advice: the reduction changed what the
 * list showed. Every row passes the canonical schema gate first.
 */
export const evaluablePredictions = (store = []) => (Array.isArray(store) ? store : [])
  .map(validatePredictionSnapshot)
  .filter((p) => p && (p.sourceRecipes.length || p.wasteAdjustment));
