import { uid } from './state.js';
import {
  CORRECTION_SCHEMA_VERSION,
  SUPPORTED_CORRECTION_SCHEMA_VERSIONS,
  CORRECTION_SCHEMA_REJECTION_REASONS,
  correctionSchemaStatus,
  PREDICTION_CORRECTION_OPTIONS,
  correctionResponseType,
  normalizeCorrectionSemantics,
  CORRECTION_PROOF_STATUS,
  correctionProofOf,
} from './correction-measurements.js';

// The frozen-evidence schema gates and the authoritative correction proof
// live in correction-measurements.js (one proof for every correction
// consumer). These re-exports keep every existing import path stable.
export {
  CORRECTION_SCHEMA_VERSION,
  SUPPORTED_CORRECTION_SCHEMA_VERSIONS,
  CORRECTION_SCHEMA_REJECTION_REASONS,
  correctionSchemaStatus,
  PREDICTION_CORRECTION_OPTIONS,
  correctionResponseType,
  normalizeCorrectionSemantics,
  CORRECTION_PROOF_STATUS,
  correctionProofOf,
};

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
  if (!Number.isInteger(value) || value < 0 || value > 3) return null;
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
 * The learning profile over explicit corrections, built on the ONE shared
 * proof (`correctionProofOf`) — the exact same gate the explicit-correction
 * accuracy metric applies. A correction is therefore numerically valid in
 * the learning profile if and only if it is numerically valid everywhere.
 *
 * Per type:
 *   - `corrections`          — every row (exact, censored, qualitative);
 *   - `exactSamples`         — the proven-measurement EXACT answers only;
 *   - `qualitativeOnly`      — rows kept as evidence but excluded from the
 *     error math, each with its NAMED reason (`qualitativeReasons`);
 *   - `censoredLowerBounds`  — the "3+" rows, kept as direction evidence;
 *   - `tooLowLowerBounds`    — bounds that prove the prediction was too low;
 *   - `minimumRelativeError` — the largest provable floor across "3+" rows
 *     (learning evidence, never an accuracy number).
 *
 * The mean absolute and signed errors are computed over EXACT rows alone —
 * a missing predicted value NEVER becomes error 0, because it never passes
 * the shared proof. Every row carries `correctionScope` ('exact-only') and
 * `units` so no consumer can mistake mixed household answers for one unit.
 */
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
      qualitativeReasons: {},
      directionalLearning: 0,
      minimumRelativeError: null,
    };
    row.corrections += 1;
    const proof = correctionProofOf(event);
    if (proof.status === 'censored') {
      // A lower bound is direction evidence ("it was at least this"), never a
      // magnitude — it joins the counts and the directional learning tally,
      // but not the error averages.
      row.censoredLowerBounds += 1;
      if (proof.direction === 'prediction-too-low') {
        row.tooLowLowerBounds += 1;
        row.directionalLearning += 1;
      }
      const floor = proof.minimumRelativeError;
      if (floor != null && (row.minimumRelativeError == null || floor > row.minimumRelativeError)) {
        row.minimumRelativeError = floor;
      }
      byType[event.predictionType] = row;
      return;
    }
    if (proof.status === 'unproven') {
      // Qualitative evidence only: the row cannot prove which measurable
      // quantity its answer compares (or which prediction it answers), so it
      // never enters the error math — counted with its named reason.
      row.qualitativeOnly += 1;
      if (proof.reason) row.qualitativeReasons[proof.reason] = (row.qualitativeReasons[proof.reason] || 0) + 1;
      byType[event.predictionType] = row;
      return;
    }
    row.exactSamples += 1;
    row.absoluteError += Math.abs(proof.absoluteDiff);
    row.signedError += proof.signedError;
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
