/**
 * Record metrics — the money side of "what Forq predicted vs what really
 * happened", split out of spend-metrics.js (which keeps the quantity
 * pipeline) so each module stays within the 500-line boundary.
 *
 *   - spendAccuracy: could the list be trusted? The basket prediction,
 *     frozen when the list was generated or repriced, against the receipt
 *     subtotal for EXACTLY the rows that prediction covered — row-exact
 *     evidence sets on both sides (evaluatedRowIds / predictedSubtotal /
 *     actualSubtotal / coverageMode / matchedBy per observation), spend
 *     provenance per row, price coverage per freeze, and precise
 *     predictionAt <= purchaseAt chronology.
 *   - basketReconciliation: is the record clean? Sum of itemised receipt
 *     lines vs the declared total — data quality, not prediction quality.
 *
 * Every metric carries { value, confidence, evidence, assumption } plus the
 * standardised diagnostics block — samples, the full excluded list with
 * reason counts, and the evaluation window — and reports honest silence
 * (null) where the data cannot support a number. Nothing is filtered
 * silently: every dropped record is named and counted.
 */

import { dayStamp } from './kitchen-dates.js';
import {
  evaluationToday,
  gateRecordDay,
} from './evaluation-time.js';
import {
  basketSchemaStatus,
  provenanceStatusFor,
  spendProvenanceFrom,
  SPEND_PROVENANCE,
} from './prediction-evidence.js';

const metric = (value, { confidence = 'none', evidence = 0, assumption = '' } = {}) => ({
  value, confidence, evidence, assumption,
});

/**
 * Exclusion reason counts — the standard diagnostics block reports one entry
 * per excluded record AND a tally per reason, so nothing is ever filtered
 * silently and every drop is auditable.
 */
export const countReasons = (excluded = []) => (excluded || []).reduce((counts, e) => {
  if (e?.reason) counts[e.reason] = (counts[e.reason] || 0) + 1;
  return counts;
}, {});

/** The recency window shared by every dated accuracy metric (days). */
export const RECENT_SHOP_WINDOW_DAYS = 56;

/**
 * The predicted basket cost at the moment a shop was generated: the sum of
 * the list rows the household took to the till, each at the price it
 * carried on the list. Stored on the shop record as `predicted` when the
 * purchase is recorded, so "what we thought this would cost" is captured
 * BEFORE the receipt exists — the only honest way to score a prediction.
 */
export const snapshotCosts = (rows = []) => {
  const items = Array.isArray(rows) ? rows : [];
  return Math.round(items.reduce((sum, row) => sum + (Number(row?.price) || 0), 0) * 100) / 100;
};

/**
 * Predicted vs actual spend — ROW-EXACT (tasks: make spend prediction and
 * actual spend cover exactly the same rows, add spend provenance, track
 * price coverage).
 *
 * For every scored shop the metric PROVES:
 *
 *   - which exact rows it priced (the freeze's `rows`, spend-provenance
 *     stamped — only `forq` rows are evaluated);
 *   - when it priced them (`day` + precise `at`, with
 *     predictionAt <= purchaseAt where both stamps exist);
 *   - how complete the price prediction was (coverage counts on the freeze;
 *     unknown prices are NEVER £0 forecast errors — they exclude);
 *   - which exact purchased rows those predictions correspond to
 *     (`evaluatedRowIds`, matched by row id — never by name);
 *   - that the actual subtotal covers exactly the same evidence set
 *     (`actualSubtotal` = Σ receipt prices OVER `evaluatedRowIds`, never the
 *     full receipt total).
 *
 * Every scored observation carries { evaluatedRowIds, predictedSubtotal,
 * actualSubtotal, coverageMode, matchedBy, priceCoverage, chronologyProof }.
 * A receipt containing manual/unpredicted extras scores only the Forq
 * subset (`coverageMode: 'subset'`) — never a predicted subset against the
 * full receipt total. Everything unprovable is EXCLUDED with a named reason:
 * no freeze, manual-only basket, unattributable provenance, unpriced
 * prediction rows, missing receipt prices, postdating timestamps.
 *
 * Only a GENUINE PRE-PURCHASE freeze is scored: the shop's copied
 * `spendPrediction` must exist, pass the basket schema gate, and predate the
 * shop. Nothing is reconstructed after the fact.
 *
 * Item-total reconciliation is a DIFFERENT question (data quality of the
 * record, not prediction quality) and lives in basketReconciliation below.
 */
export const spendAccuracy = (state = {}, { today = dayStamp() } = {}) => {
  // The ONE clock (see evaluation-time.js): an explicitly malformed `today`
  // means no usable evaluation frame — dated shops cannot be placed in time
  // and are excluded rather than scored against the system date.
  const todayStamp = evaluationToday({ today });
  const excluded = [];
  const scored = [];
  for (const shop of Array.isArray(state.shops) ? state.shops : []) {
    const shopId = shop?.id || null;
    const gate = gateRecordDay(shop?.date, todayStamp, { windowDays: RECENT_SHOP_WINDOW_DAYS });
    if (gate !== 'ok') {
      excluded.push({
        reason: gate === 'malformed-day' ? 'malformed-shop-date'
          : gate === 'future' ? 'future-shop'
          : gate === 'no-evaluation-today' ? 'invalid-evaluation-today'
          : 'outside-evaluation-window',
        shopId,
      });
      continue;
    }
    const total = Number(shop?.total);
    if (shop?.total == null || !Number.isFinite(total)) {
      excluded.push({ reason: 'malformed-total', shopId });
      continue;
    }
    if (total <= 0) {
      excluded.push({ reason: 'zero-total', shopId: shop?.id || null });
      continue;
    }
    // THE EVIDENCE BOUNDARY: the frozen pre-purchase basket prediction, or
    // nothing. `shop.predicted` alone is NOT evidence — it can be a checkout
    // reconstruction — so the freeze record must exist and validate.
    const freeze = shop?.spendPrediction || null;
    const schema = basketSchemaStatus(freeze);
    if (!schema.ok) {
      excluded.push({
        reason: freeze == null ? 'no-pre-purchase-spend-prediction' : schema.reason,
        shopId,
      });
      continue;
    }
    const predicted = Number(freeze.predictedTotal);
    if (!Number.isFinite(predicted) || predicted <= 0) {
      excluded.push({ reason: predicted <= 0 ? 'zero-prediction' : 'missing-or-invalid-prediction', shopId });
      continue;
    }
    // The freeze must PREDATE the purchase: a snapshot taken after the till
    // is not a prediction. (The shop-record builder enforces this too; the
    // metric re-checks so historical records cannot sneak past.)
    const shopDay = String(shop?.date || '').slice(0, 10);
    if (freeze.predictedAt && shopDay && freeze.predictedAt > shopDay) {
      excluded.push({ reason: 'spend-prediction-postdates-shop', shopId });
      continue;
    }
    // PRECISE CHRONOLOGY (task: require predictionAt <= purchaseAt): when
    // BOTH sides carry precise millisecond stamps the ordering must be
    // provable to the millisecond — a freeze stamped after the purchase is
    // rejected, never assumed. Where only day-level evidence exists (legacy
    // records), the day gate above IS the proof, labelled as such in the
    // observation's chronologyProof — never silently upgraded.
    const purchaseAtMs = Number.isFinite(Number(shop?.purchasedAt)) ? Number(shop.purchasedAt) : null;
    const predictedAtMs = Number.isFinite(Number(freeze.predictedAtMs)) ? Number(freeze.predictedAtMs) : null;
    if (predictedAtMs != null && purchaseAtMs != null && predictedAtMs > purchaseAtMs) {
      excluded.push({ reason: 'spend-prediction-postdates-purchase', shopId });
      continue;
    }

    // ---- ROW-EXACT PHASE --------------------------------------------------
    // Prove predicted row set == actual evaluated row set. Both sides are
    // built from `evaluatedRowIds`; the actual side is the receipt subtotal
    // OVER THOSE ROWS ONLY — never the full receipt total.
    const freezeRows = (Array.isArray(freeze.rows) ? freeze.rows : [])
      .filter((row) => row && typeof row === 'object');
    if (!freezeRows.length) {
      excluded.push({ reason: 'no-prediction-rows', shopId });
      continue;
    }
    const allItems = (Array.isArray(shop.items) ? shop.items : [])
      .filter((item) => item && typeof item === 'object');
    const receiptRows = allItems.filter((item) => item.id != null);
    if (!receiptRows.length) {
      // Without row identity the receipt cannot be proven to cover exactly
      // the predicted rows — excluded, never name-matched or assumed.
      excluded.push({ reason: 'unidentified-receipt-rows', shopId });
      continue;
    }
    const receiptById = new Map(receiptRows.map((item) => [String(item.id), item]));
    // Row spend-provenance: the freeze's own stamp (v2) when present,
    // otherwise the shop's FROZEN prediction snapshots (checkout-time
    // evidence). The live book is never consulted for an old shop.
    const shopSnapById = new Map(
      (Array.isArray(shop.predictions) ? shop.predictions : [])
        .filter((p) => p && (p.predictionId ?? p.id) != null)
        .map((p) => [String(p.predictionId ?? p.id), p]),
    );
    const provenanceOfRow = (row) => {
      const own = spendProvenanceFrom(row?.provenance);
      if (own) return own;
      const snap = row?.listItemId != null ? shopSnapById.get(String(row.listItemId)) : null;
      if (!snap) return null;
      const status = provenanceStatusFor(snap);
      return status.ok ? spendProvenanceFrom(status.provenance) : null;
    };
    const attributed = freezeRows.map((row) => ({ row, provenance: provenanceOfRow(row) }));
    const forqRows = attributed.filter((entry) => entry.provenance === SPEND_PROVENANCE.FORQ);
    if (!forqRows.length) {
      // A manual-only basket must never enter Forq spend accuracy; a basket
      // whose pricer cannot be attributed at all is excluded with its own
      // named reason — never defaulted into Forq's numbers.
      const allKnown = attributed.every((entry) => entry.provenance != null);
      excluded.push({
        reason: allKnown ? 'manual-only-basket' : 'unattributable-row-provenance',
        shopId,
        freezeProvenance: freeze.provenance ?? null,
      });
      continue;
    }
    const notPurchased = [];
    const unpriced = [];
    const missingActual = [];
    const evaluatedRowIds = [];
    for (const { row } of forqRows) {
      const rid = row.listItemId != null ? String(row.listItemId) : null;
      const receipt = rid != null ? receiptById.get(rid) : null;
      if (!receipt) {
        // Predicted but not on this receipt: no outcome was observed for
        // that row — dropped from BOTH sides (row sets stay identical) and
        // counted, never scored as an unobserved saving.
        notPurchased.push(rid);
        continue;
      }
      const predictedPrice = Math.round((Number(row.price) || 0) * 100) / 100;
      if (!(predictedPrice > 0)) {
        // An unknown price is NOT a £0 forecast (task: never treat unknown
        // prices as £0 errors) — the shop is excluded, not scored.
        unpriced.push(rid);
        continue;
      }
      const actualPrice = Math.round((Number(receipt.price) || 0) * 100) / 100;
      if (!(actualPrice > 0)) {
        // The actual side cannot be proven for this row — exclude rather
        // than estimate the receipt price.
        missingActual.push(rid);
        continue;
      }
      evaluatedRowIds.push(rid);
    }
    if (unpriced.length) {
      for (const rid of unpriced) {
        excluded.push({ reason: 'unpriced-prediction-row', shopId, rowId: rid });
      }
      excluded.push({ reason: 'incomplete-price-coverage', shopId, unpricedRows: unpriced.length });
      continue;
    }
    if (missingActual.length) {
      for (const rid of missingActual) {
        excluded.push({ reason: 'missing-actual-row-price', shopId, rowId: rid });
      }
      continue;
    }
    if (!evaluatedRowIds.length) {
      excluded.push({
        reason: receiptRows.length ? 'no-forq-purchased-rows' : 'unidentified-receipt-rows',
        shopId,
        notPurchasedRows: notPurchased.length,
      });
      continue;
    }
    // THE TWO SUBTOTALS OVER THE SAME ROW SET — by construction identical
    // `evaluatedRowIds` on both sides.
    const evaluatedSet = new Set(evaluatedRowIds);
    const predictedSubtotal = Math.round(forqRows
      .filter(({ row }) => evaluatedSet.has(String(row.listItemId)))
      .reduce((sum, { row }) => sum + (Number(row.price) || 0), 0) * 100) / 100;
    const actualSubtotal = Math.round(evaluatedRowIds
      .reduce((sum, rid) => sum + (Number(receiptById.get(rid).price) || 0), 0) * 100) / 100;
    if (!(predictedSubtotal > 0) || !(actualSubtotal > 0)) {
      excluded.push({ reason: 'empty-evaluated-subtotal', shopId });
      continue;
    }
    const coverageMode = evaluatedRowIds.length === allItems.length ? 'full' : 'subset';
    const priceCoverage = Number.isFinite(Number(freeze.priceCoverage))
      ? Number(freeze.priceCoverage)
      : (freezeRows.length
        ? Math.round((freezeRows.filter((row) => Number(row?.price) > 0).length / freezeRows.length) * 100) / 100
        : 0);
    scored.push({
      predicted: predictedSubtotal,
      actual: actualSubtotal,
      basketPredictionId: freeze.basketPredictionId ?? null,
      // The proof (task: success condition) — exact rows, exact subtotals,
      // how they were matched, how complete the price prediction was, and
      // how chronology was established.
      evaluatedRowIds,
      predictedSubtotal,
      actualSubtotal,
      coverageMode,
      matchedBy: freeze.matchedBy ?? null,
      priceCoverage,
      provenance: freeze.provenance ?? null,
      chronologyProof: predictedAtMs != null && purchaseAtMs != null ? 'precise' : 'day-level',
      notPurchasedRows: notPurchased.length,
      unpredictedReceiptRows: Math.max(0, allItems.length - evaluatedRowIds.length),
    });
  }
  const samples = scored.length;
  if (!samples) {
    return {
      ...metric(null, { assumption: 'No shops with a genuine, row-exact pre-purchase basket prediction yet — spend predictions are frozen when the list is generated or repriced; shops recorded before freezing existed, manual-only baskets and shops whose predicted/actual row sets cannot be proven identical are excluded, not reconstructed.' }),
      samples: 0,
      samplesByDim: { mass: 0, volume: 0, count: 0 },
      observations: [],
      excluded,
      excludedReasons: countReasons(excluded),
      evaluationWindowDays: RECENT_SHOP_WINDOW_DAYS,
    };
  }
  const errors = scored.map(({ predicted, actual }) => ({
    abs: Math.abs(actual - predicted),
    pct: Math.abs(actual - predicted) / Math.max(0.01, predicted),
    signed: (actual - predicted) / Math.max(0.01, predicted),
  }));
  const absError = errors.reduce((s, e) => s + e.abs, 0) / samples;
  const pctError = errors.reduce((s, e) => s + e.pct, 0) / samples;
  const bias = errors.reduce((s, e) => s + e.signed, 0) / samples;
  const value = Math.round(pctError * 100) / 100;
  return {
    ...metric(value, {
      confidence: samples >= 8 ? 'high' : samples >= 3 ? 'medium' : 'low',
      evidence: samples,
      assumption: 'ROW-EXACT: predicted subtotal vs actual receipt subtotal OVER THE IDENTICAL evaluatedRowIds (provenance-stamped Forq rows, matched by row id, 100% price coverage on evaluated rows, freeze pre-dating the purchase). Manual/unpredicted receipt extras are never folded in; unknown prices never score as £0; anything unprovable is excluded with a named reason. Coverage, matchedBy and chronologyProof ride every observation.',
    }),
    absoluteError: Math.round(absError * 100) / 100,
    percentageError: Math.round(pctError * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    samples,
    samplesByDim: { mass: 0, volume: 0, count: 0 },
    // Per-shop proof: exact rows, exact subtotals, coverage, matching,
    // chronology (task: success condition for every scored sample).
    observations: scored,
    excluded,
    excludedReasons: countReasons(excluded),
    evaluationWindowDays: RECENT_SHOP_WINDOW_DAYS,
  };
};

/**
 * Basket reconciliation — a DATA-QUALITY metric, not a prediction: does the
 * sum of the recorded item prices match the declared shop total? Divergence
 * means receipts were partial or the total was mistyped; it says nothing
 * about how good Forq's predictions are.
 */
export const basketReconciliation = (state = {}, { today = dayStamp() } = {}) => {
  const todayStamp = evaluationToday({ today });
  const excluded = [];
  const withItems = [];
  for (const s of Array.isArray(state.shops) ? state.shops : []) {
    const shopId = s?.id || null;
    const gate = gateRecordDay(s?.date, todayStamp, { windowDays: RECENT_SHOP_WINDOW_DAYS });
    if (gate !== 'ok') {
      excluded.push({
        reason: gate === 'malformed-day' ? 'malformed-shop-date'
          : gate === 'future' ? 'future-shop'
          : gate === 'no-evaluation-today' ? 'invalid-evaluation-today'
          : 'outside-evaluation-window',
        shopId,
      });
      continue;
    }
    if (!(Number(s?.total) > 0)) {
      excluded.push({ reason: 'zero-total', shopId });
      continue;
    }
    if (!(Array.isArray(s.items) ? s.items : []).some((i) => Number(i?.price) > 0)) {
      excluded.push({ reason: 'no-itemised-prices', shopId });
      continue;
    }
    withItems.push(s);
  }
  if (!withItems.length) {
    return {
      ...metric(null, { assumption: 'No itemised shops to reconcile yet.' }),
      samples: 0,
      excluded,
      excludedReasons: countReasons(excluded),
      evaluationWindowDays: RECENT_SHOP_WINDOW_DAYS,
    };
  }
  const gaps = withItems.map((s) => {
    const itemsTotal = (Array.isArray(s.items) ? s.items : []).reduce((sum, i) => sum + (Number(i?.price) || 0), 0);
    return Math.abs(Number(s.total) - itemsTotal) / Math.max(1, Number(s.total));
  });
  return {
    ...metric(Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100, {
      confidence: withItems.length >= 8 ? 'high' : withItems.length >= 3 ? 'medium' : 'low',
      evidence: withItems.length,
      assumption: 'Sum of recorded item prices vs the declared shop total — record quality, not prediction quality.',
    }),
    samples: withItems.length,
    excluded,
    excludedReasons: countReasons(excluded),
    evaluationWindowDays: RECENT_SHOP_WINDOW_DAYS,
  };
};
