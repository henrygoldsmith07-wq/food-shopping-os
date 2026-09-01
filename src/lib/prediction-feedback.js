import { uid } from './state.js';

export const PREDICTION_CORRECTION_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
];

const validValue = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 3;

export const predictionCorrectionEvent = ({ predictionType, predictionKey, predicted, actual, date, context = {} } = {}) => {
  const value = Number(actual);
  if (!validValue(value)) return null;
  return {
    id: uid('pc'),
    type: 'prediction_correction',
    predictionType: String(predictionType || 'unknown'),
    predictionKey: String(predictionKey || ''),
    predicted: Number.isFinite(Number(predicted)) ? Number(predicted) : null,
    actual: value,
    date,
    context,
    at: Date.now(),
  };
};

export const predictionLearningProfile = (events = []) => {
  const corrections = (Array.isArray(events) ? events : [])
    .filter((event) => event?.type === 'prediction_correction'
      && validValue(event.actual));
  const byType = {};
  corrections.forEach((event) => {
    const row = byType[event.predictionType] || { corrections: 0, absoluteError: 0, signedError: 0 };
    const error = event.predicted == null ? 0 : event.actual - event.predicted;
    row.corrections += 1;
    row.absoluteError += Math.abs(error);
    row.signedError += error;
    byType[event.predictionType] = row;
  });
  Object.values(byType).forEach((row) => {
    row.meanAbsoluteError = Math.round((row.absoluteError / row.corrections) * 100) / 100;
    row.meanSignedError = Math.round((row.signedError / row.corrections) * 100) / 100;
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
