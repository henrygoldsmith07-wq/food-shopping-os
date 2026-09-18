/**
 * Spend and quantity metrics — what Forq predicted vs what really happened.
 *
 * Three questions that must never be conflated:
 *
 *   - spendAccuracy: could the list be trusted? The basket prediction,
 *     snapshotted when the shop was generated, against the total actually
 *     recorded at the till.
 *   - basketReconciliation: is the record clean? Sum of itemised receipt
 *     lines vs the declared total — data quality, not prediction quality.
 *   - shoppingQuantityError: did the household buy what the plan asked?
 *     Relative error through the shared measurement engine, one normalized
 *     scale at a time, against the PREDICTION SNAPSHOTS the list builder
 *     wrote when it showed the household its quantities — never a
 *     reconstruction from recipe ingredients after the fact.
 *
 * Every metric carries { value, confidence, evidence, assumption }, and
 * reports honest silence (null) where the data cannot support a number.
 */

import { dayStamp } from './kitchen-dates.js';
import { parseQuantity, convert } from './measure.js';
import { canonicalName } from './aliases.js';

const metric = (value, { confidence = 'none', evidence = 0, assumption = '' } = {}) => ({
  value, confidence, evidence, assumption,
});

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);

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
 * Predicted vs actual spend: the basket prediction snapshotted when the
 * shop was generated against the total actually recorded at the till.
 * Reports absolute error, percentage error, signed bias (positive = Forq
 * under-predicts on average), the sample count and a confidence grade.
 *
 * Only a VALID prediction is scored: the stored snapshot must exist and be
 * a number greater than zero. Shops without a snapshot (recorded before
 * snapshots existed), zero or unpriced baskets, and malformed totals or
 * predictions are honestly EXCLUDED — and counted, with the reason, so the
 * sample size can never silently flatter itself. Nothing is reconstructed
 * after the fact.
 *
 * Item-total reconciliation is a DIFFERENT question (data quality of the
 * record, not prediction quality) and lives in basketReconciliation below.
 */
export const spendAccuracy = (state = {}, { today = dayStamp() } = {}) => {
  void today;
  const excluded = [];
  const scored = [];
  for (const shop of Array.isArray(state.shops) ? state.shops : []) {
    const total = Number(shop?.total);
    const predicted = Number(shop?.predicted);
    if (shop?.total == null || !Number.isFinite(total)) {
      excluded.push({ reason: 'malformed-total', shopId: shop?.id || null });
      continue;
    }
    if (total <= 0) {
      excluded.push({ reason: 'zero-total', shopId: shop?.id || null });
      continue;
    }
    if (shop?.predicted == null || !Number.isFinite(predicted)) {
      excluded.push({ reason: 'missing-or-invalid-prediction', shopId: shop?.id || null });
      continue;
    }
    if (predicted <= 0) {
      excluded.push({ reason: 'zero-prediction', shopId: shop?.id || null });
      continue;
    }
    scored.push({ predicted, actual: total });
  }
  const samples = scored.length;
  if (!samples) {
    return {
      ...metric(null, { assumption: 'No shops with a valid stored basket prediction yet — snapshots begin with the first shop recorded after this metric existed.' }),
      samples: 0,
      excluded,
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
      assumption: 'Predicted basket cost (snapshotted when the shop was generated) vs the recorded shop total; mean percentage error, signed bias is the trend.',
    }),
    absoluteError: Math.round(absError * 100) / 100,
    percentageError: Math.round(pctError * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    samples,
    excluded,
  };
};

/**
 * Basket reconciliation — a DATA-QUALITY metric, not a prediction: does the
 * sum of the recorded item prices match the declared shop total? Divergence
 * means receipts were partial or the total was mistyped; it says nothing
 * about how good Forq's predictions are.
 */
export const basketReconciliation = (state = {}, { today = dayStamp() } = {}) => {
  void today;
  const shops = (Array.isArray(state.shops) ? state.shops : [])
    .filter((s) => Number(s?.total) > 0);
  const withItems = shops.filter((s) => (Array.isArray(s.items) ? s.items : []).some((i) => Number(i?.price) > 0));
  if (!withItems.length) {
    return metric(null, { assumption: 'No itemised shops to reconcile yet.' });
  }
  const gaps = withItems.map((s) => {
    const itemsTotal = (Array.isArray(s.items) ? s.items : []).reduce((sum, i) => sum + (Number(i?.price) || 0), 0);
    return Math.abs(Number(s.total) - itemsTotal) / Math.max(1, Number(s.total));
  });
  return metric(Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100, {
    confidence: withItems.length >= 8 ? 'high' : withItems.length >= 3 ? 'medium' : 'low',
    evidence: withItems.length,
    assumption: 'Sum of recorded item prices vs the declared shop total — record quality, not prediction quality.',
  });
};

/**
 * Shopping quantity error — ONE normalized measurement: the relative gap
 * between the quantity Forq actually displayed on the list and what was
 * actually bought, computed through the shared measurement engine.
 *
 * The predicted side comes from prediction snapshots, in priority order:
 *
 *   1. the shop record's own frozen copies (`shop.predictions`) — captured
 *      from the list at the moment of purchase, the exact advice the till
 *      run answered;
 *   2. the live prediction book (`state.shoppingPredictions`), which the
 *      list builder refreshes in the same write that shows the list.
 *
 * Both sides are parsed (measure.js), brought onto the same scale — mass
 * with mass, volume with volume, counts with counts — and the error is
 * reported as a fraction of the predicted amount. A gram gap and a tin gap
 * are never added together raw, and an incompatible pair is honestly
 * EXCLUDED (and counted) rather than forced into comparability. Recipe
 * ingredients are never consulted: the recommendation is what the snapshot
 * says the household was shown, not what a recipe line implies.
 *
 * Direct household corrections (predictionCorrections, type 'shopping-qty')
 * contribute the same relative measure where both sides are numeric.
 *
 * Only shops inside RECENT_SHOP_WINDOW_DAYS are scored: a shop from months
 * ago measures a prediction rule the household has long since moved past —
 * and it keeps this metric, which runs on every derive, off unbounded
 * history.
 */
export const RECENT_SHOP_WINDOW_DAYS = 56;

const parseMemo = new Map();
const parseOnce = (qty, ingredient) => {
  const key = `${ingredient}\u0000${qty}`;
  let parsed = parseMemo.get(key);
  if (parsed === undefined) {
    parsed = parseQuantity(qty, { ingredient });
    if (parseMemo.size > 2000) parseMemo.clear(); // bounded: quantities repeat heavily
    parseMemo.set(key, parsed ?? null);
  }
  return parsed;
};

export const shoppingQuantityError = (state = {}, { today = dayStamp() } = {}) => {
  void today;
  const errors = [];

  // Direct corrections: the household told us the number was wrong.
  const corrections = (Array.isArray(state.predictionCorrections) ? state.predictionCorrections : [])
    .filter((c) => c?.type === 'prediction_correction' && c.predictionType === 'shopping-qty');
  for (const c of corrections) {
    const predicted = Number(c.predicted);
    const actual = Number(c.actual);
    if (!Number.isFinite(predicted) || !Number.isFinite(actual) || predicted <= 0) continue;
    errors.push(Math.abs(actual - predicted) / predicted);
  }

  // Snapshot-sourced comparisons. Frozen shop copies win; the live book is
  // the fallback for rows a shop consumed before freezing existed.
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const book = Array.isArray(state.shoppingPredictions) ? state.shoppingPredictions : [];
  const newest = (a, b) => (!a || (b && Number(b.at || 0) > Number(a.at || 0)) ? b : a);
  const byKey = new Map();
  for (const p of book) {
    if (!p?.predictionKey || p?.qty == null || p?.qty === '') continue;
    const prev = byKey.get(p.predictionKey);
    if (String(p.at || 0) >= String(prev?.at || 0)) byKey.set(p.predictionKey, p);
  }
  const excluded = [];
  const todayNoon = new Date(`${dayStamp()}T12:00:00`);
  for (const shop of shops) {
    const day = String(shop?.date || '').slice(0, 10);
    const age = /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? Math.abs(Math.round((new Date(`${day}T12:00:00`) - todayNoon) / 86400000))
      : null;
    if (age != null && age > RECENT_SHOP_WINDOW_DAYS) continue;
    const frozen = new Map((Array.isArray(shop?.predictions) ? shop.predictions : []).map((p) => [p.id, p]));
    for (const item of Array.isArray(shop?.items) ? shop.items : []) {
      if (!item?.name) continue;
      if (item?.qty == null || item?.qty === '') {
        excluded.push({ reason: 'unrecorded-purchase-quantity', name: item.name });
        continue;
      }
      const key = canonicalName(item.name) || String(item.name).trim().toLowerCase();
      // A row whose id matches no snapshot is the household's own hand-typed
      // line, not Forq's advice — nothing to score, skipped silently.
      if (item.id && !frozen.has(item.id) && !byKey.has(key)) continue;
      const prediction = (item.id && frozen.get(item.id)) || null;
      const predictedQty = prediction?.qty ?? byKey.get(key)?.qty ?? null;
      if (predictedQty == null) {
        excluded.push({ reason: 'no-prediction-snapshot', name: item.name });
        continue;
      }
      const planned = parseOnce(predictedQty, item.name);
      if (!planned || !(planned.amount > 0)) {
        excluded.push({ reason: 'unreadable-predicted-qty', name: item.name, qty: predictedQty });
        continue;
      }
      let bought = parseOnce(item.qty, item.name);
      if (!bought || !(bought.amount > 0)) {
        excluded.push({ reason: 'unreadable-purchased-qty', name: item.name, qty: item.qty });
        continue;
      }
      if (bought.dim !== planned.dim) {
        // Different scale: only the engine's own density table may bridge
        // it (e.g. "1 tin" → 400 ml → 392 g of coconut milk). No bridge:
        // excluded and counted, never guessed into comparability.
        const converted = convert(bought, planned.dim, { ingredient: item.name });
        if (!converted) {
          excluded.push({ reason: 'incompatible-dimensions', name: item.name, predicted: planned.dim, purchased: bought.dim });
          continue;
        }
        bought = converted;
      }
      errors.push({
        relative: Math.abs(bought.amount - planned.amount) / planned.amount,
        signed: (bought.amount - planned.amount) / planned.amount,
        absolute: Math.abs(bought.amount - planned.amount),
        dim: planned.dim,
      });
    }
  }

  const samples = errors.length;
  const meanOf = (pick) => (samples ? errors.reduce((s, e) => s + pick(e), 0) / samples : null);
  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const value = round(meanOf((e) => e.relative));
  const signedBias = round(meanOf((e) => e.signed));
  // Absolute error only means something within one scale — reported per
  // dimension (mean grams, mean tins…), never summed across them.
  const absoluteErrorsByDim = Object.fromEntries(
    ['mass', 'volume', 'count']
      .map((dim) => [dim, round(meanOf((e) => (e.dim === dim ? e.absolute : null)))])
      .filter(([, v]) => v != null),
  );
  return {
    ...metric(value, {
      confidence: samples >= 10 ? 'high' : samples >= 4 ? 'medium' : samples > 0 ? 'low' : 'none',
      evidence: samples,
      assumption: 'Relative error |bought − predicted| ÷ predicted, on a shared scale via the measurement engine, against the prediction snapshots shown on the list; incompatible quantities are excluded and counted, plus direct household corrections.',
    }),
    samples,
    signedBias,
    absoluteErrorsByDim,
    excluded,
  };
};
