/**
 * Override events — the immutable quantity_override record (task: override
 * immutability) and its schema gate, extracted from prediction-evidence.js
 * to keep both modules inside the 500-line boundary.
 */


const overrideVersion = 2;

/**
 * One quantity override: the household changed what Forq advised. The
 * ORIGINAL frozen advice stays on the snapshot untouched; this record is
 * the explicit, attributable statement of what was shown and what the
 * household made of it. Never a purchase outcome.
 *
 * v2 (task: override immutability) FREEZES the prediction side into the
 * event: the shown quantity's normalized measurement, the prediction's
 * provenance and its shown-day/at. Learning reads these frozen fields and
 * never re-resolves the live book — an override stays learnable after the
 * row or its snapshot is gone, and a later re-freeze of the same row id can
 * never rewrite what the household actually saw.
 */
export const quantityOverrideEvent = ({
  predictionId = null,
  subjectKey = null,
  originalQty = null,
  overrideQty = null,
  dimension = null,
  unit = null,
  predictionProvenance = null,
  predictionDay = null,
  predictionAt = null,
  prediction = null,
  day = null,
  at = null,
  actor = null,
  reason = null,
  id = null,
  listItemId = null,
} = {}) => ({
  id: id || `qov-${Math.random().toString(36).slice(2, 10)}`,
  type: 'quantity_override',
  schemaVersion: overrideVersion,
  predictionId: predictionId == null ? null : String(predictionId),
  subjectKey: subjectKey == null ? null : String(subjectKey),
  listItemId: listItemId == null ? null : String(listItemId),
  // Exactly what was displayed before the edit (the frozen advice is NOT
  // rewritten — this copy is the provenance of the learning signal).
  originalQty: originalQty == null ? null : String(originalQty),
  overrideQty: overrideQty == null ? null : String(overrideQty),
  // Measurement meaning copied from the prediction, never re-derived.
  dimension: dimension == null ? null : String(dimension),
  unit: unit == null ? null : String(unit),
  // v2 frozen prediction evidence — captured at stamp time, never resolved
  // live. `prediction` carries { originalQty, normalized } as shown.
  predictionProvenance: predictionProvenance == null ? null : String(predictionProvenance),
  predictionDay: predictionDay == null ? null : String(predictionDay).slice(0, 10),
  predictionAt: Number.isFinite(Number(predictionAt)) ? Number(predictionAt) : null,
  prediction: prediction && typeof prediction === 'object'
    ? {
      originalQty: prediction.originalQty == null ? null : String(prediction.originalQty),
      normalized: prediction.normalized && typeof prediction.normalized === 'object'
        ? { ...prediction.normalized }
        : null,
    }
    : null,
  day: day == null ? null : String(day).slice(0, 10),
  at: at || Date.now(),
  actor: actor == null ? null : String(actor),
  reason: reason == null ? null : String(reason),
});

export const SUPPORTED_OVERRIDE_SCHEMA_VERSIONS = [1, overrideVersion];
export const OVERRIDE_SCHEMA_REJECTION_REASONS = {
  MALFORMED: 'malformed-override-schema',
  UNKNOWN: 'unsupported-override-schema',
};

/** Version gate for stored override records — named reasons, never guesses. */
export const overrideSchemaStatus = (record) => {
  if (!record || typeof record !== 'object') return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.MALFORMED };
  const raw = record.schemaVersion;
  if (raw == null) return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.MALFORMED };
  const version = Number(raw);
  if (!Number.isInteger(version)) return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.MALFORMED };
  if (!SUPPORTED_OVERRIDE_SCHEMA_VERSIONS.includes(version)) {
    return { ok: false, reason: OVERRIDE_SCHEMA_REJECTION_REASONS.UNKNOWN };
  }
  // v1 events carry no frozen prediction evidence: they resolve against the
  // live book as labelled legacy; v2 events are self-contained.
  return { ok: true, version, legacy: version === 1 };
};
