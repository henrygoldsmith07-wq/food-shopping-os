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
 * reasons from the schema gate below.
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

import { gateRecordDay } from './evaluation-time.js';

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

const CORRECTION_DIMS = ['mass', 'volume', 'count'];

/** The three outcomes the authoritative proof can return, named once. */
export const CORRECTION_PROOF_STATUS = {
  EXACT: 'exact',
  CENSORED: 'censored',
  UNPROVEN: 'unproven',
};

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
 * THE authoritative correction proof — the ONE function every correction
 * consumer shares (explicit correction accuracy, predictionLearningProfile,
 * household prediction-error metrics, and any future consumer). A correction
 * enters EXACT numerical learning only when this returns `status: 'exact'`,
 * which requires ALL of:
 *
 *   - supported schema version (current or the one deliberate legacy
 *     generation — legacy cannot prove its measurement, so it stops here);
 *   - a valid prediction ID and the FROZEN subject key;
 *   - a valid predicted value (finite, > 0);
 *   - a proven dimension compatible with the 0–3+ count answer scale;
 *   - a valid actual value (finite, ≥ 0);
 *   - an EXACT rather than censored response.
 *
 * Everything else is `status: 'unproven'` with a NAMED reason — most
 * importantly `correction-measurement-unproven`, the qualitative-only label.
 * A missing predicted value NEVER becomes error 0: it is unproven evidence.
 * Censored "3+" rows return `status: 'censored'` carrying the safe
 * directional block (lowerBound, direction, minimumError,
 * minimumRelativeError) for learning only.
 */
export const correctionProofOf = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { status: 'unproven', reason: CORRECTION_SCHEMA_REJECTION_REASONS.MALFORMED };
  }
  const schema = correctionSchemaStatus(raw);
  if (!schema.ok) return { status: 'unproven', reason: schema.reason };
  const c = normalizeCorrectionSemantics(raw);
  if (!c) {
    return { status: 'unproven', reason: 'unreadable-correction-answer', schema };
  }
  const censored = c.responseType === 'lower-bound' || c.censored === true;
  const base = { schema, censored };
  if (String(c.predictionType || '') !== 'shopping-qty') {
    // Other prediction types (e.g. portions) have no proven shared scale
    // with the 0–3+ shopping answer — qualitative by definition here.
    return { status: 'unproven', reason: 'correction-not-shopping-qty', ...base };
  }
  if (schema.legacy) {
    return {
      status: 'unproven',
      reason: 'correction-measurement-unproven',
      why: 'legacy-correction-no-measurement-block',
      ...base,
    };
  }
  const proof = measurementProof(c);
  if (!proof.ok) {
    return {
      status: 'unproven',
      reason: 'correction-measurement-unproven',
      why: proof.why,
      ...base,
    };
  }
  const predicted = Number(c.predicted);
  if (c.predicted == null || !Number.isFinite(predicted)) {
    return { status: 'unproven', reason: 'missing-predicted-qty', ...base };
  }
  if (!(predicted > 0)) {
    return { status: 'unproven', reason: 'non-positive-predicted-qty', ...base };
  }
  const actual = Number(c.actual);
  if (c.actual == null || !Number.isFinite(actual) || actual < 0) {
    return { status: 'unproven', reason: 'unreadable-purchased-qty', ...base };
  }
  const identity = {
    outcomeId: raw?.id == null ? null : String(raw.id),
    predictionId: proof.predictionId,
    subjectKey: proof.subjectKey,
    name: c.predictionKey == null ? null : c.predictionKey,
    dimension: proof.dimension,
    predictedUnit: c.predictedUnit == null ? null : String(c.predictedUnit),
    predicted,
    shownAt: c.date == null ? null : c.date,
    schemaVersion: schema.version,
  };
  if (censored) {
    const overBound = actual - predicted;
    return {
      status: 'censored',
      ...identity,
      actual,
      lowerBound: actual,
      direction: overBound > 0 ? 'prediction-too-low' : 'consistent-with-bound',
      minimumError: Math.max(0, overBound),
      minimumRelativeError: round(overBound > 0 ? overBound / predicted : 0),
    };
  }
  const delta = actual - predicted;
  return {
    status: 'exact',
    ...identity,
    actual,
    relativeError: Math.abs(delta) / predicted,
    signedError: delta / predicted,
    absoluteDiff: Math.abs(delta),
  };
};

/**
 * Walk the household's explicit corrections and split them into:
 *   - exact, proven-measurement observations (pushed into `correctionObs`
 *     through the caller's shared `pushObservation` guard, so non-finite
 *     values are excluded identically to purchases);
 *   - censored "3+" rows → directionalEvidence (learning only);
 *   - everything else → `excluded` with a named reason.
 *
 * The split is delegated to `correctionProofOf` — the ONE proof every
 * correction consumer shares — so a correction that is numerically valid
 * here is numerically valid EVERYWHERE, and vice versa.
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
    const name = raw?.predictionKey || null;
    const outcomeId = raw?.id || null;
    const excludeCorrection = (reason, extra = {}) => {
      excluded.push({ source: 'correction', reason, name, outcomeId, shopId: null, ...extra });
    };
    // The clock gate rides the shared evaluation-time policy — one clock,
    // one window policy, one reason vocabulary across every accuracy metric.
    const gate = gateRecordDay(raw?.date, todayStamp);
    if (gate !== 'ok') {
      excludeCorrection(
        gate === 'malformed-day' ? 'undated-observation'
          : gate === 'future' ? 'future-observation'
          : 'invalid-evaluation-today',
      );
      continue;
    }
    const proof = correctionProofOf(raw);
    if (proof.status === 'unproven') {
      excludeCorrection(proof.reason, proof.why ? { why: proof.why } : {});
      continue;
    }
    if (proof.status === 'censored') {
      // CENSORED "3+": actual ≥ bound, never = bound. Directional evidence
      // only — never an exact MAE sample.
      directionalEvidence.push({
        source: 'correction',
        outcomeId: proof.outcomeId,
        predictionId: proof.predictionId,
        subjectKey: proof.subjectKey,
        name: proof.name,
        dimension: proof.dimension,
        predictedUnit: proof.predictedUnit,
        predicted: proof.predicted,
        lowerBound: proof.lowerBound,
        direction: proof.direction,
        minimumError: proof.minimumError,
        minimumRelativeError: proof.minimumRelativeError,
        shownAt: proof.shownAt,
      });
      excludeCorrection('censored-correction-lower-bound', {
        bound: proof.lowerBound,
        lowerBound: proof.lowerBound,
        direction: proof.direction,
        minimumError: proof.minimumError,
        minimumRelativeError: proof.minimumRelativeError,
      });
      continue;
    }
    pushObservation({
      relativeError: proof.relativeError,
      signedError: proof.signedError,
      absoluteDiff: proof.absoluteDiff,
      dimension: proof.dimension, // PROVEN — never assumed to be a count
      source: 'correction',
      responseType: 'exact',
      predictionId: proof.predictionId, // the frozen prediction this answers
      subjectKey: proof.subjectKey,
      shopId: null,
      outcomeId: proof.outcomeId,
      name: proof.name,
      shownAt: proof.shownAt,
    }, correctionObs, 'correction');
  }
  return { directionalEvidence };
};
