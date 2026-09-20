import { uid } from './state.js';

/**
 * Frozen correction evidence schema (task: version frozen evidence).
 *
 *   1 — legacy: `predicted` is a bare number with no recorded unit or
 *       dimension, so its measurement meaning cannot be proven. Handled
 *       DELIBERATELY: kept as qualitative learning evidence, never silently
 *       reinterpreted into a modern dimension.
 *   2 — current: shopping-qty corrections carry the frozen measurement block
 *       (`predictionId`, `subjectKey`, `predictedUnit`, `dimension`) copied
 *       from the prediction as shown. Without it a correction stays
 *       qualitative — it is never guessed into comparability.
 */
export const CORRECTION_SCHEMA_VERSION = 2;
export const SUPPORTED_CORRECTION_SCHEMA_VERSIONS = [1, CORRECTION_SCHEMA_VERSION];

export const CORRECTION_SCHEMA_REJECTION_REASONS = {
  MALFORMED: 'malformed-correction-schema',
  UNKNOWN: 'unsupported-correction-schema',
};

/**
 * The correction schema gate: absent `schemaVersion` is legacy v1 (supported,
 * deliberately); an integer inside the support set is accepted; anything else
 * is rejected with a named reason — never guessed.
 */
export const correctionSchemaStatus = (event) => {
  if (!event || typeof event !== 'object') return { ok: false, reason: CORRECTION_SCHEMA_REJECTION_REASONS.MALFORMED };
  const raw = event.schemaVersion;
  if (raw == null) return { ok: true, version: 1, legacy: true };
  const version = Number(raw);
  if (!Number.isInteger(version)) return { ok: false, reason: CORRECTION_SCHEMA_REJECTION_REASONS.MALFORMED };
  if (!SUPPORTED_CORRECTION_SCHEMA_VERSIONS.includes(version)) {
    return { ok: false, reason: CORRECTION_SCHEMA_REJECTION_REASONS.UNKNOWN };
  }
  return { ok: true, version, legacy: version < CORRECTION_SCHEMA_VERSION };
};

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
  correctPrediction: ({ predictionType, predictionKey, predicted, actual, context, predictionId, subjectKey, predictedUnit, dimension } = {}) =>
    set((s) => {
      const event = predictionCorrectionEvent({
        predictionType,
        predictionKey,
        predicted,
        actual,
        date: s.day,
        context,
        predictionId,
        subjectKey,
        predictedUnit,
        dimension,
      });
      return event
        ? { predictionCorrections: [...(s.predictionCorrections || []), event].slice(-500) }
        : {};
    }),
});

export const predictionCorrectionEvent = ({ predictionType, predictionKey, predicted, actual, date, context = {}, id = null, at = null, predictionId = null, subjectKey = null, predictedUnit = null, dimension = null } = {}) => {
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
    // Frozen measurement meaning (v2): WHICH prediction this corrects, its
    // canonical subject, and the unit/dimension the prediction was shown in —
    // copied at correction time, never re-derived later. `dimension` is NEVER
    // defaulted: an absent dimension means the measurement meaning is unproven
    // and the correction stays qualitative evidence only.
    predictionId: predictionId == null ? null : String(predictionId),
    subjectKey: subjectKey == null ? null : String(subjectKey),
    predictedUnit: predictedUnit == null ? null : String(predictedUnit),
    dimension: dimension == null ? null : String(dimension),
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
    schemaVersion: CORRECTION_SCHEMA_VERSION,
  };
};

/**
 * The learning profile over explicit corrections. Corrections are LEARNING
 * signal, not accuracy samples — so "3+" rows are honoured as evidence that
 * the prediction was too LOW (they can only count against the prediction,
 * never for it) and are never averaged as exact values.
 *
 * Measurement honesty (task: give corrections real measurement semantics):
 * only a shopping-qty row that PROVES a count measurement (the v2 block:
 * dimension 'count' — the household's 0–3+ answer scale) enters the exact
 * error math. Rows that cannot prove it — legacy rows with a bare `predicted`
 * number, or grams/ml predictions answered on the 0–3 scale — remain
 * QUALITATIVE evidence: counted as corrections, never averaged, never
 * guessed into a dimension. Unknown/malformed schema versions are excluded
 * outright and counted in `excludedUnknownSchema`.
 *
 * Per type: `corrections` counts every usable row (exact, censored and
 * qualitative-only); `exactSamples` counts the proven-measurement exact
 * answers only; `qualitativeOnly` counts rows kept as evidence but excluded
 * from the error math; the mean absolute and signed errors are computed over
 * EXACT rows alone, and each row carries `correctionScope` ('exact-only')
 * and `units` so no consumer can mistake mixed household answers for one
 * unit. `censoredLowerBounds` reports the "3+" rows separately, with
 * `tooLowLowerBounds` counting the bounds that prove the prediction was too
 * low — direction evidence for learning, never an accuracy number.
 */
const provenCountMeasurement = (event) => String(event?.predictionType || '') !== 'shopping-qty'
  || String(event?.dimension || '') === 'count';

export const predictionLearningProfile = (events = []) => {
  const excludedUnknownSchema = [];
  const corrections = (Array.isArray(events) ? events : []).flatMap((event) => {
    if (!event || typeof event !== 'object') return [];
    const schema = correctionSchemaStatus(event);
    if (!schema.ok) {
      // An unknown or malformed schema version cannot be read under any known
      // rules — excluded and COUNTED, never silently reinterpreted.
      excludedUnknownSchema.push({ id: event.id == null ? null : String(event.id), reason: schema.reason });
      return [];
    }
    const normalized = normalizeCorrectionSemantics(event);
    return normalized ? [normalized] : [];
  });
  const byType = {};
  corrections.forEach((event) => {
    const censored = event.censored === true || event.responseType === 'lower-bound';
    const measurable = provenCountMeasurement(event);
    const row = byType[event.predictionType] || {
      corrections: 0,
      exactSamples: 0,
      qualitativeOnly: 0,
      censoredLowerBounds: 0,
      tooLowLowerBounds: 0,
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
      const predicted = Number(event.predicted);
      if (measurable && Number.isFinite(predicted) && predicted > 0 && event.actual > predicted) {
        // Proven: the bound sits ABOVE the prediction, so the prediction was
        // too low by at least (bound − predicted) — direction for learning.
        row.tooLowLowerBounds += 1;
      }
      byType[event.predictionType] = row;
      return;
    }
    if (!measurable) {
      // Qualitative evidence only: the row cannot prove which measurable
      // quantity its answer compares, so it never enters the error math.
      row.qualitativeOnly += 1;
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
  return { corrections: corrections.length, byType, excludedUnknownSchema };
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
