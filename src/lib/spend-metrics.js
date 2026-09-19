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
import {
  evaluationToday,
  gateRecordDay,
} from './evaluation-time.js';
import {
  validatePredictionSnapshotWithReason,
} from './shopping-predictions.js';
import { normalizeCorrectionSemantics } from './prediction-feedback.js';

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
    const predicted = Number(shop?.predicted);
    if (shop?.total == null || !Number.isFinite(total)) {
      excluded.push({ reason: 'malformed-total', shopId });
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
  const todayStamp = evaluationToday({ today });
  const shops = (Array.isArray(state.shops) ? state.shops : [])
    .filter((s) => Number(s?.total) > 0)
    .filter((s) => gateRecordDay(s?.date, todayStamp, { windowDays: RECENT_SHOP_WINDOW_DAYS }) === 'ok');
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
 * between the quantity Forq actually displayed on the list and what actually
 * happened, computed through the shared measurement engine.
 *
 * THE ONE PIPELINE. Two provenance routes enter the exact same aggregation,
 * each as one canonical observation row:
 *
 *   { relativeError, signedError, absoluteDiff, dimension,
 *     source: 'purchase' | 'correction', predictionId, shopId, outcomeId }
 *
 *   - purchase observations — the shop record's own FROZEN prediction
 *     (`shop.predictions`, captured by buildShopRecord at purchase time):
 *     the exact advice the till run answered;
 *   - correction observations — direct household corrections
 *     (predictionCorrections, type 'shopping-qty'), the household telling
 *     us the number was wrong.
 *
 * HISTORICAL TRUTH RULE: a purchase is evaluated ONLY against the
 * prediction frozen for that purchase. The live prediction book
 * (`state.shoppingPredictions`) describes the CURRENT list on screen — UI
 * state, not history — and is never consulted for an old shop. A purchase
 * with no frozen prediction is EXCLUDED and counted
 * (`no-frozen-prediction`), never matched against the live book by
 * ingredient name and never reconstructed from recipes.
 *
 * DETERMINISTIC TIME: the supplied `today` decides everything. Shop age is
 * SIGNED (today − shop date): future shops, malformed dates and shops
 * outside RECENT_SHOP_WINDOW_DAYS are excluded and counted. Backtests with
 * a historical `today` see exactly what that day could see.
 *
 * Both sides are parsed (measure.js) and brought onto the same scale —
 * mass with mass, volume with volume, counts with counts; only the
 * engine's own density table may bridge scales. Absolute error is computed
 * PER DIMENSION over that dimension's own samples only (mean grams over
 * gram observations, mean tins over tin observations) — never a
 * dimension-specific total divided by the global sample count.
 *
 * Every observation is guarded: non-finite results (NaN, Infinity) never
 * enter the aggregation — they are excluded and counted.
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
  // The ONE clock (see evaluation-time.js): the supplied `today`, never a
  // fresh read of the real date inside the calculation. A malformed `today`
  // cannot place any sample in time, so nothing is scored.
  const todayStamp = evaluationToday({ today });
  const aliasMemory = state.aliasMemory || {};

  // Purchase accuracy and explicit-correction accuracy are answered
  // separately (see the return shape): one comparison of advice vs till run,
  // one of advice vs what the household said. The combined arrays below are
  // the learning signal — kept, but never presented as one accuracy.
  const purchaseObs = [];
  const correctionObs = [];
  const excluded = [];

  // The guard at the door: a malformed observation never reaches the
  // aggregation — it is excluded and counted, so the sample size cannot
  // silently flatter itself.
  const pushObservation = (o, bucket = purchaseObs) => {
    if (![o.relativeError, o.signedError, o.absoluteDiff].every((n) => Number.isFinite(n))) {
      excluded.push({ reason: 'non-finite-observation', name: o.name ?? null, predictionId: o.predictionId ?? null, shopId: o.shopId ?? null, outcomeId: o.outcomeId ?? null });
      return;
    }
    bucket.push(o);
  };

  // --- direct corrections: the household told us the number was wrong ------
  // Same pipeline, same observation shape, same guards as purchases — but
  // CATEGORICALLY SEPARATE evidence (task: explicit feedback must not
  // contaminate purchase accuracy). A "3+" answer is CENSORED: it asserts
  // actual ≥ 3, never actual = 3, so it is excluded from exact scoring and
  // counted — it still teaches learning through predictionLearningProfile.
  const corrections = (Array.isArray(state.predictionCorrections) ? state.predictionCorrections : [])
    .map(normalizeCorrectionSemantics)
    .filter((c) => c?.type === 'prediction_correction' && c.predictionType === 'shopping-qty');
  for (const c of corrections) {
    const outcomeId = c?.id || null;
    const gate = gateRecordDay(c?.date, todayStamp);
    if (gate !== 'ok') {
      excluded.push({
        reason: gate === 'malformed-day' ? 'undated-observation'
          : gate === 'future' ? 'future-observation'
          : 'invalid-evaluation-today',
        name: c?.predictionKey || null,
        outcomeId,
        shopId: null,
      });
      continue;
    }
    if (c.responseType === 'lower-bound' || c.censored === true) {
      excluded.push({ reason: 'censored-correction-lower-bound', name: c?.predictionKey || null, outcomeId, shopId: null, bound: c.actual });
      continue;
    }
    const predicted = Number(c.predicted);
    const actual = Number(c.actual);
    if (c.predicted == null || !Number.isFinite(predicted)) {
      excluded.push({ reason: 'missing-predicted-qty', name: c?.predictionKey || null, outcomeId, shopId: null });
      continue;
    }
    if (!(predicted > 0)) {
      excluded.push({ reason: 'non-positive-predicted-qty', name: c?.predictionKey || null, outcomeId, shopId: null });
      continue;
    }
    if (c.actual == null || !Number.isFinite(actual) || actual < 0) {
      excluded.push({ reason: 'unreadable-purchased-qty', name: c?.predictionKey || null, qty: c?.actual, outcomeId, shopId: null });
      continue;
    }
    const delta = actual - predicted;
    pushObservation({
      relativeError: Math.abs(delta) / predicted,
      signedError: delta / predicted,
      absoluteDiff: Math.abs(delta),
      dimension: 'count', // corrections are the household's 0–3+ count answer
      source: 'correction',
      responseType: 'exact',
      predictionId: null, // the correction event names its key, not a snapshot id
      shopId: null,
      outcomeId,
      name: c.predictionKey || null,
      shownAt: c.date,
    }, correctionObs);
  }

  // --- purchases: evaluated ONLY against each shop's own frozen predictions --
  for (const shop of Array.isArray(state.shops) ? state.shops : []) {
    const shopId = shop?.id || null;
    const items = Array.isArray(shop?.items) ? shop.items : [];
    const excludeShop = (reason) => {
      if (!items.length) excluded.push({ reason, name: null, shopId });
      for (const item of items) excluded.push({ reason, name: item?.name || null, shopId });
    };
    // The shop gate rides the shared evaluation-time policy (one clock, one
    // window, one reason vocabulary across every accuracy metric).
    const gate = gateRecordDay(shop?.date, todayStamp, { windowDays: RECENT_SHOP_WINDOW_DAYS });
    if (gate !== 'ok') {
      excludeShop(
        gate === 'malformed-day' ? 'malformed-shop-date'
          : gate === 'future' ? 'future-shop'
          : gate === 'no-evaluation-today' ? 'invalid-evaluation-today'
          : 'outside-evaluation-window',
      );
      continue;
    }
    // The frozen book for THIS shop — the advice the till run answered.
    // The live prediction book is deliberately not consulted here.
    const frozen = new Map(
      (Array.isArray(shop?.predictions) ? shop.predictions : [])
        .filter((p) => p && p.id != null)
        .map((p) => [p.id, p]),
    );
    for (const item of items) {
      if (!item?.name) continue;
      if (item?.qty == null || item?.qty === '') {
        excluded.push({ reason: 'unrecorded-purchase-quantity', name: item.name, shopId });
        continue;
      }
      const rawPrediction = (item.id != null && frozen.get(item.id)) || null;
      if (!rawPrediction) {
        excluded.push({ reason: 'no-frozen-prediction', name: item.name, shopId });
        continue;
      }
      // Central validation (task 5): the ONE canonical schema gate decides
      // whether this frozen snapshot can be scored at all — id, quantity,
      // dimension, subject identity and provenance. No partial re-derivation
      // here; a malformed snapshot is excluded with the gate's own reason.
      const gate = validatePredictionSnapshotWithReason(rawPrediction, { aliasMemory });
      if (!gate.ok) {
        excluded.push({ reason: gate.reason, name: item.name, shopId, predictionId: gate.snapshot?.id || rawPrediction.id || null });
        continue;
      }
      const prediction = gate.snapshot;
      // Substitution lineage (task 2): a row that was substituted to a
      // DIFFERENT ingredient kept its row id — the frozen snapshot no longer
      // describes what was bought, so scoring it would answer "how close was
      // the Rice advice to the Quinoa till run?" It is excluded, never
      // re-matched by name against the live book.
      if (prediction.isSubstitution) {
        excluded.push({ reason: 'substituted-row-not-comparable', name: item.name, shopId, predictionId: prediction.id, substitutedFrom: prediction.substitutedFrom });
        continue;
      }
      // Subject identity (task 6): prediction ID + canonical subject must
      // BOTH agree. The id locates the row; the alias-aware canonical subject
      // proves both sides speak of the same measurable ingredient.
      const outcomeSubject = canonicalName(String(item.name).trim(), aliasMemory) || String(item.name).trim().toLowerCase();
      if (!outcomeSubject || outcomeSubject !== prediction.subjectKey) {
        excluded.push({ reason: 'prediction-subject-mismatch', name: item.name, shopId, predictionId: prediction.id, predictedSubject: prediction.subjectKey, outcomeSubject });
        continue;
      }
      const planned = parseOnce(prediction.qty, item.name);
      if (!planned || !(planned.amount > 0)) {
        excluded.push({ reason: 'unreadable-predicted-qty', name: item.name, qty: prediction.qty, shopId });
        continue;
      }
      let bought = parseOnce(item.qty, item.name);
      if (!bought || !(bought.amount > 0)) {
        excluded.push({ reason: 'unreadable-purchased-qty', name: item.name, qty: item.qty, shopId });
        continue;
      }
      if (bought.dim !== planned.dim) {
        // Different scale: only the engine's own density table may bridge
        // it (e.g. "1 tin" → 400 ml → 392 g of coconut milk). No bridge:
        // excluded and counted, never guessed into comparability.
        const converted = convert(bought, planned.dim, { ingredient: item.name });
        if (!converted || !(converted.amount > 0)) {
          excluded.push({ reason: 'incompatible-dimensions', name: item.name, predicted: planned.dim, purchased: bought.dim, shopId });
          continue;
        }
        bought = converted;
      }
      const delta = bought.amount - planned.amount;
      pushObservation({
        relativeError: Math.abs(delta) / planned.amount,
        signedError: delta / planned.amount,
        absoluteDiff: Math.abs(delta),
        dimension: planned.dim,
        source: 'purchase',
        responseType: 'exact',
        predictionId: prediction.id,
        shopId,
        outcomeId: null,
        name: item.name,
        shownAt: prediction.day || prediction.at || null, // when this advice was on show
      });
    }
  }

  const meanOf = (rows, pick) => (rows.length ? rows.reduce((s, r) => s + pick(r), 0) / rows.length : null);
  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const samplesByDimOf = (rows) => Object.fromEntries(
    ['mass', 'volume', 'count'].map((dim) => [dim, rows.filter((o) => o.dimension === dim).length]),
  );
  // Absolute error only means something within one scale — computed PER
  // DIMENSION over that dimension's own samples: mass MAE over mass
  // observations, volume MAE over volume observations, count MAE over count
  // observations. Never a dimension's error total over the global count.
  const absoluteErrorsByDimOf = (rows) => Object.fromEntries(
    ['mass', 'volume', 'count']
      .map((dim) => {
        const dimRows = rows.filter((o) => o.dimension === dim);
        return [dim, round(meanOf(dimRows, (o) => o.absoluteDiff))];
      })
      .filter(([, v]) => v != null),
  );

  // THREE answers, never one blended number:
  //   purchaseQuantityAccuracy — the till run vs the advice it answered;
  //   explicitQuantityCorrectionAccuracy — the household's EXACT answers vs
  //     that advice (censored "3+" rows never enter it);
  //   combinedLearningSignal — both sources together, explicitly labelled so
  //     no consumer can mistake the learning view for purchase accuracy.
  const summarise = (rows) => {
    const samples = rows.length;
    return {
      ...metric(round(meanOf(rows, (o) => o.relativeError)), {
        confidence: samples >= 10 ? 'high' : samples >= 4 ? 'medium' : samples > 0 ? 'low' : 'none',
        evidence: samples,
        assumption: 'Relative error |outcome − predicted| ÷ predicted, on a shared scale via the measurement engine, against each shop\'s frozen prediction snapshots (never the live list book) — exact household corrections only where named; incompatible quantities, unfrozen rows, censored "3+" answers and out-of-window or future records are excluded and counted.',
      }),
      samples,
      samplesByDim: samplesByDimOf(rows),
      signedBias: round(meanOf(rows, (o) => o.signedError)),
      absoluteErrorsByDim: absoluteErrorsByDimOf(rows),
      observations: rows,
    };
  };
  const purchase = summarise(purchaseObs);
  const explicit = summarise(correctionObs);
  const combined = summarise([...purchaseObs, ...correctionObs]);
  return {
    ...combined,
    // Split metrics (task 4): purchase accuracy answers ONLY "how close was
    // the quantity Forq told the household to buy to what they actually
    // bought?" Explicit feedback informs learning without contaminating it.
    purchaseQuantityAccuracy: purchase,
    explicitQuantityCorrectionAccuracy: explicit,
    combinedLearningSignal: combined,
    excluded,
  };
};
