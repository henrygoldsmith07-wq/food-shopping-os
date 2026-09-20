/**
 * Explicit-correction measurement semantics — the pipeline that decides
 * whether a household's `shopping-qty` correction can be scored as a NUMBER
 * at all, and what directional evidence the censored ones still prove.
 *
 * This is deliberately its own module, separate from the purchase pipeline
 * in spend-metrics.js: explicit feedback is CATEGORICALLY SEPARATE evidence
 * and must never contaminate purchase accuracy. spend-metrics calls into
 * here for the corrections side only; the aggregation stays there.
 *
 * MEASUREMENT SEMANTICS (frozen evidence, v2 corrections): a correction
 * must PROVE that its corrected answer refers to the same measurable
 * quantity as the original prediction. A v2 correction carries the frozen
 * measurement block copied from the prediction as shown — predictionId,
 * frozen subjectKey, predictedUnit, dimension. The household's answer scale
 * is the 0–3+ COUNT, so the only dimension a correction can prove
 * comparable is 'count': a grams prediction answered "2" on that scale
 * cannot prove grams, and is NEVER scored (never automatically
 * dimension: 'count'). Every row that cannot prove compatible measurement
 * stays QUALITATIVE learning evidence, excluded from numerical accuracy as
 * `correction-measurement-unproven`.
 *
 * VERSION GATE: legacy v1 rows (a bare `predicted` number) cannot prove
 * their unit or dimension, so they stay qualitative
 * (`correction-measurement-unproven`, legacy) — never guessed into
 * comparability. Unknown/malformed versions are rejected with the named
 * reasons from prediction-feedback.
 *
 * CENSORED "3+" (lower bound, never an exact answer): safe DIRECTIONAL
 * evidence only — the bound proves the prediction was too low when it sits
 * above the predicted value, and the minimum signed error that follows.
 * `lowerBound`, `direction`, `minimumError` and `minimumRelativeError` are
 * learning evidence, not exact accuracy: censored rows NEVER enter the
 * exact MAE sample.
 *
 * Every exclusion is pushed onto the caller's `excluded` list (tagged
 * `source: 'correction'`) with a named reason — nothing is filtered
 * silently.
 */

import {
  gateRecordDay,
} from './evaluation-time.js';
import {
  normalizeCorrectionSemantics,
  correctionSchemaStatus,
} from './prediction-feedback.js';

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

const CORRECTION_DIMS = ['mass', 'volume', 'count'];

/**
 * Prove the corrected answer measures the SAME quantity as the prediction.
 * Returns { ok, dimension, predictionId, subjectKey } or { ok: false, why }.
 * The answer scale is a 0–3+ count, so only a 'count'-dimension prediction
 * can ever be proven comparable — never assumed, always proven.
 */
export const measurementProof = (c) => {
  const dimension = c.dimension == null ? null : String(c.dimension);
  if (!CORRECTION_DIMS.includes(dimension)) {
    return { ok: false, why: dimension == null ? 'no-measurement-block' : `unknown-dimension-${dimension}` };
  }
  const predictionId = c.predictionId == null ? null : String(c.predictionId).trim();
  const subjectKey = c.subjectKey == null ? null : String(c.subjectKey).trim();
  if (!predictionId) return { ok: false, why: 'missing-prediction-id' };
  if (!subjectKey) return { ok: false, why: 'missing-frozen-subject-key' };
  if (dimension !== 'count') {
    // The answer scale is a 0–3+ count — a mass/volume prediction's answer
    // on that scale is a categorical reply, not a grams/ml measurement.
    return { ok: false, why: `${dimension}-prediction-vs-count-answer` };
  }
  return { ok: true, dimension, predictionId, subjectKey };
};

/**
 * Walk the household's explicit corrections and split them into:
 *   - exact, proven-measurement observations (pushed into `correctionObs`
 *     through the caller's shared `pushObservation` guard, so non-finite
 *     values are excluded identically to purchases);
 *   - censored "3+" rows → directionalEvidence (learning only);
 *   - everything else → `excluded` with a named reason.
 *
 * Expects the CALLER's `excluded` array (shared diagnostics) and the same
 * `pushObservation` the purchase pipeline uses — one guard, one reason
 * vocabulary, zero silent filtering.
 */
export const collectCorrectionEvidence = ({
  corrections,
  todayStamp,
  excluded,
  correctionObs,
  pushObservation,
}) => {
  const directionalEvidence = [];
  // Parens matter: the type filter must apply to the WHOLE ternary result,
  // not just the empty-array branch — a portions correction must never slip
  // into the quantity pipeline when the corrections list is a real array.
  const rows = (Array.isArray(corrections) ? corrections : [])
    .filter((c) => c?.type === 'prediction_correction' && c.predictionType === 'shopping-qty');
  for (const raw of rows) {
    const outcomeId = raw?.id || null;
    const name = raw?.predictionKey || null;
    const excludeCorrection = (reason, extra = {}) => {
      excluded.push({ source: 'correction', reason, name, outcomeId, shopId: null, ...extra });
    };
    const c = normalizeCorrectionSemantics(raw);
    if (!c) {
      excludeCorrection('unreadable-correction-answer', { qty: raw?.actual });
      continue;
    }
    const gate = gateRecordDay(c?.date, todayStamp);
    if (gate !== 'ok') {
      excludeCorrection(
        gate === 'malformed-day' ? 'undated-observation'
          : gate === 'future' ? 'future-observation'
          : 'invalid-evaluation-today',
      );
      continue;
    }
    const schema = correctionSchemaStatus(c);
    if (!schema.ok) {
      excludeCorrection(schema.reason);
      continue;
    }
    if (schema.legacy) {
      excludeCorrection('correction-measurement-unproven', { why: 'legacy-correction-no-measurement-block' });
      continue;
    }
    const proof = measurementProof(c);
    if (!proof.ok) {
      excludeCorrection('correction-measurement-unproven', { why: proof.why });
      continue;
    }
    const predicted = Number(c.predicted);
    const actual = Number(c.actual);
    if (c.predicted == null || !Number.isFinite(predicted)) {
      excludeCorrection('missing-predicted-qty');
      continue;
    }
    if (!(predicted > 0)) {
      excludeCorrection('non-positive-predicted-qty');
      continue;
    }
    if (c.actual == null || !Number.isFinite(actual) || actual < 0) {
      excludeCorrection('unreadable-purchased-qty', { qty: c?.actual });
      continue;
    }
    if (c.responseType === 'lower-bound' || c.censored === true) {
      // CENSORED "3+": actual ≥ bound, never = bound. Directional evidence
      // only — never an exact MAE sample.
      const overBound = actual - predicted;
      const evidenceRow = {
        source: 'correction',
        outcomeId,
        predictionId: proof.predictionId,
        subjectKey: proof.subjectKey,
        name,
        dimension: proof.dimension,
        predictedUnit: c.predictedUnit == null ? null : String(c.predictedUnit),
        predicted,
        lowerBound: actual,
        direction: overBound > 0 ? 'prediction-too-low' : 'consistent-with-bound',
        minimumError: Math.max(0, overBound),
        minimumRelativeError: round(overBound > 0 ? overBound / predicted : 0),
        shownAt: c.date,
      };
      directionalEvidence.push(evidenceRow);
      excludeCorrection('censored-correction-lower-bound', {
        bound: actual,
        lowerBound: actual,
        direction: evidenceRow.direction,
        minimumError: evidenceRow.minimumError,
        minimumRelativeError: evidenceRow.minimumRelativeError,
      });
      continue;
    }
    const delta = actual - predicted;
    pushObservation({
      relativeError: Math.abs(delta) / predicted,
      signedError: delta / predicted,
      absoluteDiff: Math.abs(delta),
      dimension: proof.dimension, // PROVEN — never assumed to be a count
      source: 'correction',
      responseType: 'exact',
      predictionId: proof.predictionId, // the frozen prediction this answers
      subjectKey: proof.subjectKey,
      shopId: null,
      outcomeId,
      name,
      shownAt: c.date,
    }, correctionObs, 'correction');
  }
  return { directionalEvidence };
};
