/**
 * Prediction evidence primitives — provenance, quantity overrides and
 * frozen basket-cost predictions.
 *
 * Everything that decides whether a number can enter Forq's claimed
 * accuracy lives here, next to the evidence it describes:
 *
 *   - PROVENANCE: who produced the quantity on a shopping snapshot. Only
 *     Forq-generated advice (`forq-plan`, `forq-adaptation`, `forq-top-up`)
 *     is `evaluableForPredictionAccuracy`; the household's own rows and
 *     edits (`user-manual`, `user-repeat-shop`, `user-override`) are frozen
 *     and labelled but never scored against Forq's model.
 *
 *   - QUANTITY OVERRIDES: when the household edits a predicted quantity,
 *     the original frozen advice is preserved untouched and an explicit
 *     override event records who changed what, when — a high-quality
 *     learning signal that is never confused with a purchase outcome.
 *
 *   - BASKET-COST PREDICTIONS: the predicted spend is frozen when the list
 *     is generated or materially repriced — never computed at checkout. A
 *     shop without a genuine pre-purchase prediction is excluded from spend
 *     accuracy instead of being reconstructed after the fact.
 *
 * Every record carries an explicit schema version; unknown or malformed
 * versions are rejected (or retained as qualitative legacy evidence) with
 * named reasons — never silently reinterpreted.
 */

/** Who produced the quantity on a snapshot — the exact provenance vocabulary. */
export const PREDICTION_PROVENANCE = {
  FORQ_PLAN: 'forq-plan',           // plan-derived advice (recipe quantities, scaled)
  FORQ_ADAPTATION: 'forq-adaptation', // waste/pattern learning changed the shown quantity
  FORQ_TOP_UP: 'forq-top-up',       // inference-driven top-up proposals
  USER_MANUAL: 'user-manual',       // the household hand-added the row
  USER_REPEAT_SHOP: 'user-repeat-shop', // repeated from the last recorded shop
  USER_OVERRIDE: 'user-override',   // the household edited Forq's quantity
};

/** Only genuine Forq-generated advice may enter Forq's claimed accuracy. */
export const FORQ_PROVENANCE = [
  PREDICTION_PROVENANCE.FORQ_PLAN,
  PREDICTION_PROVENANCE.FORQ_ADAPTATION,
  PREDICTION_PROVENANCE.FORQ_TOP_UP,
];

export const evaluableForPredictionAccuracy = (provenance) =>
  FORQ_PROVENANCE.includes(provenance == null ? null : String(provenance));

/**
 * The provenance schema gate (task: version provenance records). Absent
 * `provenance` on a snapshot is LEGACY v1 evidence: handled deliberately —
 * plan-derived rows (`sourceRecipes`/`fromRecipe`/`wasteAdjustment`) keep
 * scoring as Forq advice, hand-added rows stay excluded, and both are
 * labelled `legacy-…` — never silently reinterpreted. An explicit but
 * unknown value is REJECTED with a named reason.
 */
export const PROVENANCE_REJECTION_REASONS = {
  UNKNOWN: 'unknown-prediction-provenance',
  MISSING_V2: 'snapshot-missing-provenance',
};

export const provenanceStatusFor = (snap = {}) => {
  const provenance = snap.provenance == null ? null : String(snap.provenance);
  if (provenance == null) {
    // Legacy v1 snapshot: no provenance field existed. The deliberate legacy
    // semantic: plan-derived rows are Forq advice, everything else is not.
    const planDerived = Boolean(
      (Array.isArray(snap.sourceRecipes) && snap.sourceRecipes.length) || snap.fromRecipe,
    );
    const legacy = planDerived
      ? PREDICTION_PROVENANCE.FORQ_PLAN
      : (snap.wasteAdjustment ? PREDICTION_PROVENANCE.FORQ_ADAPTATION : PREDICTION_PROVENANCE.USER_MANUAL);
    return { ok: true, legacy: true, provenance: legacy, evaluable: evaluableForPredictionAccuracy(legacy) };
  }
  if (PREDICTION_PROVENANCE[provenance.replace(/-/g, '_').toUpperCase()]) {
    return { ok: true, legacy: false, provenance, evaluable: evaluableForPredictionAccuracy(provenance) };
  }
  return { ok: false, legacy: false, provenance: null, evaluable: false, reason: PROVENANCE_REJECTION_REASONS.UNKNOWN };
};

const overrideVersion = 1;

/**
 * One quantity override: the household changed what Forq advised. The
 * ORIGINAL frozen advice stays on the snapshot untouched; this record is
 * the explicit, attributable statement of what was shown and what the
 * household made of it. Never a purchase outcome.
 */
export const quantityOverrideEvent = ({
  predictionId = null,
  subjectKey = null,
  originalQty = null,
  overrideQty = null,
  dimension = null,
  unit = null,
  day = null,
  at = null,
  actor = null,
  reason = null,
  id = null,
  listItemId = null,
} = {}) => ({
  id: id || `qov-${Math.random().toString(36).slice(2, 10)}`,
  type: 'quantity_override',
  schemaVersion: overrideVersion,
  predictionId: predictionId == null ? null : String(predictionId),
  subjectKey: subjectKey == null ? null : String(subjectKey),
  listItemId: listItemId == null ? null : String(listItemId),
  // Exactly what was displayed before the edit (the frozen advice is NOT
  // rewritten — this copy is the provenance of the learning signal).
  originalQty: originalQty == null ? null : String(originalQty),
  overrideQty: overrideQty == null ? null : String(overrideQty),
  // Measurement meaning copied from the prediction, never re-derived.
  dimension: dimension == null ? null : String(dimension),
  unit: unit == null ? null : String(unit),
  day: day == null ? null : String(day).slice(0, 10),
  at: at || Date.now(),
  actor: actor == null ? null : String(actor),
  reason: reason == null ? null : String(reason),
});

export const SUPPORTED_OVERRIDE_SCHEMA_VERSIONS = [overrideVersion];
export const OVERRIDE_SCHEMA_REJECTION_REASONS = {
  MALFORMED: 'malformed-override-schema',
  UNKNOWN: 'unsupported-override-schema',
};

/** Version gate for stored override records — named reasons, never guesses. */
export const overrideSchemaStatus = (record) => {
  if (!record || typeof record !== 'object') return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.MALFORMED };
  const raw = record.schemaVersion;
  if (raw == null) return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.MALFORMED };
  const version = Number(raw);
  if (!Number.isInteger(version)) return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.MALFORMED };
  if (!SUPPORTED_OVERRIDE_SCHEMA_VERSIONS.includes(version)) {
    return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.UNKNOWN };
  }
  return { ok: true, version, legacy: false };
};

const basketVersion = 1;

/**
 * Freeze the basket-cost prediction AT THE MOMENT IT IS SHOWN — when the
 * shopping list is generated or materially repriced — never at checkout.
 * The per-row prices and their associated prediction ids ride the freeze so
 * the prediction can be reasoned about row by row later. Checkout copies
 * this record onto the shop; it never recomputes one.
 */
export const basketPredictionEvent = ({
  id = null,
  rows = [],
  day = null,
  at = null,
  source = 'list-generation',
  rowPredictionIds = null,
  idFactory = null,
} = {}) => {
  const safeRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && row.name)
    .map((row) => ({
      listItemId: row.id == null ? null : String(row.id),
      name: String(row.name),
      qty: row.qty == null ? null : String(row.qty),
      price: Math.round((Number(row.price) || 0) * 100) / 100,
      priceSource: row.priceSource == null ? 'unknown' : String(row.priceSource),
    }));
  const predicted = Math.round(safeRows.reduce((sum, row) => sum + row.price, 0) * 100) / 100;
  return {
    id: id || (typeof idFactory === 'function' ? idFactory() : `bp-${Math.random().toString(36).slice(2, 10)}`),
    type: 'basket_prediction',
    schemaVersion: basketVersion,
    // Total is the ONLY number evaluation reads; rows carry the per-row
    // breakdown for diagnostics and row-prediction linkage.
    predicted,
    rows: safeRows,
    // The prediction ids (shoppingPredictions book entries) this cost was
    // computed over — the exact rows whose quantity advice this price
    // snapshot describes.
    rowPredictionIds: Array.isArray(rowPredictionIds)
      ? rowPredictionIds.map((rid) => String(rid)).filter(Boolean)
      : safeRows.map((row) => row.listItemId).filter(Boolean),
    source: String(source || 'list-generation'),
    day: day == null ? null : String(day).slice(0, 10),
    at: at || Date.now(),
  };
};

export const SUPPORTED_BASKET_SCHEMA_VERSIONS = [basketVersion];
export const BASKET_SCHEMA_REJECTION_REASONS = {
  MALFORMED: 'malformed-basket-prediction',
  UNKNOWN: 'unsupported-basket-prediction-schema',
};

/** Version gate for stored basket predictions — named reasons, never guesses. */
export const basketSchemaStatus = (record) => {
  if (!record || typeof record !== 'object') return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.MALFORMED };
  const raw = record.schemaVersion;
  if (raw == null) return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.MALFORMED };
  const version = Number(raw);
  if (!Number.isInteger(version)) return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.MALFORMED };
  if (!SUPPORTED_BASKET_SCHEMA_VERSIONS.includes(version)) {
    return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.UNKNOWN };
  }
  return { ok: true, version, legacy: false };
};

/**
 * The frozen basket prediction FOR one list, as checkout should copy it:
 * the latest prediction whose generation day is not in the future and
 * which still describes this list — proven by the row-prediction-id set
 * captured at freeze time (not reconstructed from current rows), with a
 * deliberate fallback to the id-based rows when the caller cannot supply
 * ids. Rows-priced evidence only: a zero-total freeze cannot be scored
 * later, so it is not handed out as the prediction to copy.
 */
export const frozenBasketForList = ({
  basketPredictions = [],
  listRows = [],
  rowPredictionIds = null,
  day = null,
} = {}) => {
  const stamped = String(day || '').slice(0, 10);
  const candidates = (Array.isArray(basketPredictions) ? basketPredictions : [])
    .filter((bp) => bp && typeof bp === 'object')
    .filter((bp) => Number(bp.predicted) > 0)
    .filter((bp) => !stamped || bp.day == null || bp.day <= stamped)
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  if (rowPredictionIds && rowPredictionIds.length) {
    const want = new Set(rowPredictionIds.map((rid) => String(rid)));
    const matched = candidates.find((bp) => {
      const have = new Set((bp.rowPredictionIds || []).map((rid) => String(rid)));
      if (have.size !== want.size) return false;
      for (const rid of want) if (!have.has(rid)) return false;
      return true;
    });
    return matched || null;
  }
  const byRows = candidates.find((bp) => new Set((bp.rows || []).map((r) => r.listItemId)).size === new Set((listRows || []).map((r) => r.id)).size);
  return byRows || null;
};

/**
 * List ↔ snapshot consistency (task: enforce list ↔ snapshot consistency):
 * the live prediction book is UI state — every live snapshot must describe
 * a row CURRENTLY visible on the shopping list. Returns the extra and
 * missing book entries so a caller can repair the divergence (and so the
 * invariant test can fail loudly when the books drift).
 */
export const listSnapshotDivergence = (state = {}) => {
  const list = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  const book = Array.isArray(state.shoppingPredictions) ? state.shoppingPredictions : [];
  const onList = new Set(list.filter((row) => row?.id != null).map((row) => String(row.id)));
  const inBook = new Set(book.filter((p) => p?.id != null).map((p) => String(p.id)));
  const orphans = book.filter((p) => p?.id != null && !onList.has(String(p.id))).map((p) => String(p.id));
  const missing = list.filter((row) => row?.id != null && !inBook.has(String(row.id))).map((row) => String(row.id));
  return { orphans, missing };
};

/**
 * The same check as a boolean invariant — the assertion the test suite
 * hammers on after every list write: `true` means every live
 * shoppingPredictions[].id refers to a currently visible shopping-list row.
 */
export const listSnapshotsConsistent = (state = {}) => {
  const { orphans } = listSnapshotDivergence(state);
  return orphans.length === 0;
};
