/**
 * Record metrics — the money side of "what Forq predicted vs what really
 * happened", split out of spend-metrics.js (which keeps the quantity
 * pipeline) so each module stays within the 500-line boundary.
 *
 *   - spendAccuracy: could the list be trusted? The basket prediction,
 *     snapshotted when the shop was generated, against the total actually
 *     recorded at the till.
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
import { basketSchemaStatus } from './prediction-evidence.js';

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
 * Predicted vs actual spend: the basket prediction FROZEN when the list was
 * generated or materially repriced against the total actually recorded at
 * the till. Reports absolute error, percentage error, signed bias (positive
 * = Forq under-predicts on average), the sample count and a confidence
 * grade.
 *
 * Only a GENUINE PRE-PURCHASE prediction is scored (task: freeze spend
 * predictions when shown): the shop's copied `spendPrediction` freeze —
 * `basketPredictionId`, `predictedAt`, total, per-row prices — must exist,
 * pass the basket schema gate, and predate the shop day. A shop without a
 * real pre-purchase freeze (recorded before freezing existed, a zero-priced
 * basket, or a checkout-time reconstruction) is honestly EXCLUDED — and
 * counted, with the reason, so the sample size can never silently flatter
 * itself. Nothing is reconstructed after the fact.
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
    scored.push({ predicted, actual: total, basketPredictionId: freeze.basketPredictionId });
  }
  const samples = scored.length;
  if (!samples) {
    return {
      ...metric(null, { assumption: 'No shops with a genuine pre-purchase basket prediction yet — spend predictions are frozen when the list is generated or repriced; shops recorded before freezing existed are excluded, not reconstructed.' }),
      samples: 0,
      samplesByDim: { mass: 0, volume: 0, count: 0 },
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
      assumption: 'Predicted basket cost (frozen when the list was generated or materially repriced, copied to the shop verbatim at checkout) vs the recorded shop total; mean percentage error, signed bias is the trend. Shops without a genuine pre-purchase freeze are excluded, never reconstructed.',
    }),
    absoluteError: Math.round(absError * 100) / 100,
    percentageError: Math.round(pctError * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    samples,
    samplesByDim: { mass: 0, volume: 0, count: 0 },
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
