/**
 * Override learning — the immutable `quantityOverrides` event history as a
 * REAL learning signal (tasks: make quantityOverrides part of real learning,
 * use override events in adaptation confidence, override immutability,
 * episode-level learning, recency).
 *
 * THE ONE ATTRIBUTION RULE. An override event may influence Forq's learning
 * only when it proves ALL of:
 *
 *   - a supported override schema version (unknown/malformed → named reason);
 *   - a valid prediction id AND frozen subject key;
 *   - a resolvable prediction — a v2 event carries its prediction FROZEN
 *     (provenance, shown day, normalized measurement), so it proves itself;
 *     legacy events resolve against the live book or frozen shop snapshots,
 *     never guessed;
 *   - that prediction's provenance is genuine Forq advice (manual rows and
 *     repeat-shop rows are the household overriding itself — excluded);
 *   - both quantities parse to a comparable measurement (the same engine,
 *     the same scale) with a non-zero original.
 *
 * EPISODES (task: episode-level learning): the edits of ONE shown prediction
 * form one episode — one learning story about one piece of advice. The
 * FINAL (latest `at`) edit of an episode is where that advice settled: it
 * counts for the episode's direction and magnitude; the earlier edits ride
 * as `editCount` metadata. Strength comes from DISTINCT predictions
 * (episodes), not raw edit volume: overriding four separate shown advices
 * is real evidence; fiddling four times with one number is not.
 *
 * RECENCY (task: recency): every dated edit is weighted by a deterministic
 * half-life decay (28 days) from the SUPPLIED evaluation `today` — never the
 * system clock of the moment. Weights scale what learning applies, and the
 * effective weight is exposed with the oldest/newest evidence and the exact
 * assumption, so the decay is auditable rather than hidden.
 *
 * Anything unprovable becomes EXCLUDED with a named reason — it never
 * becomes a number. Nothing here ever treats an override as a purchase
 * outcome: overrides change what Forq will SHOW (applyOverrideLearning) and
 * how strongly it trusts its own quantities (overridePressure), while
 * purchase outcomes live in purchase accuracy — the two evidence sources
 * are deliberately separate, so an override plus its later purchase are
 * never double-counted as two corrections of the same mistake.
 */

import { parseQuantity, convert } from './measure.js';
import { canonicalName } from './aliases.js';
import { dayStamp } from './kitchen-dates.js';
import { signedAgeDays, evaluationToday } from './evaluation-time.js';
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

/** Half-life (days) of the deterministic recency decay (task: recency). */
export const OVERRIDE_RECENCY_HALF_LIFE_DAYS = 28;

/**
 * Deterministic recency weight for one dated edit: 0.5^(age / half-life).
 * Age comes from the ONE evaluation clock (signedAgeDays); an undated edit
 * carries weight 1 — it cannot be decayed, so it is not. Future-dated edits
 * (negative age) also carry weight 1: they are valid evidence, merely oddly
 * dated, and a decay must never amplify them above certainty.
 */
export const overrideRecencyWeight = (day, today) => {
  const age = signedAgeDays(day, today);
  if (age == null || age <= 0) return 1;
  return round(0.5 ** (age / OVERRIDE_RECENCY_HALF_LIFE_DAYS), 4);
};

/**
 * Resolve the prediction a LEGACY override references — frozen evidence
 * only: the live snapshot book first (the row is still on show), then each
 * shop record's FROZEN snapshots (the row was already bought). Never
 * re-derived. v2 events with frozen prediction evidence skip this entirely.
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
 * learning): override rate, direction, relative magnitude, episodes per
 * subject, systematic over/underprediction, recency-weighted evidence and
 * confidence — with every rejected event named and counted.
 */
export const overrideLearningProfile = (state = {}, { today = dayStamp() } = {}) => {
  const events = Array.isArray(state.quantityOverrides) ? state.quantityOverrides : [];
  const excluded = [];
  const observations = [];
  const todayStamp = evaluationToday({ today });

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
    // OVERSIDE PROVENANCE (task: override immutability): a v2 event carries
    // its prediction frozen — provenance, shown day, normalized measurement
    // — and proves itself without the live book. A v2 event without the
    // frozen stamp (or a legacy v1 event) resolves the prediction like v1,
    // labelled legacy so the weaker evidence chain stays visible.
    let provenanceStatus = null;
    let evidenceChain = 'frozen-event';
    if (event.predictionProvenance != null) {
      provenanceStatus = provenanceStatusFor({
        provenance: event.predictionProvenance,
        sourceRecipes: [],
        fromRecipe: null,
      });
    } else {
      evidenceChain = 'resolved-book-legacy';
      const snap = resolvePrediction(state, event.predictionId);
      if (!snap) {
        excluded.push({ reason: 'prediction-not-found', eventId: at, predictionId: event.predictionId });
        continue;
      }
      provenanceStatus = provenanceStatusFor(snap);
    }
    if (!provenanceStatus.ok) {
      excluded.push({ reason: 'unknown-prediction-provenance', eventId: at, predictionId: event.predictionId });
      continue;
    }
    if (!provenanceStatus.evaluable) {
      // Manual rows and repeat-shop rows: the household changed its OWN
      // number — not evidence about Forq's advice. Excluded, named.
      excluded.push({ reason: 'not-forq-provenance', eventId: at, provenance: provenanceStatus.provenance, predictionId: event.predictionId });
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
      at: Number.isFinite(Number(event.at)) ? Number(event.at) : 0,
      evidenceChain,
      weight: overrideRecencyWeight(event.day, todayStamp),
    });
  }

  // ---- EPISODES (task: episode-level learning) ---------------------------
  // The edits of one shown prediction = one episode, ordered by `at`; the
  // FINAL edit is where that advice settled and counts for the episode's
  // direction and magnitude.
  const subjectMap = new Map();
  for (const row of observations) {
    if (!subjectMap.has(row.subjectKey)) {
      subjectMap.set(row.subjectKey, { subjectKey: row.subjectKey, rows: [] });
    }
    subjectMap.get(row.subjectKey).rows.push(row);
  }
  const bySubject = [...subjectMap.values()].map(({ subjectKey, rows }) => {
    const byPrediction = new Map();
    for (const row of rows) {
      if (!byPrediction.has(row.predictionId)) byPrediction.set(row.predictionId, []);
      byPrediction.get(row.predictionId).push(row);
    }
    const episodes = [...byPrediction.values()].map((edits) => {
      const ordered = [...edits].sort((a, b) => a.at - b.at || String(a.day ?? '').localeCompare(String(b.day ?? '')));
      const final = ordered[ordered.length - 1];
      const days = ordered.map((r) => r.day).filter(Boolean);
      return {
        predictionId: final.predictionId,
        editCount: ordered.length,
        eventIds: ordered.map((r) => r.eventId),
        direction: final.direction,
        meanRelativeDelta: final.relativeDelta,
        finalQty: final.overrideQty,
        firstDay: days.length ? days.reduce((a, b) => (a < b ? a : b)) : null,
        lastDay: days.length ? days.reduce((a, b) => (a > b ? a : b)) : null,
      };
    }).sort((a, b) => a.predictionId.localeCompare(b.predictionId));
    const consistent = episodes.every((ep) => ep.direction === episodes[0].direction);
    const distinctPredictions = episodes.length;
    const editCount = rows.length;
    const direction = !consistent ? 'mixed' : episodes[0].direction;
    const meanRelativeDelta = episodes.length
      ? round(episodes.reduce((s, ep) => s + ep.meanRelativeDelta, 0) / episodes.length, 4)
      : null;
    // STRENGTH FROM DISTINCT PREDICTIONS (task: episode-level learning):
    // one episode → weak; 2–3 independent confirmations → medium; 4+ →
    // high. Mixed episode directions stay weak — they cancel rather than
    // prove a direction.
    const strength = !consistent ? 'weak-mixed'
      : distinctPredictions >= 4 ? 'high'
        : distinctPredictions >= 2 ? 'medium'
          : 'weak';
    // RECENCY (task: recency): the episode-final edits carry the applied
    // evidence, so the subject's weight is their mean weight.
    const episodeFinals = episodes.map((ep) => {
      const finals = rows.filter((r) => r.predictionId === ep.predictionId);
      return finals.reduce((a, b) => (b.at >= a.at ? b : a));
    });
    const recencyWeight = round(episodeFinals.reduce((s, r) => s + r.weight, 0) / (episodeFinals.length || 1), 4);
    const days = rows.map((r) => r.day).filter(Boolean);
    return {
      subjectKey,
      count: editCount,
      editCount,
      episodeCount: distinctPredictions,
      direction,
      consistent,
      meanRelativeDelta,
      totalRelativeDelta: round(rows.reduce((s, r) => s + r.relativeDelta, 0), 4),
      strength,
      confidence: strength === 'high' ? 'high' : strength === 'medium' ? 'medium' : 'low',
      predictionIds: episodes.map((ep) => ep.predictionId),
      episodes,
      recencyWeight,
      effectiveSampleWeight: round(rows.reduce((s, r) => s + r.weight, 0) / (editCount || 1), 4),
      oldestEvidenceDay: days.length ? days.reduce((a, b) => (a < b ? a : b)) : null,
      newestEvidenceDay: days.length ? days.reduce((a, b) => (a > b ? a : b)) : null,
      lastOverrideDay: days.length ? days.reduce((a, b) => (a > b ? a : b)) : null,
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
  const dated = observations.filter((row) => row.day);
  const days = dated.map((row) => row.day);
  const effectiveSampleWeight = samples
    ? round(observations.reduce((s, r) => s + r.weight, 0) / samples, 4)
    : null;

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
    // RECENCY (task: recency): deterministic decay from the supplied
    // evaluation clock — exposed, never hidden in the number.
    effectiveSampleWeight,
    oldestEvidenceDay: days.length ? days.reduce((a, b) => (a < b ? a : b)) : null,
    newestEvidenceDay: days.length ? days.reduce((a, b) => (a > b ? a : b)) : null,
    recencyAssumption: !todayStamp
      ? `No usable evaluation clock: every edit carries weight 1 (recency decay needs a deterministic today).`
      : `Each dated edit is weighted 0.5^(ageDays / ${OVERRIDE_RECENCY_HALF_LIFE_DAYS}) from today ${todayStamp}; undated edits carry weight 1 (nothing is invented about their age).`,
    // Repeats + systematic bias. Overprediction = Forq showed too much (the
    // household kept reducing); underprediction = too little. Both count
    // DISTINCT prediction episodes, never raw edit volume.
    repeatedSubjects: bySubject.filter((row) => row.episodeCount >= 2).length,
    consistentSubjects: bySubject.filter((row) => row.consistent && row.episodeCount >= 2).length,
    systematic: {
      overprediction: bySubject.filter((row) => row.consistent && row.episodeCount >= 2 && row.direction === 'decrease').length,
      underprediction: bySubject.filter((row) => row.consistent && row.episodeCount >= 2 && row.direction === 'increase').length,
    },
    bySubject,
    confidence: samples >= 8 ? 'high' : samples >= 4 ? 'medium' : samples > 0 ? 'low' : 'none',
    evidence: samples,
    excluded,
    excludedReasons: countReasons(excluded),
    assumption: 'Attributable quantity-override events only: supported schema, resolvable (or v2-frozen) prediction id + frozen subject key, proven parseable quantities, and a referenced prediction whose provenance is genuine Forq advice. Edits of one shown prediction form one episode whose FINAL edit carries direction/magnitude; strength scales with DISTINCT overridden predictions. Manual/repeat rows, unprovable measurements and unknown schemas are excluded with named reasons. Overrides are NEVER purchase outcomes.',
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
 * Apply attributable override evidence to the quantities Forq will SHOW.
 *
 *   - only FORQ-ADVICE rows are targets (recipe/plan/top-up rows): Forq must
 *     not silently rewrite the household's own manual or repeat rows;
 *   - weak (one episode) and mixed-direction evidence changes NOTHING — it
 *     is recorded, not obeyed;
 *   - medium (2–3 distinct episodes) applies at half strength, high (4+) at
 *     full strength, and the whole factor is scaled by the subject's
 *     deterministic RECENCY weight (task: recency) — clamped to ±50%;
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
    // One-episode or inconsistent overrides are recorded but not obeyed.
    if (!row.consistent || row.strength === 'weak' || row.strength === 'weak-mixed') return item;
    if (!Number.isFinite(row.meanRelativeDelta)) return item;
    const strengthWeight = row.strength === 'high' ? 1 : 0.5;
    const recencyWeight = Number.isFinite(row.recencyWeight) ? row.recencyWeight : 1;
    const clamped = Math.max(-0.5, Math.min(0.5, row.meanRelativeDelta));
    const factor = clamped * strengthWeight * recencyWeight;
    if (Math.abs(factor) < 0.05) return item; // rounding-noise adjustments teach nothing
    const qty = adjustQty(item.qty, factor);
    if (qty == null) return item;
    changed = true;
    return {
      ...item,
      qty,
      overrideAdjustment: {
        count: row.editCount,
        episodeCount: row.episodeCount,
        direction: row.direction,
        strength: row.strength,
        recencyWeight,
        factor: round(factor),
      },
    };
  });
  return changed ? next : items;
};

/**
 * Override pressure (task: replace legacy override-pressure inference): how
 * often the household overrode what the app set. The QUANTITY-EDIT component
 * prefers the immutable `quantityOverrides` event history — schema-gated,
 * provenance-gated, counted per distinct still-visible row — instead of
 * inferring edits from the current list's `qty !== lastAutoQty`.
 * Substitutions and the portion override remain SEPARATE components. The
 * weighted edit count (task: recency) rides the evidence block so the decay
 * is visible here too.
 *
 * When no event book exists yet (legacy state), the old list inference runs
 * as a labelled fallback (`evidenceSource: 'list-inference-legacy'`).
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
  let weightedEdits = null;
  if (profile) {
    // Event-backed: attributable edits whose row is STILL on the list (the
    // same population the denominator counts), deduped per row — an edit to
    // a row already bought has left the live list and belongs to the
    // learning profile, not the live pressure reading.
    const listIds = new Set(list.filter((row) => row?.id != null).map((row) => String(row.id)));
    const currentRows = profile.observations
      .filter((row) => row.listItemId != null && listIds.has(String(row.listItemId)));
    const currentIds = new Set(currentRows.map((row) => String(row.listItemId)));
    quantityEdits = currentIds.size;
    weightedEdits = round(currentRows.reduce((s, r) => s + r.weight, 0) / (currentIds.size || 1), 4);
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
      ? 'Attributable quantity-override events (schema- and provenance-gated, rows still on the list) + substitutions + portion overrides over automatable decisions. Event history preferred over list inference; excluded events are named, never counted. The recency weight of the still-visible edits rides evidenceCounts.'
      : 'Edited auto-quantities (LEGACY list inference — no quantity-override event book yet), substitutions and portion overrides over automatable decisions.',
    evidenceSource,
    evidenceCounts: {
      quantityEdits,
      recencyWeightedEdits: weightedEdits,
      substitutions,
      portionOverride,
      autoRows,
      historicalEdits: profile ? Math.max(0, profile.samples - quantityEdits) : 0,
    },
    ...(editExcluded.length ? { excluded: editExcluded, excludedReasons: countReasons(editExcluded) } : {}),
  };
};
