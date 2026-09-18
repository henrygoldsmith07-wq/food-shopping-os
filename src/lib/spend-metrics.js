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
 *     scale at a time.
 *
 * Every metric carries { value, confidence, evidence, assumption }, and
 * reports honest silence (null) where the data cannot support a number.
 */

import { dayStamp } from './kitchen-dates.js';
import { parseQuantity, convert } from './measure.js';

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
 * Shops without a snapshot — recorded before snapshots existed — are
 * honestly excluded, never reconstructed after the fact.
 *
 * Item-total reconciliation is a DIFFERENT question (data quality of the
 * record, not prediction quality) and lives in basketReconciliation below.
 */
export const spendAccuracy = (state = {}, { today = dayStamp() } = {}) => {
  void today;
  const shops = (Array.isArray(state.shops) ? state.shops : [])
    .filter((s) => Number(s?.total) > 0 && s?.predicted != null);
  const samples = shops.length;
  if (!samples) {
    return metric(null, { assumption: 'No shops with a stored basket prediction yet — snapshots begin with the first shop recorded after this metric existed.' });
  }
  const errors = shops.map((s) => {
    const predicted = Number(s.predicted) || 0;
    const actual = Number(s.total) || 0;
    return {
      abs: Math.abs(actual - predicted),
      pct: Math.abs(actual - predicted) / Math.max(0.01, predicted),
      signed: (actual - predicted) / Math.max(0.01, predicted),
    };
  });
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
 * between what the plan asked for and what was actually bought, computed
 * through the shared measurement engine. Both sides are parsed
 * (measure.js), brought onto the same scale — mass with mass, volume with
 * volume, counts with counts, density conversion only where the engine
 * itself vouches for it — and the error is reported as a fraction of the
 * planned amount. A gram gap and a tin gap are never added together raw,
 * and an incompatible pair (tins vs grams with no known density) is
 * honestly EXCLUDED rather than forced into comparability.
 *
 * Direct household corrections (predictionCorrections, type 'shopping-qty')
 * contribute the same relative measure where both sides are numeric.
 */
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

  // Observed: plan rows vs recorded purchase lines, same item, ±2 days.
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const purchased = [];
  for (const shop of shops) {
    for (const item of Array.isArray(shop?.items) ? shop.items : []) {
      if (item?.name && item?.qty != null) purchased.push({ name: String(item.name), qty: item.qty, date: String(shop.date || '').slice(0, 10) });
    }
  }
  const planRows = [];
  const plan = state.plan || {};
  const recipePool = (Array.isArray(state.myRecipes) ? state.myRecipes : [])
    .concat(Array.isArray(state.__allRecipes) ? state.__allRecipes : []);
  for (const [date, slots] of Object.entries(plan)) {
    for (const recipeId of Object.values(slots || {})) {
      const recipe = recipePool.find((r) => r?.id === recipeId);
      for (const ing of recipe?.ingredients || []) {
        planRows.push({ name: String(ing?.name || ing), qty: ing?.qty, date });
      }
    }
  }
  const norm = (s) => String(s || '').trim().toLowerCase();
  for (const row of planRows) {
    const planned = parseQuantity(row.qty, { ingredient: row.name });
    if (!planned || !(planned.amount > 0)) continue;
    const match = purchased.find((p) => norm(p.name) === norm(row.name)
      && Math.abs(daysBetween(p.date, row.date)) <= 2);
    if (!match) continue;
    let bought = parseQuantity(match.qty, { ingredient: row.name });
    if (!bought) continue;
    if (bought.dim !== planned.dim) {
      // Different scale: only the engine's own density table may bridge it.
      const converted = convert(bought, planned.dim, { ingredient: row.name });
      if (!converted) continue; // tins vs grams with no density — excluded, not guessed
      bought = converted;
    }
    errors.push(Math.abs(bought.amount - planned.amount) / planned.amount);
  }

  const samples = errors.length;
  const value = samples
    ? Math.round((errors.reduce((s, e) => s + e, 0) / samples) * 100) / 100
    : null;
  return metric(value, {
    confidence: samples >= 10 ? 'high' : samples >= 4 ? 'medium' : samples > 0 ? 'low' : 'none',
    evidence: samples,
    assumption: 'Relative error |bought − planned| ÷ planned, on a shared scale via the measurement engine; incompatible quantities are excluded, plus direct household corrections.',
  });
};
