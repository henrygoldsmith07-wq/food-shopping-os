/**
 * Override learning — the immutable `quantityOverrides` event history as a
 * REAL learning signal (tasks: make quantityOverrides part of real learning,
 * use override events in adaptation confidence, replace legacy
 * override-pressure inference).
 *
 * THE ONE ATTRIBUTION RULE. An override event may influence Forq's learning
 * only when it proves ALL of:
 *
 *   - a supported override schema version (unknown/malformed → named reason);
 *   - a valid prediction id AND frozen subject key;
 *   - a resolvable prediction — found in the LIVE book or on a FROZEN shop
 *     record, never guessed;
 *   - that prediction's provenance is genuine Forq advice (manual rows and
 *     repeat-shop rows are the household overriding itself — excluded);
 *   - both quantities parse to a comparable measurement (the same engine,
 *     the same scale) with a non-zero original.
 *
 * Anything unprovable becomes EXCLUDED with a named reason — it never
 * becomes a number. Nothing here ever treats an override as a purchase
 * outcome: overrides change what Forq will SHOW (applyOverrideLearning) and
 * how strongly it trusts its own quantities (overridePressure), while
 * purchase outcomes live in purchase accuracy — the two evidence sources
 * are deliberately separate, so an override plus its later purchase are
 * never double-counted as two corrections of the same mistake.
 *
 * STRENGTH BY CONSISTENCE: a one-off override is weak evidence and changes
 * nothing; repeated, same-direction, attributable overrides strengthen
 * (medium at 2–3, high at 4+) and scale the quantity adjustment Forq will
 * next show for that subject.
 */

import { parseQuantity, convert } from './measure.js';
import { canonicalName } from './aliases.js';
import { dayStamp } from './kitchen-dates.js';
import {
  overrideSchemaStatus,
  provenanceStatusFor,
} from './prediction-evidence.js';

const round = (n, places = 2) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

const countReasons = (excluded = []) => (excluded || []).reduce((counts, e) => {
  if (e?.reason) counts[e.reason] = (counts[e.reason] || 0) + 1;
  return counts;
}, {});

/** The subject key used everywhere else in the evidence pipeline. */
const keyFor = (name, aliases = {}) =>
  canonicalName(String(name || '').trim(), aliases) || String(name || '').trim().toLowerCase() || null;

/**
 * Resolve the prediction an override references — frozen evidence only:
 * the live snapshot book first (the row is still on show), then each shop
 * record's FROZEN snapshots (the row was already bought). Never re-derived.
 */
const resolvePrediction = (state, predictionId) => {
  const id = String(predictionId);
  const live = (Array.isArray(state.shoppingPredictions) ? state.shoppingPredictions : [])
    .find((snap) => snap && String(snap.id) === id);
  if (live) return live;
  for (const shop of Array.isArray(state.shops) ? state.shops : []) {
    const frozen = (Array.isArray(shop?.predictions) ? shop.predictions : [])
      .find((snap) => snap && String(snap.predictionId ?? snap.id) === id);
    if (frozen) return frozen;
  }
  return null;
};

/**
 * The override learning profile (task: make quantityOverrides part of real
 * learning): override rate, direction, relative magnitude, repeated
 * overrides per subject, systematic over/underprediction, and confidence by
 * sample count — with every rejected event named and counted.
 */
export const overrideLearningProfile = (state = {}, { today = dayStamp() } = {}) => {
  void today; // deterministic inputs only; events carry their own day
  const events = Array.isArray(state.quantityOverrides) ? state.quantityOverrides : [];
  const excluded = [];
  const observations = [];

  for (const event of events) {
    const at = event?.id ?? null;
    const schema = overrideSchemaStatus(event);
    if (!schema.ok) {
      excluded.push({ reason: schema.reason, eventId: at });
      continue;
    }
    if (!event.predictionId) {
      excluded.push({ reason: 'missing-prediction-id', eventId: at });
      continue;
    }
    if (!event.subjectKey) {
      excluded.push({ reason: 'missing-subject-key', eventId: at });
      continue;
    }
    const snap = resolvePrediction(state, event.predictionId);
    if (!snap) {
      excluded.push({ reason: 'prediction-not-found', eventId: at, predictionId: event.predictionId });
      continue;
    }
    const status = provenanceStatusFor(snap);
    if (!status.ok) {
      excluded.push({ reason: 'unknown-prediction-provenance', eventId: at, predictionId: event.predictionId });
      continue;
    }
    if (!status.evaluable) {
      // Manual rows and repeat-shop rows: the household changed its OWN
      // number — not evidence about Forq's advice. Excluded, named.
      excluded.push({ reason: 'not-forq-provenance', eventId: at, provenance: status.provenance, predictionId: event.predictionId });
      continue;
    }
    const ingredient = String(event.subjectKey);
    const original = parseQuantity(event.originalQty, { ingredient });
    const overridden = parseQuantity(event.overrideQty, { ingredient });
    if (!original || !(original.amount > 0) || !overridden || !(overridden.amount > 0)) {
      excluded.push({ reason: 'unprovable-measurement', eventId: at, predictionId: event.predictionId });
      continue;
    }
    let changed = overridden;
    if (changed.dim !== original.dim) {
      const converted = convert(changed, original.dim, { ingredient });
      if (!converted || !(converted.amount > 0)) {
        excluded.push({ reason: 'incompatible-dimensions', eventId: at, predictionId: event.predictionId });
        continue;
      }
      changed = converted;
    }
    const delta = changed.amount - original.amount;
    if (Math.abs(delta) < 1e-9) {
      // A same-value edit teaches nothing about direction or magnitude.
      excluded.push({ reason: 'no-quantity-change', eventId: at, predictionId: event.predictionId });
      continue;
    }
    observations.push({
      eventId: at,
      predictionId: String(event.predictionId),
      subjectKey: ingredient,
      listItemId: event.listItemId ?? null,
      originalQty: String(event.originalQty),
      overrideQty: String(event.overrideQty),
      dimension: original.dim,
      delta: round(delta, 4),
      relativeDelta: round(delta / original.amount, 4),
      direction: delta > 0 ? 'increase' : 'decrease',
      day: event.day ?? null,
    });
  }

  // Per-subject aggregation: repeats, consistency and strength.
  const subjectMap = new Map();
  for (const row of observations) {
    if (!subjectMap.has(row.subjectKey)) {
      subjectMap.set(row.subjectKey, {
        subjectKey: row.subjectKey,
        count: 0,
        increases: 0,
        decreases: 0,
        relativeDeltas: [],
        predictionIds: new Set(),
        lastDay: null,
      });
    }
    const entry = subjectMap.get(row.subjectKey);
    entry.count += 1;
    if (row.direction === 'increase') entry.increases += 1;
    else entry.decreases += 1;
    entry.relativeDeltas.push(row.relativeDelta);
    entry.predictionIds.add(row.predictionId);
    if (row.day && (!entry.lastDay || row.day > entry.lastDay)) entry.lastDay = row.day;
  }
  const bySubject = [...subjectMap.values()].map((entry) => {
    const consistent = entry.increases === 0 || entry.decreases === 0;
    const direction = entry.increases > 0 && entry.decreases > 0
      ? 'mixed'
      : entry.increases > 0 ? 'increase' : 'decrease';
    const meanRelativeDelta = entry.relativeDeltas.length
      ? round(entry.relativeDeltas.reduce((s, v) => s + v, 0) / entry.relativeDeltas.length, 4)
      : null;
    // One-off → weak; repeated and consistent → stronger (task: repeated
    // consistent override → stronger evidence). Mixed repeats stay weak —
    // they cancel rather than prove a direction.
    const strength = !consistent ? 'weak-mixed'
      : entry.count >= 4 ? 'high'
        : entry.count >= 2 ? 'medium'
          : 'weak';
    return {
      subjectKey: entry.subjectKey,
      count: entry.count,
      direction,
      consistent,
      meanRelativeDelta,
      totalRelativeDelta: round(entry.relativeDeltas.reduce((s, v) => s + v, 0), 4),
      strength,
      confidence: strength === 'high' ? 'high' : strength === 'medium' ? 'medium' : 'low',
      predictionIds: [...entry.predictionIds],
      lastOverrideDay: entry.lastDay,
    };
  }).sort((a, b) => b.count - a.count || String(a.subjectKey).localeCompare(String(b.subjectKey)));

  // Override rate: attributable overrides ÷ every Forq-advised quantity
  // ever shown (live book + frozen shop snapshots, deduped by id). Manual
  // and repeat rows are neither numerator nor denominator.
  const adviceIds = new Set();
  const collectAdvice = (snaps) => {
    for (const snap of snaps || []) {
      if (!snap || snap.id == null) continue;
      const status = provenanceStatusFor(snap);
      if (status.ok && status.evaluable) adviceIds.add(String(snap.predictionId ?? snap.id));
    }
  };
  collectAdvice(state.shoppingPredictions);
  for (const shop of Array.isArray(state.shops) ? state.shops : []) collectAdvice(shop?.predictions);
  const adviceShown = adviceIds.size;
  const samples = observations.length;
  const increases = observations.filter((row) => row.direction === 'increase').length;
  const decreases = observations.filter((row) => row.direction === 'decrease').length;

  return {
    samples,
    observations,
    // Rate + magnitude (task: override rate, direction, relative magnitude).
    overrideRate: adviceShown ? round(samples / adviceShown) : null,
    adviceShown,
    directions: { increase: increases, decrease: decreases },
    meanRelativeDelta: samples
      ? round(observations.reduce((s, row) => s + row.relativeDelta, 0) / samples, 4)
      : null,
    // Repeats + systematic bias (task: repeated overrides by subject,
    // systematic over/underprediction). Overprediction = Forq showed too
    // much (the household kept reducing); underprediction = too little.
    repeatedSubjects: bySubject.filter((row) => row.count >= 2).length,
    consistentSubjects: bySubject.filter((row) => row.consistent && row.count >= 2).length,
    systematic: {
      overprediction: bySubject.filter((row) => row.consistent && row.count >= 2 && row.direction === 'decrease').length,
      underprediction: bySubject.filter((row) => row.consistent && row.count >= 2 && row.direction === 'increase').length,
    },
    bySubject,
    confidence: samples >= 8 ? 'high' : samples >= 4 ? 'medium' : samples > 0 ? 'low' : 'none',
    evidence: samples,
    excluded,
    excludedReasons: countReasons(excluded),
    assumption: 'Attributable quantity-override events only: supported schema, resolvable prediction id + frozen subject key, proven parseable quantities, and a referenced prediction whose provenance is genuine Forq advice. Manual/repeat rows, unprovable measurements and unknown schemas are excluded with named reasons. Overrides are NEVER purchase outcomes — they adjust what Forq shows (applyOverrideLearning) and are kept out of purchase/correction accuracy entirely.',
  };
};

const CONTINUOUS_UNITS = /^(?:g|gram|grams|ml|millilitre|millilitres|milliliter|milliliters|cl)$/i;
const LARGE_CONTINUOUS_UNITS = /^(?:kg|kilo|kilos|kilogram|kilograms|l|litre|litres|liter|liters)$/i;
const COUNT_UNITS = /^(?:tin|tins|can|cans|pack|packs|bag|bags|box|boxes|bottle|bottles|jar|jars|carton|cartons|loaf|loaves|punnet|punnets|piece|pieces|x)$/i;

/**
 * One quantity adjustment, scaled to the unit: continuous units round to a
 * sensible precision (5 g / 5 ml steps), large units to 2 decimals, counts
 * ceil to whole units (never below 1). Returns null when the format cannot
 * be adjusted safely or the adjustment rounds away to no visible change.
 */
const adjustQty = (qty, factor) => {
  const match = String(qty || '').trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].trim();
  if (!Number.isFinite(value) || value <= 0) return null;
  const nextRaw = value * (1 + factor);
  if (!Number.isFinite(nextRaw) || nextRaw <= 0) return null;
  let next;
  if (CONTINUOUS_UNITS.test(unit)) next = Math.max(5, Math.round(nextRaw / 5) * 5);
  else if (LARGE_CONTINUOUS_UNITS.test(unit)) next = Math.round(nextRaw * 100) / 100;
  else next = Math.max(1, Math.ceil(nextRaw - 1e-9)); // counts and unitless
  const formatted = `${next}${unit ? ` ${unit}` : ''}`;
  return formatted === String(qty || '').trim() ? null : formatted;
};

/**
 * Apply attributable override evidence to the quantities Forq will SHOW
 * (task: use override events in adaptation confidence — repeated reductions
 * lower the future quantity, repeated increases raise it).
 *
 *   - only FORQ-ADVICE rows are targets (recipe/plan/top-up rows): Forq must
 *     not silently rewrite the household's own manual or repeat rows;
 *   - weak (one-off) and mixed-direction evidence changes NOTHING — it is
 *     recorded, not obeyed;
 *   - medium (2–3 consistent) applies at half strength, high (4+) at full
 *     strength — confidence by sample count, clamped to ±50%;
 *   - existing waste learning still runs FIRST: this ADDS an evidence
 *     source beside waste/pantry/portion evidence, never replacing it.
 *
 * The adjusted quantity is what the snapshot freezes — so a later purchase
 * scores against the shown number exactly once. The override event itself
 * never enters purchase accuracy: no double-counting.
 */
export const applyOverrideLearning = (items = [], profile = null) => {
  const rows = Array.isArray(profile?.bySubject) ? profile.bySubject : null;
  if (!Array.isArray(items) || !items.length || !rows?.length) return items;
  const byKey = new Map(rows.map((row) => [row.subjectKey, row]));
  let changed = false;
  const next = items.map((item) => {
    const row = byKey.get(keyFor(item?.name));
    if (!row || !item) return item;
    const forqTarget = item.fromRecipe
      || (Array.isArray(item.sourceRecipes) && item.sourceRecipes.length)
      || item.autoGenerated;
    if (!forqTarget) return item;
    // One-off or inconsistent overrides are recorded but not obeyed.
    if (!row.consistent || row.strength === 'weak' || row.strength === 'weak-mixed') return item;
    if (!Number.isFinite(row.meanRelativeDelta)) return item;
    const weight = row.strength === 'high' ? 1 : 0.5;
    const clamped = Math.max(-0.5, Math.min(0.5, row.meanRelativeDelta));
    const factor = clamped * weight;
    if (Math.abs(factor) < 0.05) return item; // rounding-noise adjustments teach nothing
    const qty = adjustQty(item.qty, factor);
    if (qty == null) return item;
    changed = true;
    return {
      ...item,
      qty,
      overrideAdjustment: {
        count: row.count,
        direction: row.direction,
        strength: row.strength,
        factor: round(factor),
      },
    };
  });
  return changed ? next : items;
};

/**
 * Override pressure (task: replace legacy override-pressure inference): how
 * often the household overrode what the app set. The QUANTITY-EDIT component
 * now prefers the immutable `quantityOverrides` event history — schema-gated,
 * provenance-gated, counted per distinct still-visible row — instead of
 * inferring edits from the current list's `qty !== lastAutoQty`. Substitutions
 * and the portion override remain SEPARATE, explicitly modelled components.
 *
 * When no event book exists yet (legacy state), the old list inference runs
 * as a labelled fallback (`evidenceSource: 'list-inference-legacy'`) — never
 * silently presented as event-backed evidence. Evidence counts and
 * assumptions are exposed either way.
 */
export const overridePressure = (state = {}, { today = dayStamp() } = {}) => {
  const list = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  const events = Array.isArray(state.quantityOverrides) ? state.quantityOverrides : [];
  const profile = events.length ? overrideLearningProfile(state, { today }) : null;

  const autoRows = list.filter((row) => row.fromRecipe && row.lastAutoQty != null).length;
  const portionOverride = state.portionsOverride != null && state.portionsOverride !== 'auto' ? 1 : 0;
  const substitutions = (Array.isArray(state.householdLedger) ? state.householdLedger : [])
    .filter((e) => e.type === 'MealCooked' && e.substituted).length;

  let quantityEdits;
  let evidenceSource;
  let editExcluded = [];
  if (profile) {
    // Event-backed: attributable edits whose row is STILL on the list (the
    // same population the denominator counts), deduped per row — an edit to
    // a row already bought has left the live list and belongs to the
    // learning profile, not the live pressure reading.
    const listIds = new Set(list.filter((row) => row?.id != null).map((row) => String(row.id)));
    const currentRows = new Set(
      profile.observations
        .filter((row) => row.listItemId != null && listIds.has(String(row.listItemId)))
        .map((row) => String(row.listItemId)),
    );
    quantityEdits = currentRows.size;
    evidenceSource = 'quantity-override-events';
    editExcluded = profile.excluded;
  } else {
    // Legacy fallback (labelled): no event book yet — infer from the list
    // exactly as the pre-event implementation did.
    quantityEdits = list.filter((row) => row.fromRecipe && row.lastAutoQty != null && row.qty !== row.lastAutoQty).length;
    evidenceSource = 'list-inference-legacy';
  }

  const numerator = quantityEdits + substitutions + portionOverride;
  const denominator = autoRows + substitutions + 1; // +1 keeps a lone portion override representable
  const value = Math.round((numerator / denominator) * 100) / 100;
  return {
    value,
    confidence: autoRows + substitutions >= 8 ? 'high' : autoRows + substitutions >= 3 ? 'medium' : 'low',
    evidence: autoRows + substitutions,
    assumption: profile
      ? 'Attributable quantity-override events (schema- and provenance-gated, rows still on the list) + substitutions + portion overrides over automatable decisions. Event history preferred over list inference; excluded events are named, never counted.'
      : 'Edited auto-quantities (LEGACY list inference — no quantity-override event book yet), substitutions and portion overrides over automatable decisions.',
    evidenceSource,
    evidenceCounts: {
      quantityEdits,
      substitutions,
      portionOverride,
      autoRows,
      historicalEdits: profile ? Math.max(0, profile.samples - quantityEdits) : 0,
    },
    ...(editExcluded.length ? { excluded: editExcluded, excludedReasons: countReasons(editExcluded) } : {}),
  };
};
