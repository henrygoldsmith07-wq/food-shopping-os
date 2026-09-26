/**
 * Shopping quantity metrics — what Forq's list asked for vs what the
 * household actually bought, and what they told us afterwards.
 *
 * THE ONE PIPELINE. Two provenance routes enter the same aggregation, each
 * as one canonical observation row — but they are reported as THREE
 * separate answers (see shoppingQuantityError), never one blended accuracy:
 *
 *   { relativeError, signedError, absoluteDiff, dimension,
 *     source: 'purchase' | 'correction', predictionId, shopId, outcomeId }
 *
 *   - purchase observations — the shop record's own FROZEN prediction
 *     (`shop.predictions`, captured by buildShopRecord at purchase time):
 *     the exact advice the till run answered;
 *   - correction observations — direct household corrections
 *     (predictionCorrections, type 'shopping-qty'), handled by
 *     correction-measurements.js and only ever scored when the correction
 *     PROVES a comparable measurement.
 *
 * HISTORICAL TRUTH RULE: a purchase is evaluated ONLY against the
 * prediction frozen for that purchase. The live prediction book
 * (`state.shoppingPredictions`) describes the CURRENT list on screen — UI
 * state, not history — and is never consulted for an old shop. A purchase
 * with no frozen prediction is EXCLUDED and counted
 * (`no-frozen-prediction`), never matched against the live book by
 * ingredient name and never reconstructed from recipes.
 *
 * DETERMINISTIC TIME: the supplied `today` decides everything; future,
 * malformed and out-of-window records are excluded and counted.
 *
 * MEASUREMENT MEANING IS FROZEN: a v2 snapshot's engine-signed `normalized`
 * quantity is what scoring reads — a fresh parse of the displayed text is
 * only a deliberate fallback for legacy v1 rows, so a later parser change
 * can never reinterpret historical evidence. The outcome side is parsed
 * from the frozen bought-row text and brought onto the same scale — mass
 * with mass, volume with volume, counts with counts; only the engine's own
 * density table may bridge scales. Absolute error is computed PER DIMENSION
 * over that dimension's own samples only.
 *
 * Every metric carries { value, confidence, evidence, assumption } plus the
 * standardised diagnostics block — samples, the full excluded list with
 * reason counts, and the evaluation window — and reports honest silence
 * (null) where the data cannot support a number. Nothing is filtered
 * silently: every dropped record is named and counted. Money-side metrics
 * (spendAccuracy, basketReconciliation) live in record-metrics.js and are
 * re-exported below for stable import paths.
 */

import { dayStamp } from './kitchen-dates.js';
import { parseQuantity, convert } from './measure.js';
import { canonicalName } from './aliases.js';
import {
  evaluationToday,
  gateRecordDay,
} from './evaluation-time.js';
import {
  validatePredictionSnapshotWithReason,
} from './shopping-predictions.js';
import { collectCorrectionEvidence } from './correction-measurements.js';
import { countReasons, RECENT_SHOP_WINDOW_DAYS } from './record-metrics.js';

export { spendAccuracy, basketReconciliation, snapshotCosts, RECENT_SHOP_WINDOW_DAYS } from './record-metrics.js';

const metric = (value, { confidence = 'none', evidence = 0, assumption = '' } = {}) => ({
  value, confidence, evidence, assumption,
});

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

const parseMemo = new Map();
const parseOnce = (qty, ingredient) => {
  const key = `${ingredient}\u0000${qty}`;
  let parsed = parseMemo.get(key);
  if (parsed === undefined) {
    parsed = parseQuantity(qty, { ingredient });
    if (parseMemo.size > 2000) parseMemo.clear(); // bounded: quantities repeat heavily
    parseMemo.set(key, parsed ?? null);
  }
  return parsed;
};

export const shoppingQuantityError = (state = {}, { today = dayStamp() } = {}) => {
  // The ONE clock (see evaluation-time.js): the supplied `today`, never a
  // fresh read of the real date inside the calculation. A malformed `today`
  // cannot place any sample in time, so nothing is scored.
  const todayStamp = evaluationToday({ today });
  const aliasMemory = state.aliasMemory || {};

  // Purchase accuracy and explicit-correction accuracy are answered
  // separately (see the return shape): one comparison of advice vs till run,
  // one of advice vs what the household said. The combined arrays below are
  // the learning signal — kept, but never presented as one accuracy.
  const purchaseObs = [];
  const correctionObs = [];
  const excluded = [];

  const meanOf = (rows, pick) => (rows.length ? rows.reduce((s, r) => s + pick(r), 0) / rows.length : null);

  // The guard at the door: a malformed observation never reaches the
  // aggregation — it is excluded and counted, so the sample size cannot
  // silently flatter itself. Every exclusion is tagged with its route
  // ('purchase' | 'correction') so each split metric reports its own
  // diagnostics without any silent filtering.
  const pushObservation = (o, bucket = purchaseObs, source = 'purchase') => {
    if (![o.relativeError, o.signedError, o.absoluteDiff].every((n) => Number.isFinite(n))) {
      excluded.push({ source, reason: 'non-finite-observation', name: o.name ?? null, predictionId: o.predictionId ?? null, shopId: o.shopId ?? null, outcomeId: o.outcomeId ?? null });
      return;
    }
    bucket.push(o);
  };

  // --- direct corrections: the household told us the number was wrong ------
  // Same pipeline, same observation shape, same guards as purchases — but
  // CATEGORICALLY SEPARATE evidence: explicit feedback must never contaminate
  // purchase accuracy. The measurement-semantics pipeline — the proven
  // measurement block, the schema-version gate, censored "3+" directional
  // evidence — lives in correction-measurements.js and shares THIS guard
  // (pushObservation) and THIS excluded list, so one reason vocabulary
  // covers both routes.
  const { directionalEvidence } = collectCorrectionEvidence({
    corrections: state.predictionCorrections,
    todayStamp,
    excluded,
    correctionObs,
    pushObservation,
  });

  // --- purchases: evaluated ONLY against each shop's own frozen predictions --
  for (const shop of Array.isArray(state.shops) ? state.shops : []) {
    const shopId = shop?.id || null;
    const items = Array.isArray(shop?.items) ? shop.items : [];
    const excludeShop = (reason) => {
      if (!items.length) excluded.push({ source: 'purchase', reason, name: null, shopId });
      for (const item of items) excluded.push({ source: 'purchase', reason, name: item?.name || null, shopId });
    };
    // The shop gate rides the shared evaluation-time policy (one clock, one
    // window, one reason vocabulary across every accuracy metric).
    const gate = gateRecordDay(shop?.date, todayStamp, { windowDays: RECENT_SHOP_WINDOW_DAYS });
    if (gate !== 'ok') {
      excludeShop(
        gate === 'malformed-day' ? 'malformed-shop-date'
          : gate === 'future' ? 'future-shop'
          : gate === 'no-evaluation-today' ? 'invalid-evaluation-today'
          : 'outside-evaluation-window',
      );
      continue;
    }
    // The frozen book for THIS shop — the advice the till run answered.
    // The live prediction book is deliberately not consulted here.
    const frozen = new Map(
      (Array.isArray(shop?.predictions) ? shop.predictions : [])
        .filter((p) => p && p.id != null)
        .map((p) => [p.id, p]),
    );
    for (const item of items) {
      if (!item?.name) continue;
      if (item?.qty == null || item?.qty === '') {
        excluded.push({ source: 'purchase', reason: 'unrecorded-purchase-quantity', name: item.name, shopId });
        continue;
      }
      const rawPrediction = (item.id != null && frozen.get(item.id)) || null;
      if (!rawPrediction) {
        // No frozen snapshot for this row. If the freeze step recorded WHY
        // (the snapshot failed the canonical gate at purchase), report that
        // named reason instead of a generic miss — the drop was never silent.
        const rejection = (Array.isArray(shop?.predictionRejections) ? shop.predictionRejections : [])
          .find((r) => r && r.id === item.id);
        excluded.push({ source: 'purchase', reason: rejection?.reason || 'no-frozen-prediction', name: item.name, shopId });
        continue;
      }
      // Central validation: the ONE canonical schema gate decides whether
      // this frozen snapshot can be scored at all — id, quantity, dimension,
      // subject identity and provenance. No partial re-derivation here; a
      // malformed snapshot is excluded with the gate's own reason.
      const gate = validatePredictionSnapshotWithReason(rawPrediction, { aliasMemory });
      if (!gate.ok) {
        excluded.push({ source: 'purchase', reason: gate.reason, name: item.name, shopId, predictionId: gate.snapshot?.id || rawPrediction.id || null });
        continue;
      }
      const prediction = gate.snapshot;
      // PROVENANCE GATE (task: freeze prediction provenance): only genuine
      // Forq-generated advice moves Forq's claimed accuracy. The household's
      // own rows, repeated shops and overridden quantities are frozen and
      // labelled but EXCLUDED from purchase accuracy — a manual quantity must
      // never improve or worsen Forq's model. The frozen flag rides the
      // snapshot, so the decision was made at prediction time, not re-derived.
      // Legacy v1 rows (pre-provenance) keep the historical semantic — they
      // scored before provenance existed — and are LABELLED as defaulted;
      // never silently reinterpreted under the modern rule.
      if (!prediction.evaluableForPredictionAccuracy && !prediction.legacy) {
        excluded.push({ source: 'purchase', reason: 'not-forq-provenance', provenance: prediction.provenance, name: item.name, shopId, predictionId: prediction.id });
        continue;
      }
      // Substitution lineage: a row that was substituted to a DIFFERENT
      // ingredient kept its row id — the frozen snapshot no longer describes
      // what was bought, so scoring it would answer "how close was the Rice
      // advice to the Quinoa till run?" It is excluded, never re-matched by
      // name against the live book.
      if (prediction.isSubstitution) {
        excluded.push({ source: 'purchase', reason: 'substituted-row-not-comparable', name: item.name, shopId, predictionId: prediction.id, substitutedFrom: prediction.substitutedFrom });
        continue;
      }
      // Subject identity (frozen): prediction ID + canonical subject must
      // BOTH agree, and the PREDICTION side is read from what was frozen —
      // a v2 snapshot's stored subjectKey is used as-is, so a later alias
      // lesson can never re-describe it. The OUTCOME side reads the subject
      // frozen onto the bought row at purchase time when present; legacy
      // rows resolve at read time (deliberate, labelled).
      const outcomeSubject = (item.subjectKey != null && String(item.subjectKey).trim() !== '')
        ? String(item.subjectKey).trim()
        : (canonicalName(String(item.name).trim(), aliasMemory) || String(item.name).trim().toLowerCase());
      if (!outcomeSubject || outcomeSubject !== prediction.subjectKey) {
        excluded.push({ source: 'purchase', reason: 'prediction-subject-mismatch', name: item.name, shopId, predictionId: prediction.id, predictedSubject: prediction.subjectKey, outcomeSubject, subjectKeyProvenance: prediction.subjectKeyProvenance });
        continue;
      }
      // Measurement meaning (frozen evidence): a v2 snapshot froze the
      // engine-signed normalized quantity — scoring reads THAT, never a
      // fresh parse (a parser change must not be able to reinterpret
      // historical evidence). Legacy rows parse deliberately, at read time,
      // labelled.
      const frozenMeasurement = prediction.normalized
        && Number.isFinite(Number(prediction.normalized.amount))
        && prediction.normalized.dim
        ? { amount: Number(prediction.normalized.amount), dim: prediction.normalized.dim }
        : null;
      if (!frozenMeasurement && !prediction.legacy) {
        excluded.push({ source: 'purchase', reason: 'frozen-measurement-missing', name: item.name, qty: prediction.qty, shopId, predictionId: prediction.id });
        continue;
      }
      const planned = frozenMeasurement || parseOnce(prediction.qty, item.name);
      if (!planned || !(planned.amount > 0)) {
        excluded.push({ source: 'purchase', reason: 'unreadable-predicted-qty', name: item.name, qty: prediction.qty, shopId });
        continue;
      }
      let bought = parseOnce(item.qty, item.name);
      if (!bought || !(bought.amount > 0)) {
        excluded.push({ source: 'purchase', reason: 'unreadable-purchased-qty', name: item.name, qty: item.qty, shopId });
        continue;
      }
      if (bought.dim !== planned.dim) {
        // Different scale: only the engine's own density table may bridge
        // it (e.g. "1 tin" → 400 ml → 392 g of coconut milk). No bridge:
        // excluded and counted, never guessed into comparability.
        const converted = convert(bought, planned.dim, { ingredient: item.name });
        if (!converted || !(converted.amount > 0)) {
          excluded.push({ source: 'purchase', reason: 'incompatible-dimensions', name: item.name, predicted: planned.dim, purchased: bought.dim, shopId });
          continue;
        }
        bought = converted;
      }
      const delta = bought.amount - planned.amount;
      pushObservation({
        relativeError: Math.abs(delta) / planned.amount,
        signedError: delta / planned.amount,
        absoluteDiff: Math.abs(delta),
        dimension: planned.dim,
        source: 'purchase',
        responseType: 'exact',
        predictionId: prediction.id,
        subjectKey: prediction.subjectKey,
        subjectKeyProvenance: prediction.subjectKeyProvenance, // frozen vs legacy-resolved
        shopId,
        outcomeId: null,
        name: item.name,
        shownAt: prediction.day || prediction.at || null, // when this advice was on show
      }, purchaseObs, 'purchase');
    }
  }

  const samplesByDimOf = (rows) => Object.fromEntries(
    ['mass', 'volume', 'count'].map((dim) => [dim, rows.filter((o) => o.dimension === dim).length]),
  );
  // Absolute error only means something within one scale — computed PER
  // DIMENSION over that dimension's own samples: mass MAE over mass
  // observations, volume MAE over volume observations, count MAE over count
  // observations. Never a dimension's error total over the global count.
  const absoluteErrorsByDimOf = (rows) => Object.fromEntries(
    ['mass', 'volume', 'count']
      .map((dim) => {
        const dimRows = rows.filter((o) => o.dimension === dim);
        return [dim, round(meanOf(dimRows, (o) => o.absoluteDiff))];
      })
      .filter(([, v]) => v != null),
  );

  // THREE answers, never one blended number:
  //   purchaseQuantityAccuracy — the till run vs the advice it answered;
  //   explicitQuantityCorrectionAccuracy — the household's EXACT proven-measurement
  //     answers vs that advice (censored "3+" rows never enter it);
  //   combinedLearningSignal — both sources together, explicitly labelled so
  //     no consumer can mistake the learning view for purchase accuracy.
  // The ROOT of the result IS the purchase accuracy (the root value must
  // not silently blend purchase + correction feedback). Each view carries
  // the standard diagnostics: samples, exclusions with reason counts,
  // confidence, assumption and evaluation window — nothing filtered
  // silently.
  const summarise = (rows, viewExcluded, assumption, windowDays) => {
    const samples = rows.length;
    return {
      ...metric(round(meanOf(rows, (o) => o.relativeError)), {
        confidence: samples >= 10 ? 'high' : samples >= 4 ? 'medium' : samples > 0 ? 'low' : 'none',
        evidence: samples,
        assumption,
      }),
      samples,
      samplesByDim: samplesByDimOf(rows),
      signedBias: round(meanOf(rows, (o) => o.signedError)),
      absoluteErrorsByDim: absoluteErrorsByDimOf(rows),
      observations: rows,
      excluded: viewExcluded,
      excludedReasons: countReasons(viewExcluded),
      evaluationWindowDays: windowDays,
    };
  };
  const PURCHASE_ASSUMPTION = 'Purchase accuracy: relative error |bought − predicted| ÷ predicted, on a shared scale via the measurement engine, against each shop\'s OWN frozen prediction snapshots (never the live list book). Incompatible quantities, unfrozen rows, substituted rows, subject mismatches and out-of-window or future records are excluded and counted — never filtered silently.';
  const CORRECTION_ASSUMPTION = 'Explicit correction accuracy: only household answers that PROVE a count measurement (the v2 frozen measurement block on a shopping-qty correction) are scored; censored "3+" bounds and every correction that cannot prove compatible units/dimensions stay qualitative learning evidence (correction-measurement-unproven), excluded and counted. No recency window: all recorded corrections are considered.';
  const COMBINED_ASSUMPTION = 'LEARNING SIGNAL, not an accuracy display: purchase observations and proven-measurement exact corrections averaged together. Never present this as shopping accuracy — the purchase-only answer is purchaseQuantityAccuracy (and this result\'s own root value).';
  const purchase = summarise(purchaseObs, excluded.filter((e) => e.source === 'purchase'), PURCHASE_ASSUMPTION, RECENT_SHOP_WINDOW_DAYS);
  const explicit = summarise(correctionObs, excluded.filter((e) => e.source === 'correction'), CORRECTION_ASSUMPTION, null);
  const combined = summarise(
    [...purchaseObs, ...correctionObs],
    excluded,
    COMBINED_ASSUMPTION,
    null,
  );
  return {
    // Versioned result schema: v2 split the metrics but left the root value
    // blended; v3 makes the ROOT the purchase accuracy alone.
    version: 3,
    // ROOT = PURCHASE ACCURACY ONLY. The combined learning signal lives
    // ONLY under combinedLearningSignal, explicitly labelled, so no
    // consumer can accidentally display it as shopping accuracy.
    ...purchase,
    purchaseQuantityAccuracy: purchase,
    explicitQuantityCorrectionAccuracy: { ...explicit, directionalEvidence },
    combinedLearningSignal: { ...combined, directionalEvidence },
    excluded,
  };
};
