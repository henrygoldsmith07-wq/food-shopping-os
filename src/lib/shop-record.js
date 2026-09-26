/**
 * The one purchase-recording shape (extracted from shopping-predictions.js
 * to keep each module inside the 500-line boundary; re-exported there so
 * every import path stays stable).
 *
 * Both sanctioned paths — `recordShop`'s checked-rows flow and the
 * `purchaseIngredients` domain command — build the shop record here, so
 * every shop carries the same prediction metadata and evaluation never
 * meets a shop it cannot read.
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
 *   — substitution lineage;  `schemaVersion` — the frozen-evidence schema;
 *   `provenance` / `evaluableForPredictionAccuracy` — who produced the
 *   quantity, frozen at prediction time and carried through untouched.
 *
 * SPEND PREDICTIONS ARE FROZEN BEFORE THE TILL (task: freeze spend
 * predictions when shown): the shop copies the basket prediction that was
 * frozen when the list was generated or repriced — `basketPredictionId`,
 * `predictedAt`, total, per-row prices and row-prediction ids, verbatim. If
 * no genuine pre-purchase freeze exists, `predicted` is null and
 * `spendPrediction` says so: evaluation EXCLUDES the shop from spend
 * accuracy rather than reconstructing a prediction at checkout.
 *
 * The bought rows are stamped with `subjectKey` too: the OUTCOME side of the
 * comparison is frozen at the same moment, so a later alias lesson cannot
 * re-describe what was actually purchased.
 *
 * Snapshots that fail the canonical gate are NOT frozen silently: the record
 * carries `predictionRejections` naming the row and the gate's reason, so
 * evaluation can report why a row is unscoreable instead of guessing.
 *
 * `items` are the writer's final item rows (the writer keeps shaping them).
 */
import { canonicalName } from './aliases.js';
import {
  SNAPSHOT_SCHEMA_VERSION,
  validatePredictionSnapshotWithReason,
} from './shopping-predictions.js';
import { basketSchemaStatus, basketProvenanceRollup, evaluableForPredictionAccuracy, provenanceStatusFor } from './prediction-evidence.js';

/**
 * Find the pre-purchase basket prediction to copy onto the shop record.
 * The freeze must pass the schema gate, carry a positive total, and have
 * been frozen on or before the purchase day. Matching, most-specific first:
 *
 *   - exact row-id match   → the freeze is copied VERBATIM;
 *   - row-subset match     → every bought prediction id sits inside the
 *     freeze, so the copy uses the freeze's own PER-ROW frozen prices for
 *     the bought rows (still frozen data — never current list prices);
 *   - no row identity      → the most recent valid freeze shown on or
 *     before the purchase day is the standing pre-purchase prediction.
 *
 * The result records HOW it matched (`matchedBy`) so the evidence says what
 * it proved. No honest match → null: spend accuracy excludes the shop.
 */
const preTillBasket = ({ basketPredictions, rowPredictionIds, day }) => {
  const stamped = String(day || '').slice(0, 10);
  const candidates = (Array.isArray(basketPredictions) ? basketPredictions : [])
    .filter((bp) => bp && typeof bp === 'object' && !bp.invalidated && basketSchemaStatus(bp).ok)
    .filter((bp) => Number(bp.predicted) > 0)
    .filter((bp) => !stamped || bp.day == null || bp.day <= stamped)
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  const want = (rowPredictionIds || []).map((rid) => String(rid)).filter(Boolean);
  if (want.length) {
    for (const candidate of candidates) {
      const have = new Set((candidate.rowPredictionIds || []).map((rid) => String(rid)));
      if (!want.every((rid) => have.has(rid))) continue;
      if (have.size === want.length) return { basket: candidate, matchedBy: 'row-ids' };
      const rowsById = new Map((candidate.rows || []).map((row) => [String(row.listItemId), row]));
      const subsetTotal = Math.round(
        want.reduce((sum, rid) => sum + (Number(rowsById.get(rid)?.price) || 0), 0) * 100,
      ) / 100;
      if (subsetTotal > 0) {
        // TRUE SUBSET EVIDENCE (task: fix subset freeze metadata): the
        // predicted total, the rows, the row-prediction ids and the coverage
        // metadata ALL describe the exact bought subset — never a subset
        // total carrying £10 of full-basket metadata. Ids in the subset with
        // no frozen price row stay listed (they are unpriced evidence, which
        // evaluation names and excludes rather than scoring as £0).
        const subsetRows = want.map((rid) => rowsById.get(rid)).filter(Boolean);
        const subsetPriced = subsetRows.filter((row) => Number(row?.price) > 0).length;
        return {
          basket: {
            ...candidate,
            predicted: subsetTotal,
            rows: subsetRows,
            rowPredictionIds: want,
            totalRows: subsetRows.length,
            pricedRows: subsetPriced,
            unpricedRows: subsetRows.length - subsetPriced,
            priceCoverage: subsetRows.length
              ? Math.round((subsetPriced / subsetRows.length) * 100) / 100
              : 0,
            provenance: basketProvenanceRollup(subsetRows),
            subsetOf: candidate.id ?? null,
          },
          matchedBy: 'row-subset',
        };
      }
      return null; // ids matched but the freeze carries no priced rows
    }
    return null;
  }
  const latest = candidates[0];
  return latest ? { basket: latest, matchedBy: 'day' } : null;
};

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
    // Provenance rides the freeze verbatim (who produced the quantity was
    // decided when the snapshot was written); absent provenance on a legacy
    // snapshot is resolved here, ONCE, and stamped as a freeze-time decision.
    const legacyProvenance = verdict.snapshot.legacy && snap.provenance == null;
    const status = legacyProvenance
      ? provenanceStatusFor(snap)
      : { provenance: snap.provenance, evaluable: evaluableForPredictionAccuracy(snap.provenance) };
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
      // Provenance, frozen with the evidence.
      provenance: status.provenance,
      evaluableForPredictionAccuracy: Boolean(status.evaluable),
      ...(legacyProvenance ? { provenanceResolvedAt: 'freeze-time-legacy' } : {}),
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
  // THE SPEND PREDICTION: the pre-till freeze, copied verbatim. No freeze →
  // null `predicted` — evaluation excludes the shop instead of reconstructing.
  const boughtPredictionIds = predictions
    .filter((p) => p.evaluableForPredictionAccuracy)
    .map((p) => p.predictionId);
  const frozenMatch = predictedCost != null && Number.isFinite(Number(predictedCost))
    ? null // an explicit writer-provided cost is a deliberate legacy path, not a freeze
    : preTillBasket({ basketPredictions: state.basketPredictions, rowPredictionIds: boughtPredictionIds, day });
  const frozenBasket = frozenMatch?.basket || null;
  // Coverage backfill: a legacy v1 freeze has no stored coverage counts —
  // derive them from ITS OWN frozen rows (still frozen data, not the list).
  const coverageOf = (basket) => {
    const rows = Array.isArray(basket?.rows) ? basket.rows : [];
    const totalRows = Number.isFinite(Number(basket?.totalRows)) ? Number(basket.totalRows) : rows.length;
    const pricedRows = Number.isFinite(Number(basket?.pricedRows))
      ? Number(basket.pricedRows)
      : rows.filter((row) => Number(row?.price) > 0).length;
    return {
      totalRows,
      pricedRows,
      unpricedRows: Math.max(0, totalRows - pricedRows),
      priceCoverage: totalRows ? Math.round((pricedRows / totalRows) * 100) / 100 : 0,
    };
  };
  const spendPrediction = frozenBasket
    ? {
      basketPredictionId: frozenBasket.id,
      predictedAt: frozenBasket.day == null ? null : frozenBasket.day,
      // Precise chronology (task: strong spend provenance timestamps): the
      // freeze's millisecond stamp rides the record so evaluation can prove
      // predictionAt <= purchaseAt whenever both sides carry precise stamps.
      predictedAtMs: Number.isFinite(Number(frozenBasket.at)) ? Number(frozenBasket.at) : null,
      predictedTotal: frozenBasket.predicted,
      rows: frozenBasket.rows,
      priceSource: frozenBasket.source || 'list-generation',
      rowPredictionIds: frozenBasket.rowPredictionIds,
      schemaVersion: frozenBasket.schemaVersion,
      matchedBy: frozenMatch.matchedBy,
      // Spend provenance + price coverage, copied with the evidence.
      provenance: frozenBasket.provenance ?? basketProvenanceRollup(frozenBasket.rows ?? []),
      ...coverageOf(frozenBasket),
      ...(frozenBasket.subsetOf ? { subsetOf: frozenBasket.subsetOf } : {}),
    }
    : null;
  return {
    id,
    date: String(day || '').slice(0, 10),
    // Purchase timestamp (task: strong spend provenance timestamps) — lets
    // evaluation prove predictionAt <= purchaseAt to the millisecond.
    purchasedAt: Date.now(),
    store: store || 'Unnamed shop',
    total: Math.round((Number(total) || 0) * 100) / 100,
    predicted: frozenBasket ? frozenBasket.predicted : null,
    spendPrediction,
    items: stampedItems,
    predictions: Object.freeze(predictions),
    predictionRejections: Object.freeze(predictionRejections),
  };
};
