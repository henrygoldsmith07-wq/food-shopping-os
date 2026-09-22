/**
 * Evidence-contract re-exports — the stable consumer surface for the
 * evidence-boundary primitives (see prediction-evidence.js,
 * correction-measurements.js and shopping-predictions.js). Kept separate
 * from eval-metrics.js so the household scorecard module stays inside the
 * 500-line boundary.
 */

export {
  PREDICTION_PROVENANCE,
  FORQ_PROVENANCE,
  evaluableForPredictionAccuracy,
  provenanceStatusFor,
  PROVENANCE_REJECTION_REASONS,
  quantityOverrideEvent,
  SUPPORTED_OVERRIDE_SCHEMA_VERSIONS,
  OVERRIDE_SCHEMA_REJECTION_REASONS,
  overrideSchemaStatus,
  basketPredictionEvent,
  SUPPORTED_BASKET_SCHEMA_VERSIONS,
  BASKET_SCHEMA_REJECTION_REASONS,
  basketSchemaStatus,
  frozenBasketForList,
  listSnapshotDivergence,
  listSnapshotsConsistent,
} from './prediction-evidence.js';

export {
  CORRECTION_PROOF_STATUS,
  correctionProofOf,
} from './correction-measurements.js';

export { listSnapshotSync } from './shopping-predictions.js';

import { correctionProofOf } from './correction-measurements.js';

/**
 * The aggregate directional-learning view over censored "3+" evidence
 * (task: make censored evidence useful consistently): counts and minimum
 * floors across every correction consumer's rows — WITHOUT inventing exact
 * values. `subject` and `predictionId` are preserved per row so the
 * evidence stays attributable.
 */
export const directionalLearning = (rows = []) => {
  const safe = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object');
  const tooLow = safe.filter((r) => r.direction === 'prediction-too-low');
  const minimumError = tooLow.reduce((max, r) => (Number.isFinite(r.minimumError) && r.minimumError > max ? r.minimumError : max), 0);
  const minimumRelativeError = tooLow.reduce(
    (max, r) => (Number.isFinite(r.minimumRelativeError) && r.minimumRelativeError > max ? r.minimumRelativeError : max),
    0,
  );
  return {
    total: safe.length,
    tooLow: tooLow.length,
    consistentWithBound: safe.length - tooLow.length,
    // The largest PROVABLE floor: at least this much error is certain for
    // the strongest row. Learning evidence only — never an accuracy number.
    minimumError,
    minimumRelativeError,
    subjects: [...new Set(safe.map((r) => r.subjectKey).filter(Boolean))],
    predictionIds: [...new Set(safe.map((r) => r.predictionId).filter(Boolean))],
  };
};

/** Convenience: is this stored correction numerically valid under the ONE shared proof? */
export const isNumericallyValidCorrection = (raw) => correctionProofOf(raw).status === 'exact';
