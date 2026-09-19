import { uid } from './state.js';

/**
 * The household's correction answer, 0 → 3+. "3+" is CENSORED evidence —
 * the household is telling us "at least three", not "exactly three" — so
 * every option now names its response type and only the exact answers carry
 * a usable point value. Ordinary exact numerical error is never computed
 * from a lower bound; the bound still teaches learning (see
 * predictionLearningProfile) without contaminating accuracy metrics.
 */
export const PREDICTION_CORRECTION_OPTIONS = [
  { value: 0, label: 'None', responseType: 'exact' },
  { value: 1, label: '1', responseType: 'exact' },
  { value: 2, label: '2', responseType: 'exact' },
  { value: 3, label: '3+', responseType: 'lower-bound' },
];

const validValue = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 3;

/** Is this stored correction an exact count, or a censored "3+" lower bound? */
export const correctionResponseType = (actual) => (Number(actual) === 3 ? 'lower-bound' : 'exact');

/**
 * Normalize one stored correction to the explicit semantics schema. Fields:
 *   - `actual`      — the numeric answer (the bound itself for "3+")
 *   - `responseType`— 'exact' | 'lower-bound'
 *   - `valueType`   — 'exact-value' | 'lower-bound'
 *   - `censored`    — true when the true value is only known to be ≥ actual
 * Legacy rows (written before this schema) are classified in place: an
 * `actual` of 3 was the "3+" button, so it becomes a lower bound; nothing
 * is dropped, so migrations never lose household history.
 */
export const normalizeCorrectionSemantics = (event) => {
  if (!event || typeof event !== 'object' || !validValue(event.actual)) return null;
  const responseType = event.responseType === 'lower-bound'
    || event.valueType === 'lower-bound' || event.censored === true
    ? 'lower-bound'
    : event.responseType === 'exact' ? 'exact'
      : correctionResponseType(event.actual);
  const censored = responseType === 'lower-bound';
  return {
    ...event,
    responseType,
    valueType: responseType === 'lower-bound' ? 'lower-bound' : 'exact-value',
    censored,
  };
};

const validEvent = (event) => Boolean(normalizeCorrectionSemantics(event));

/** Store actions for recording, resolving and correcting predictions. */
export const predictionActions = (set) => ({
  recordPrediction: ({ type, key, probability, confidence, predicted, context } = {}) =>
    set((s) => ({ predictionSnapshots: [...(s.predictionSnapshots || []), predictionSnapshot({ type, key, probability, confidence, predicted, date: s.day, context })].slice(-500) })),
  resolvePrediction: (id, outcome) =>
    set((s) => ({ predictionSnapshots: (s.predictionSnapshots || []).map((snapshot) => snapshot.id === id ? { ...snapshot, outcome: Boolean(outcome), resolvedAt: s.day } : snapshot) })),
  correctPrediction: ({ predictionType, predictionKey, predicted, actual, context } = {}) =>
    set((s) => {
      const event = predictionCorrectionEvent({
        predictionType,
        predictionKey,
        predicted,
        actual,
        date: s.day,
        context,
      });
      return event
        ? { predictionCorrections: [...(s.predictionCorrections || []), event].slice(-500) }
        : {};
    }),
});

export const predictionCorrectionEvent = ({ predictionType, predictionKey, predicted, actual, date, context = {}, id = null, at = null } = {}) => {
  const value = Number(actual);
  if (!validValue(value)) return null;
  const responseType = value === 3 ? 'lower-bound' : 'exact';
  return {
    // Identity is preserved when re-normalizing a stored event (persistence
    // migrations) — a correction whose id changes on every load can never be
    // deduplicated against its ledger copy or counted once.
    id: id || uid('pc'),
    type: 'prediction_correction',
    predictionType: String(predictionType || 'unknown'),
    predictionKey: String(predictionKey || ''),
    predicted: Number.isFinite(Number(predicted)) ? Number(predicted) : null,
    actual: value,
    // Explicit correction semantics: an exact count, or a "3+" lower bound
    // (the true value is only known to be ≥ actual — never treated as =).
    responseType,
    valueType: responseType === 'lower-bound' ? 'lower-bound' : 'exact-value',
    censored: responseType === 'lower-bound',
    date,
    context,
    at: at || Date.now(),
  };
};

/**
 * The learning profile over explicit corrections. Corrections are LEARNING
 * signal, not accuracy samples — so "3+" rows are honoured as evidence that
 * the prediction was too LOW (they can only count against the prediction,
 * never for it) and are never averaged as exact values.
 *
 * Per type: `corrections` counts every usable row (exact and censored);
 * `exactSamples` counts the exact answers only; the mean absolute and
 * signed errors are computed over EXACT rows alone, and each row carries
 * `correctionScope` ('exact-only') and `units` so no consumer can mistake
 * mixed household answers for one unit. `censoredLowerBounds` reports the
 * "3+" rows separately.
 */
export const predictionLearningProfile = (events = []) => {
  const corrections = (Array.isArray(events) ? events : [])
    .map(normalizeCorrectionSemantics)
    .filter(Boolean);
  const byType = {};
  corrections.forEach((event) => {
    const censored = event.censored === true || event.responseType === 'lower-bound';
    const row = byType[event.predictionType] || {
      corrections: 0,
      exactSamples: 0,
      censoredLowerBounds: 0,
      absoluteError: 0,
      signedError: 0,
      units: null,
      correctionScope: 'exact-only',
    };
    row.corrections += 1;
    if (censored) {
      // A lower bound is direction evidence ("it was at least this"), never a
      // magnitude — it joins the counts but not the error averages.
      row.censoredLowerBounds += 1;
      byType[event.predictionType] = row;
      return;
    }
    row.exactSamples += 1;
    const error = event.predicted == null ? 0 : event.actual - event.predicted;
    row.absoluteError += Math.abs(error);
    row.signedError += error;
    byType[event.predictionType] = row;
  });
  Object.values(byType).forEach((row) => {
    row.meanAbsoluteError = row.exactSamples
      ? Math.round((row.absoluteError / row.exactSamples) * 100) / 100
      : null;
    row.meanSignedError = row.exactSamples
      ? Math.round((row.signedError / row.exactSamples) * 100) / 100
      : null;
  });
  return { corrections: corrections.length, byType };
};

export const predictionSnapshot = ({ type, key, probability, confidence, predicted, date, context = {} } = {}) => ({
  id: uid('ps'),
  type: 'prediction_snapshot',
  predictionType: String(type || 'unknown'),
  predictionKey: String(key || ''),
  probability: Number.isFinite(Number(probability)) ? Math.max(0, Math.min(1, Number(probability))) : null,
  confidence: String(confidence || 'none'),
  predicted: Number.isFinite(Number(predicted)) ? Number(predicted) : null,
  date,
  context,
  at: Date.now(),
});

export const predictionCalibration = (events = []) => {
  const rows = (Array.isArray(events) ? events : []).filter((event) => event?.type === 'prediction_snapshot' && event.outcome != null);
  const byConfidence = {};
  rows.forEach((event) => {
    const row = byConfidence[event.confidence] || { predictions: 0, correct: 0, probabilityTotal: 0 };
    row.predictions += 1;
    row.correct += event.outcome ? 1 : 0;
    row.probabilityTotal += Number(event.probability) || 0;
    byConfidence[event.confidence] = row;
  });
  Object.values(byConfidence).forEach((row) => {
    row.accuracy = row.correct / row.predictions;
    row.meanProbability = row.probabilityTotal / row.predictions;
    row.calibrationError = Math.abs(row.accuracy - row.meanProbability);
  });
  return { resolved: rows.length, byConfidence };
};
