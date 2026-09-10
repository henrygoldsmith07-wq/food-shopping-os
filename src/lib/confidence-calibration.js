/**
 * Confidence calibration — the machinery that turns raw evidence counts
 * into a confidence a household can rely on.
 *
 * Split out of household-model.js so the model reads cleanly and the
 * calibration rules live where they can be tested on their own:
 *
 *   recency  — evidence halves every 28 days; old signal weakens, it never
 *              vanishes, and undated observations (a rating carries no
 *              timestamp) count as fresh rather than being discounted.
 *   conflict — evidence that disagrees with itself ('nope' ratings among
 *              likes, skips among cooks) demotes one step: a split
 *              household reads as "mixed signals", never "confident".
 *   calibration — stated confidence vs what actually happened, read from
 *              resolved prediction snapshots: a 'high' that comes true 40%
 *              of the time is a number worth correcting.
 */

import { dayStamp } from './kitchen-dates.js';

const DECAY_HALF_LIFE_DAYS = 28;

/**
 * Not all evidence is equally strong. An explicit rating says more than one
 * cooked meal; a pantry row says less than a receipt. These weights turn a
 * raw observation count into an evidence score, so confidence reflects the
 * strength of what was observed rather than merely how often.
 */
export const SOURCE_EVIDENCE_WEIGHTS = {
  'taste-ratings': 1.15,
  'member-profile': 1,
  'waste': 0.9,
  'meal-events': 0.8,
  'receipts': 0.8,
  'shopping': 0.65,
  'cooked': 0.55,
  'plan': 0.5,
  'pantry': 0.4,
};

export const evidenceScoreFor = (count = 0, source = 'cooked') =>
  (Number(count) || 0) * (SOURCE_EVIDENCE_WEIGHTS[source] ?? 0.5);

/** Back-compatible count-only confidence, used by simple callers and tests. */
export const confidenceForCount = (count = 0) => {
  const n = Number(count) || 0;
  if (n <= 0) return 'none';
  if (n < 3) return 'low';
  if (n < 8) return 'medium';
  return 'high';
};

/**
 * Source-aware confidence:
 *   none  → no usable evidence
 *   low   → a first signal, not yet a pattern
 *   medium→ enough independent observations to steer a suggestion
 *   high  → repeated, weighted evidence the household can rely on
 */
export const confidenceForEvidence = (count = 0, source = 'cooked') => {
  const score = evidenceScoreFor(count, source);
  if (score <= 0) return 'none';
  if (score < 1.2) return 'low';
  if (score < 4) return 'medium';
  return 'high';
};

/**
 * How much of a count survives to today. Evidence halves every 28 days — a
 * cooking pattern from three months ago still counts, but it no longer
 * outweighs what happened this week. `dates` are the per-observation stamps
 * (cooked dates, waste dates, shop dates); observations with no date of
 * their own (a rating carries no timestamp) count as fresh rather than
 * being silently discounted. When no stamps exist at all the count is taken
 * at face value with a mild haircut, never zeroed — old evidence weakens,
 * it does not vanish.
 */
export const decayEvidence = (count = 0, dates = [], today = dayStamp()) => {
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  const stamps = (Array.isArray(dates) ? dates : []).map(String).filter(Boolean);
  if (!stamps.length) return n * 0.8;
  const dated = Math.min(stamps.length, n);
  const undated = Math.max(0, n - stamps.length);
  let weight = 0;
  for (const stamp of stamps) {
    const t = new Date(`${String(today)}T12:00:00`);
    const s = new Date(`${String(stamp).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(s.getTime())) { weight += 0.5; continue; }
    const age = Math.max(0, Math.round((t - s) / 86400000));
    weight += Math.pow(0.5, age / DECAY_HALF_LIFE_DAYS);
  }
  // Dated observations decay by their own age; undated ones stay fresh.
  const averaged = stamps.length ? weight / stamps.length : 0.8;
  return Math.min(n, (dated ? Math.min(dated, weight) : 0) + undated * averaged);
};

/**
 * Full calibration: recency-weighted evidence and conflict detection in one
 * honest reading.
 *
 * `conflicting` counts observations that point the other way (ratings of
 * 'nope' among liked evidence, skips among cooked evidence). Evidence that
 * disagrees with itself cannot earn 'high' — it is capped at 'medium' so a
 * split household reads as "mixed signals", not "confident".
 */
export const calibratedConfidence = ({
  count = 0,
  source = 'cooked',
  dates = [],
  conflicting = 0,
  today = dayStamp(),
} = {}) => {
  const decayed = decayEvidence(count, dates, today);
  const score = evidenceScoreFor(decayed, source);
  if (score <= 0) return { level: 'none', effectiveCount: 0, decayed: true, conflicting: false };
  let level = score < 1.2 ? 'low' : score < 4 ? 'medium' : 'high';
  const conflictRatio = count > 0 ? (Number(conflicting) || 0) / count : 0;
  // Conflicting evidence demotes one step: high → medium, medium → low. A
  // split household reads as "mixed signals", not "confident".
  if (conflictRatio >= 0.25 && level !== 'none' && level !== 'low') {
    level = level === 'high' ? 'medium' : 'low';
  }
  return {
    level,
    effectiveCount: Math.round(decayed * 100) / 100,
    decayed: decayed < count * 0.75,
    conflicting: conflictRatio >= 0.25,
  };
};

/**
 * Prediction-vs-outcome calibration: how often the app's stated confidence
 * matched what actually happened, from resolved prediction snapshots.
 * A 'high' that comes true 40% of the time is a number worth correcting.
 */
export const confidenceCalibration = (snapshots = [], today = dayStamp()) => {
  const rows = (Array.isArray(snapshots) ? snapshots : [])
    .filter((s) => s?.type === 'prediction_snapshot' && s.outcome != null && s.confidence);
  if (!rows.length) return { ready: false, byConfidence: {}, assumption: 'No resolved predictions to calibrate against yet.' };
  const byConfidence = {};
  for (const row of rows) {
    const bucket = byConfidence[row.confidence] || { predicted: 0, cameTrue: 0, probabilityTotal: 0 };
    bucket.predicted += 1;
    bucket.cameTrue += row.outcome ? 1 : 0;
    bucket.probabilityTotal += Number(row.probability) || 0;
    byConfidence[row.confidence] = bucket;
  }
  for (const [level, bucket] of Object.entries(byConfidence)) {
    bucket.actualRate = Math.round((bucket.cameTrue / bucket.predicted) * 100) / 100;
    bucket.meanProbability = Math.round((bucket.probabilityTotal / bucket.predicted) * 100) / 100;
    bucket.gap = Math.round((bucket.actualRate - bucket.meanProbability) * 100) / 100;
    bucket.verdict = Math.abs(bucket.gap) <= 0.15 ? 'calibrated'
      : bucket.gap > 0 ? 'underconfident' : 'overconfident';
    void level;
  }
  return {
    ready: true,
    resolved: rows.length,
    byConfidence,
    assumption: 'Resolved prediction snapshots, grouped by the confidence the app stated at prediction time.',
  };
};
