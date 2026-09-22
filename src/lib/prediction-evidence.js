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

/**
 * Spend provenance (task: add spend provenance) — WHO priced each row of a
 * basket freeze. Strict spend accuracy scores only `forq` rows; the
 * household's own rows and edits are frozen and labelled but never enter
 * Forq's price forecasting. `mixed` is the basket-level rollup when a
 * basket carries more than one value.
 */
export const SPEND_PROVENANCE = {
  FORQ: 'forq',
  USER_MANUAL: 'user-manual',
  USER_REPEAT_SHOP: 'user-repeat-shop',
  USER_OVERRIDE: 'user-override',
};

/** Normalise any provenance value (snapshot vocabulary or spend vocabulary) to the spend vocabulary. */
export const spendProvenanceFrom = (value) => {
  if (value == null) return null;
  const v = String(value);
  if (v === 'mixed') return 'mixed';
  if (Object.values(SPEND_PROVENANCE).includes(v)) return v;
  // The snapshot vocabulary collapses cleanly: every forq-* provenance is
  // Forq-generated pricing advice, every user-* provenance is the household's.
  if (v.startsWith('forq-')) return SPEND_PROVENANCE.FORQ;
  return null; // unknown vocabulary — never guessed into attribution
};

/**
 * Basket-level provenance rollup: one value when every attributed row
 * agrees, `mixed` when the basket combines provenances, null when nothing
 * on the freeze can attribute a pricer.
 */
export const basketProvenanceRollup = (rows = []) => {
  const values = [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => spendProvenanceFrom(row?.provenance))
      .filter(Boolean),
  )];
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  return 'mixed';
};

const basketVersion = 2;

/**
 * Freeze the basket-cost prediction AT THE MOMENT IT IS SHOWN — when the
 * shopping list is generated or materially repriced — never at checkout.
 * The per-row prices and their associated prediction ids ride the freeze so
 * the prediction can be reasoned about row by row later. Checkout copies
 * this record onto the shop; it never recomputes one.
 *
 * Each freeze also carries its own EVIDENCE QUALITY (tasks: track price
 * coverage, add spend provenance): per-row `priced` flag, per-row spend
 * `provenance` (resolved from the live snapshot book at freeze time), and
 * basket-level coverage counts — so evaluation never has to re-derive (or
 * guess) whether the forecast was complete, or who produced it.
 */
export const basketPredictionEvent = ({
  id = null,
  rows = [],
  day = null,
  at = null,
  source = 'list-generation',
  rowPredictionIds = null,
  idFactory = null,
  book = null,
} = {}) => {
  const snapById = new Map(
    (Array.isArray(book) ? book : [])
      .filter((snap) => snap && snap.id != null)
      .map((snap) => [String(snap.id), snap]),
  );
  const safeRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && row.name)
    .map((row) => {
      const price = Math.round((Number(row.price) || 0) * 100) / 100;
      // Row provenance: an explicit stamp on the row wins (tests and
      // callers that know their own attribution), otherwise it is resolved
      // from the LIVE snapshot book ONCE, at freeze time — frozen with the
      // evidence, never re-derived at checkout.
      let provenance = spendProvenanceFrom(row.provenance);
      if (!provenance && row.id != null) {
        const snap = snapById.get(String(row.id));
        if (snap) {
          const status = provenanceStatusFor(snap);
          if (status.ok) provenance = spendProvenanceFrom(status.provenance);
        }
      }
      return {
        listItemId: row.id == null ? null : String(row.id),
        name: String(row.name),
        qty: row.qty == null ? null : String(row.qty),
        price,
        priceSource: row.priceSource == null ? 'unknown' : String(row.priceSource),
        // Row-level price availability (task: track price coverage): an
        // unknown price is NOT a valid £0 prediction — `priced` records
        // whether this row carried a real price when the basket was frozen.
        priced: price > 0,
        provenance,
      };
    });
  const pricedRows = safeRows.filter((row) => row.priced).length;
  const totalRows = safeRows.length;
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
    // Price coverage, stored ON the freeze (task: track price coverage):
    // strict spend accuracy can require 100% coverage for evaluated rows
    // without re-deriving anything from the current list.
    totalRows,
    pricedRows,
    unpricedRows: totalRows - pricedRows,
    priceCoverage: totalRows ? Math.round((pricedRows / totalRows) * 100) / 100 : 0,
    // Spend provenance rollup (task: add spend provenance).
    provenance: basketProvenanceRollup(safeRows),
    source: String(source || 'list-generation'),
    day: day == null ? null : String(day).slice(0, 10),
    // BOTH time shapes (task: strong spend provenance timestamps): the day
    // for day-level gates, the precise millisecond for predictionAt <=
    // purchaseAt chronology proofs.
    at: at || Date.now(),
  };
};

export const SUPPORTED_BASKET_SCHEMA_VERSIONS = [1, basketVersion];
export const BASKET_SCHEMA_REJECTION_REASONS = {
  MALFORMED: 'malformed-basket-prediction',
  UNKNOWN: 'unsupported-basket-prediction-schema',
};

/**
 * Version gate for stored basket predictions — named reasons, never guesses.
 * v1 (legacy, deliberate): rows carry price/priceSource but no provenance or
 * coverage — handled at evaluation time via the shop's FROZEN snapshots;
 * v2 (current): provenance + coverage ride the freeze itself. Unknown or
 * malformed versions are rejected with named reasons.
 */
export const basketSchemaStatus = (record) => {
  if (!record || typeof record !== 'object') return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.MALFORMED };
  const raw = record.schemaVersion;
  if (raw == null) return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.MALFORMED };
  const version = Number(raw);
  if (!Number.isInteger(version)) return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.MALFORMED };
  if (!SUPPORTED_BASKET_SCHEMA_VERSIONS.includes(version)) {
    return { ok: false, reason: BASKET_SCHEMA_REJECTION_REASONS.UNKNOWN };
  }
  return { ok: true, version, legacy: version < basketVersion };
};

// ---------------------------------------------------------------------------
// Freeze lifecycle: a displayed spend prediction must describe the basket
// NOW shown. New freezes supersede the old one in the same write; a material
// change with no trustworthy new forecast EXPLICITLY invalidates the prior
// freeze rather than letting checkout copy a stale basket.
// ---------------------------------------------------------------------------

/** Active (never invalidated) scoreable freezes, newest first. */
export const activeBasketFreezes = (book = []) => (Array.isArray(book) ? book : [])
  .filter((bp) => bp && typeof bp === 'object' && !bp.invalidated)
  .filter((bp) => basketSchemaStatus(bp).ok)
  .filter((bp) => Number(bp.predicted) > 0)
  .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));

/**
 * Stamp the newest ACTIVE freeze invalidated (named reason). The freeze
 * itself is never deleted — it stays as historical evidence — but checkout
 * and evaluation skip invalidated freezes: it no longer describes a basket
 * that exists.
 */
export const invalidateBasketFreeze = (book = [], { reason = 'superseded', day = null, at = null } = {}) => {
  const list = Array.isArray(book) ? book : [];
  const latest = activeBasketFreezes(list)[0];
  if (!latest) return list;
  const stamp = { reason: String(reason), day: day == null ? null : String(day).slice(0, 10), at: at || Date.now() };
  return list.map((bp) => (bp === latest ? { ...bp, invalidated: stamp } : bp));
};

/**
 * Append a fresh freeze AND invalidate the previously shown one in the same
 * write: the old freeze remains historical evidence but must never be
 * handed to checkout as the prediction for the new basket.
 */
export const appendBasketFreeze = ({ book = [], event = null, reason = 'superseded-by-newer-freeze' } = {}) => {
  if (!event) return Array.isArray(book) ? book : [];
  const list = Array.isArray(book) ? book : [];
  const invalidated = invalidateBasketFreeze(list, { reason, day: event.day ?? null, at: event.at ?? null });
  return [...invalidated, event].slice(-200);
};

/**
 * Refresh the basket freeze after ANY material list change (task: every
 * material list-price change freezes a new basket):
 *
 *   - the shown basket still has a trustworthy forecast (rows with real
 *     prices summing above zero) → freeze a new prediction over the CURRENT
 *     rows, superseding the old one;
 *   - no trustworthy forecast exists (empty basket / nothing priced) → do
 *     NOT freeze merely because the list changed; explicitly invalidate the
 *     prior freeze instead, because it describes rows no longer shown.
 *
 * `requirePrev` (removal paths): with no prior freeze there is no displayed
 * spend prediction to refresh or invalidate — do nothing, rather than
 * inventing a freeze because a row was removed.
 */
export const refreshBasketFreeze = ({
  state = {},
  nextList = [],
  source = 'list-generation',
  day = null,
  requirePrev = false,
} = {}) => {
  const book = Array.isArray(state.basketPredictions) ? state.basketPredictions : [];
  const prev = activeBasketFreezes(book)[0] || null;
  if (requirePrev && !prev) return book;
  const rows = Array.isArray(nextList) ? nextList : [];
  const total = Math.round(rows.reduce((sum, row) => sum + (Number(row?.price) || 0), 0) * 100) / 100;
  const stampDay = day ?? state.day ?? null;
  if (rows.length && total > 0) {
    return appendBasketFreeze({
      book,
      event: basketPredictionEvent({
        rows,
        day: stampDay,
        source,
        rowPredictionIds: rows.map((row) => row.id).filter((rid) => rid != null),
        book: state.shoppingPredictions || null,
      }),
      reason: `${source}-superseded`,
    });
  }
  if (prev) {
    return invalidateBasketFreeze(book, { reason: 'no-trustworthy-forecast-after-change', day: stampDay });
  }
  return book;
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
    .filter((bp) => bp && typeof bp === 'object' && !bp.invalidated)
    .filter((bp) => basketSchemaStatus(bp).ok)
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
