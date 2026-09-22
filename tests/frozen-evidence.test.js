/**
 * Frozen-evidence invariants: for every scored sample, Forq must be able to
 * prove the exact frozen subject, the exact measurement meaning, the exact
 * prediction shown, the exact outcome observed — and that later alias or
 * schema changes cannot alter what that historical evidence meant.
 *
 * Anything unprovable is excluded from numerical accuracy with a named
 * reason and retained only as labelled qualitative learning evidence.
 */
import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import {
  buildShopRecord,
  upsertPredictions,
  validatePredictionSnapshotWithReason,
  snapshotSchemaStatus,
  SNAPSHOT_REJECTION_REASONS,
  SNAPSHOT_SCHEMA_VERSION,
  SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS,
} from '../src/lib/shopping-predictions.js';
import { shoppingQuantityError, spendAccuracy, basketReconciliation } from '../src/lib/eval-metrics.js';
import { basketPredictionEvent } from '../src/lib/prediction-evidence.js';
import {
  predictionCorrectionEvent,
  predictionLearningProfile,
  correctionSchemaStatus,
  CORRECTION_SCHEMA_VERSION,
  SUPPORTED_CORRECTION_SCHEMA_VERSIONS,
} from '../src/lib/prediction-feedback.js';

const TODAY = '2026-09-16';

const household = (over = {}) => ({
  ...EMPTY_STATE,
  onboarded: true,
  day: TODAY,
  ...over,
});

const listRow = (over = {}) => ({
  id: 'row-1',
  name: 'Rice',
  qty: '300g',
  fromRecipe: 'Coconut Chickpea Curry',
  ...over,
});

// A proven-measurement shopping-qty correction (v2): the frozen block copied
// from the prediction as shown — a count prediction ('2 tins') is the one
// scale the household's 0–3+ answer can prove.
const provenCorrection = (over = {}) => ({
  id: `pc-${Math.random().toString(36).slice(2, 8)}`,
  type: 'prediction_correction',
  predictionType: 'shopping-qty',
  predictionKey: 'chickpeas',
  predictionId: 'row-c',
  subjectKey: 'chickpeas',
  predicted: 2,
  predictedUnit: 'tin',
  dimension: 'count',
  actual: 2,
  date: '2026-09-15',
  at: Date.now(),
  schemaVersion: 2,
  ...over,
});

// ---------- 1. the validated normalized snapshot is what gets frozen --------

describe('freezing freezes the validated snapshot, never the raw row', () => {
  it('the frozen copy is the normalized snapshot: structured fields, no raw extras, deeply frozen', () => {
    const raw = {
      ...listRow({ id: 'row-1', qty: '300g' }),
      ui: { rowHeight: 42 }, // raw book noise that must NOT ride the freeze
      transientEditFlag: true,
    };
    const book = upsertPredictions([raw], [], { day: TODAY });
    const shop = buildShopRecord({
      state: { shoppingPredictions: book },
      items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1', day: TODAY,
    });
    expect(shop.predictions).toHaveLength(1);
    const frozen = shop.predictions[0];
    // The frozen copy carries exactly the fields evaluation is allowed to read.
    expect(frozen.predictionId).toBe('row-1');
    expect(frozen.subjectKey).toBe('rice');
    expect(frozen.qty).toBe('300g'); // what was SHOWN, not what was bought
    expect(frozen.normalized).toEqual({ amount: 300, dim: 'mass', unit: 'g' });
    expect(frozen.dimension).toBe('mass');
    expect(frozen.day).toBe(TODAY);
    expect(frozen.at).toBeTypeOf('number');
    expect(frozen.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    // Raw-only noise is dropped by validation — the freeze is the normalized copy.
    expect(frozen.ui).toBeUndefined();
    expect(frozen.transientEditFlag).toBeUndefined();
    // And the freeze is immutable: nothing downstream can rewrite the evidence.
    expect(Object.isFrozen(shop.predictions)).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it('the bought rows carry their own frozen outcome subject', () => {
    const book = upsertPredictions([listRow({ id: 'row-1' })], [], { day: TODAY });
    const shop = buildShopRecord({
      state: { shoppingPredictions: book },
      items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1', day: TODAY,
    });
    expect(shop.items[0].subjectKey).toBe('rice'); // frozen at purchase time
  });

  it('a snapshot that fails the gate is not frozen silently — the record names the rejection', () => {
    const book = [{ id: 'junk', predictionKey: 'mystery', name: 'Mystery', qty: 'a few', day: TODAY }];
    const shop = buildShopRecord({
      state: { shoppingPredictions: book },
      items: [{ id: 'junk', name: 'Mystery', qty: '1', price: 1 }],
      store: 'Tesco', total: 1, id: 'h1', day: TODAY,
    });
    expect(shop.predictions).toEqual([]);
    expect(shop.predictionRejections).toEqual([{ id: 'junk', name: 'Mystery', reason: 'snapshot-unreadable-quantity' }]);
    // And evaluation reports that named reason, not a generic miss.
    const result = shoppingQuantityError(household({ shops: [shop] }), { today: TODAY });
    expect(result.excluded[0]).toMatchObject({ reason: 'snapshot-unreadable-quantity', shopId: 'h1' });
  });
});

// ---------- 2. alias changes cannot alter historical identity ---------------

describe('alias memory changes after purchase cannot alter historical evaluation', () => {
  const makeShop = () => {
    const book = upsertPredictions(
      [listRow({ id: 'row-1', name: 'Chickpeas (tins)', qty: '2' })],
      [],
      { day: TODAY },
    );
    return buildShopRecord({
      state: { shoppingPredictions: book, aliasMemory: {} },
      items: [{ id: 'row-1', name: 'Chickpeas (tins)', qty: '3', price: 1.5 }],
      store: 'Tesco', total: 1.5, id: 'h-alias', day: TODAY,
    });
  };

  it('a later alias lesson leaves the historical result byte-identical', () => {
    const shop = makeShop();
    const before = shoppingQuantityError(household({ shops: [shop] }), { today: TODAY });
    // AFTER the purchase, the household teaches a (nonsense) alias: this raw
    // name now resolves somewhere else entirely.
    const after = shoppingQuantityError(
      household({ shops: [shop], aliasMemory: { 'chickpeas (tins)': 'quinoa' } }),
      { today: TODAY },
    );
    expect(before.samples).toBe(1);
    expect(after).toEqual(before); // identical — identity was frozen at purchase
    expect(after.value).toBe(0.5); // |3−2|/2, still scored as the same subject
  });

  it('a Rice prediction cannot later become Quinoa through alias-memory changes', () => {
    const book = upsertPredictions([listRow({ id: 'row-1', name: 'Rice', qty: '300g' })], [], { day: TODAY });
    const shop = buildShopRecord({
      state: { shoppingPredictions: book, aliasMemory: {} },
      items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h-rice', day: TODAY,
    });
    const before = shoppingQuantityError(household({ shops: [shop] }), { today: TODAY });
    const after = shoppingQuantityError(
      household({ shops: [shop], aliasMemory: { rice: 'quinoa' } }),
      { today: TODAY },
    );
    expect(after).toEqual(before);
    expect(after.observations[0].subjectKey).toBe('rice'); // still the frozen subject
    // The frozen snapshot itself is untouched by the alias lesson.
    expect(shop.predictions[0].subjectKey).toBe('rice');
  });

  it('legacy v1 snapshots (no frozen identity) are the honest contrast: they WOULD drift', () => {
    // A pre-freezing shop record: the snapshot carries no stored subjectKey.
    const legacyShop = {
      id: 'h-legacy', date: TODAY, total: 1.5,
      items: [{ id: 'row-1', name: 'Chickpeas (tins)', qty: '3', price: 1.5 }],
      predictions: [{ id: 'row-1', predictionKey: 'Chickpeas (tins)', name: 'Chickpeas (tins)', qty: '2', day: TODAY }],
    };
    const before = shoppingQuantityError(household({ shops: [legacyShop] }), { today: TODAY });
    const after = shoppingQuantityError(
      // Learned-alias keys are stored in their cleaned form (see aliases.js).
      household({ shops: [legacyShop], aliasMemory: { 'chickpeas tins': 'quinoa' } }),
      { today: TODAY },
    );
    // The legacy row resolves identity at read time (deliberately, labelled)…
    expect(before.observations[0].subjectKeyProvenance).toBe('resolved-at-evaluation');
    expect(before.observations[0].subjectKey).toBe('chickpeas');
    // …so the SAME historical evidence now means a DIFFERENT subject — the
    // drift that frozen identity exists to prevent.
    expect(after).not.toEqual(before);
    expect(after.observations[0].subjectKey).toBe('quinoa');
  });
});

// ---------- 3. correction measurement semantics ------------------------------

describe('corrections must prove the measurement before numerical scoring', () => {
  it('a proven count correction scores; the dimension is proven, never assumed', () => {
    const state = household({ predictionCorrections: [provenCorrection({ predicted: 2, actual: 1 })] });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(1);
    expect(result.explicitQuantityCorrectionAccuracy.value).toBe(0.5);
    const obs = result.explicitQuantityCorrectionAccuracy.observations[0];
    expect(obs.dimension).toBe('count'); // PROVEN by the frozen block
    expect(obs.predictionId).toBe('row-c'); // the exact frozen prediction it answers
    expect(obs.subjectKey).toBe('chickpeas');
  });

  it('grams cannot be scored against a 0–3 categorical answer', () => {
    const state = household({
      predictionCorrections: [provenCorrection({ dimension: 'mass', predictedUnit: 'g', predicted: 300, actual: 2 })],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0);
    expect(result.explicitQuantityCorrectionAccuracy.value).toBeNull();
    const excluded = result.excluded.find((e) => e.outcomeId != null);
    expect(excluded.reason).toBe('correction-measurement-unproven');
    expect(excluded.why).toBe('mass-prediction-vs-count-answer');
  });

  it('a correction without the frozen block, id or subject is unproven — never defaulted to count', () => {
    const cases = [
      // No measurement block at all.
      { dimension: null, predictionId: 'row-c', subjectKey: 'chickpeas', why: 'no-measurement-block' },
      // Unknown dimension.
      { dimension: 'length', predictionId: 'row-c', subjectKey: 'chickpeas', why: 'unknown-dimension-length' },
      // Missing prediction id.
      { dimension: 'count', predictionId: null, subjectKey: 'chickpeas', why: 'missing-prediction-id' },
      // Missing frozen subject key.
      { dimension: 'count', predictionId: 'row-c', subjectKey: null, why: 'missing-frozen-subject-key' },
    ];
    for (const c of cases) {
      const state = household({
        predictionCorrections: [provenCorrection({
          dimension: c.dimension, predictionId: c.predictionId, subjectKey: c.subjectKey,
        })],
      });
      const result = shoppingQuantityError(state, { today: TODAY });
      expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0);
      const excluded = result.excluded.find((e) => e.reason === 'correction-measurement-unproven');
      expect(excluded).toBeDefined();
      expect(excluded.why).toBe(c.why);
    }
  });

  it('a legacy (v1) correction is qualitative evidence — never silently reinterpreted as a count', () => {
    // Written before the measurement block existed: a bare predicted number.
    const legacy = {
      id: 'pc-old', type: 'prediction_correction', predictionType: 'shopping-qty',
      predictionKey: 'rice', predicted: 300, actual: 2, date: '2026-09-15', at: Date.now(),
    };
    const state = household({ predictionCorrections: [legacy] });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0);
    const excluded = result.excluded[0];
    expect(excluded.reason).toBe('correction-measurement-unproven');
    expect(excluded.why).toBe('legacy-correction-no-measurement-block');
    // And the learning profile keeps it as QUALITATIVE evidence: counted,
    // never averaged.
    const profile = predictionLearningProfile([legacy]);
    expect(profile.byType['shopping-qty'].corrections).toBe(1);
    expect(profile.byType['shopping-qty'].qualitativeOnly).toBe(1);
    expect(profile.byType['shopping-qty'].exactSamples).toBe(0);
    expect(profile.byType['shopping-qty'].meanAbsoluteError).toBeNull();
  });

  it('incompatible corrections remain usable as qualitative learning evidence', () => {
    const profile = predictionLearningProfile([
      provenCorrection({ id: 'a', dimension: 'mass', predictedUnit: 'g', predicted: 300, actual: 2 }), // grams vs 0–3 answer
      provenCorrection({ id: 'b', predicted: 2, actual: 1 }), // proven, scores
    ]);
    const row = profile.byType['shopping-qty'];
    expect(row.corrections).toBe(2); // BOTH stay evidence
    expect(row.qualitativeOnly).toBe(1); // the unprovable one is labelled
    expect(row.exactSamples).toBe(1); // only the provable one enters the math
    expect(row.meanAbsoluteError).toBe(1); // |1−2| over the one proven sample
  });

  it('unknown or malformed correction schema versions are rejected with named reasons', () => {
    const future = provenCorrection({ id: 'pc-future', schemaVersion: 99 });
    const garbage = provenCorrection({ id: 'pc-garbage', schemaVersion: 'two' });
    expect(correctionSchemaStatus(future)).toMatchObject({ ok: false, reason: 'unsupported-correction-schema' });
    expect(correctionSchemaStatus(garbage)).toMatchObject({ ok: false, reason: 'malformed-correction-schema' });
    const result = shoppingQuantityError(
      household({ predictionCorrections: [future, garbage] }),
      { today: TODAY },
    );
    const reasons = result.excluded.map((e) => e.reason);
    expect(reasons).toContain('unsupported-correction-schema');
    expect(reasons).toContain('malformed-correction-schema');
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0);
    // The schema support set is explicit and versioned.
    expect(SUPPORTED_CORRECTION_SCHEMA_VERSIONS).toContain(CORRECTION_SCHEMA_VERSION);
  });
});

// ---------- 4. censored "3+" evidence ----------------------------------------

describe('censored 3+ contributes directional learning, never exact MAE', () => {
  it('predicted 1, response 3+: lower bound, direction and minimum error — no exact sample', () => {
    const state = household({
      predictionCorrections: [provenCorrection({ id: 'pc-3', predicted: 1, actual: 3 })],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0); // not an exact answer
    expect(result.explicitQuantityCorrectionAccuracy.value).toBeNull();
    const directional = result.explicitQuantityCorrectionAccuracy.directionalEvidence;
    expect(directional).toHaveLength(1);
    expect(directional[0]).toMatchObject({
      lowerBound: 3,          // proven: actual ≥ 3
      direction: 'prediction-too-low',
      minimumError: 2,        // ≥ 3 − 1
      minimumRelativeError: 2, // 2/1
      predictionId: 'row-c',
    });
    // The exclusion names the bound and carries the same directional facts.
    const excluded = result.excluded.find((e) => e.reason === 'censored-correction-lower-bound');
    expect(excluded).toMatchObject({ bound: 3, minimumError: 2 });
  });

  it('a 3+ that does not exceed the prediction proves no direction', () => {
    const state = household({
      predictionCorrections: [provenCorrection({ id: 'pc-ok', predicted: 3, actual: 3 })],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    const directional = result.explicitQuantityCorrectionAccuracy.directionalEvidence[0];
    expect(directional.direction).toBe('consistent-with-bound');
    expect(directional.minimumError).toBe(0);
  });

  it('the learning profile counts the bound as direction evidence, outside the error averages', () => {
    const profile = predictionLearningProfile([
      provenCorrection({ id: 'a', predicted: 1, actual: 3 }), // 3+ over predicted 1
      provenCorrection({ id: 'b', predicted: 2, actual: 2 }), // exact
    ]);
    const row = profile.byType['shopping-qty'];
    expect(row.corrections).toBe(2);
    expect(row.exactSamples).toBe(1);
    expect(row.censoredLowerBounds).toBe(1);
    expect(row.tooLowLowerBounds).toBe(1); // direction: prediction was too low
    expect(row.meanAbsoluteError).toBe(0); // exact rows only — the 3+ contributed nothing
  });
});

// ---------- 5. the root value is the purchase accuracy alone ------------------

describe('the root quantity metric cannot be confused with the combined learning signal', () => {
  it('root value/observations = purchase accuracy; combined lives only under its own key', () => {
    const book = upsertPredictions([listRow({ id: 'row-1' })], [], { day: TODAY });
    const shop = buildShopRecord({
      state: { shoppingPredictions: book },
      items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1', day: TODAY,
    });
    const state = household({
      shops: [shop],
      predictionCorrections: [provenCorrection({ id: 'pc-x', predicted: 2, actual: 0 })], // |0−2|/2 = 1
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.version).toBe(3);
    expect(result.value).toBe(1); // purchase accuracy ONLY
    expect(result.samples).toBe(1);
    expect(result.observations.every((o) => o.source === 'purchase')).toBe(true);
    expect(result.value).toBe(result.purchaseQuantityAccuracy.value);
    expect(result.combinedLearningSignal.value).toBe(1); // (1 + 1) / 2
    expect(result.combinedLearningSignal.samples).toBe(2);
    expect(result.combinedLearningSignal).not.toBe(result); // separate object
    expect(result.combinedLearningSignal.observations).toHaveLength(2);
    // The result's own assumption names what the root answers.
    expect(result.assumption).toMatch(/^Purchase accuracy:/);
    // And the combined view is labelled as learning, not accuracy.
    expect(result.combinedLearningSignal.assumption).toMatch(/LEARNING SIGNAL/);
  });

  it('a purchase-only household still reads the same from root and split views', () => {
    const book = upsertPredictions([listRow({ id: 'row-1' })], [], { day: TODAY });
    const shop = buildShopRecord({
      state: { shoppingPredictions: book },
      items: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1', day: TODAY,
    });
    const result = shoppingQuantityError(household({ shops: [shop] }), { today: TODAY });
    expect(result.value).toBe(0);
    expect(result.purchaseQuantityAccuracy.value).toBe(0);
    expect(result.explicitQuantityCorrectionAccuracy.value).toBeNull();
    expect(result.combinedLearningSignal.value).toBe(0);
  });
});

// ---------- 6. standardised diagnostics --------------------------------------

describe('every metric reports exclusions consistently', () => {
  const messyState = () => {
    const book = upsertPredictions([listRow({ id: 'row-1' })], [], { day: TODAY });
    // The scored shop carries a GENUINE pre-purchase basket freeze (frozen
    // when the list was generated) — the only evidence spendAccuracy scores.
    const basketFreeze = basketPredictionEvent({
      rows: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 1.2 }],
      day: TODAY,
    });
    return household({
      basketPredictions: [basketFreeze],
      shops: [
        buildShopRecord({
          state: { shoppingPredictions: book, basketPredictions: [basketFreeze] },
          items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
          store: 'Tesco', total: 1.2, id: 'h-ok', day: TODAY,
        }),
        { id: 'h-future', date: '2026-09-30', total: 3, predicted: 3, items: [{ id: 'x', name: 'Rice', qty: '1' }] },
        { id: 'h-empty', date: TODAY, total: 0, predicted: 0, items: [] },
      ],
      predictionCorrections: [provenCorrection({ id: 'pc-1' })],
    });
  };

  it('spend accuracy exposes samples, exclusions, reason counts and the window', () => {
    const result = spendAccuracy(messyState(), { today: TODAY });
    expect(result.samples).toBe(1);
    expect(result.excluded.length).toBeGreaterThan(0);
    expect(Object.keys(result.excludedReasons)).toEqual(
      expect.arrayContaining(['future-shop', 'zero-total']),
    );
    const tally = result.excluded.reduce((counts, e) => {
      counts[e.reason] = (counts[e.reason] || 0) + 1;
      return counts;
    }, {});
    expect(result.excludedReasons).toEqual(tally); // counts match the entries
    expect(result.evaluationWindowDays).toBe(56);
    expect(result.assumption).toBeTruthy();
    expect(result.confidence).toBeTruthy();
  });

  it('basket reconciliation exposes the same diagnostics shape', () => {
    const result = basketReconciliation(messyState(), { today: TODAY });
    expect(result.samples).toBe(1);
    expect(Array.isArray(result.excluded)).toBe(true);
    expect(result.excludedReasons).toEqual(
      result.excluded.reduce((counts, e) => ({ ...counts, [e.reason]: (counts[e.reason] || 0) + 1 }), {}),
    );
    expect(result.evaluationWindowDays).toBe(56);
  });

  it('each quantity view reports its own exclusions — nothing filtered silently', () => {
    const result = shoppingQuantityError(messyState(), { today: TODAY });
    for (const view of [result, result.purchaseQuantityAccuracy, result.explicitQuantityCorrectionAccuracy, result.combinedLearningSignal]) {
      expect(view).toHaveProperty('samples');
      expect(view).toHaveProperty('excluded');
      expect(view).toHaveProperty('excludedReasons');
      expect(view).toHaveProperty('assumption');
      expect(view).toHaveProperty('confidence');
      expect(view).toHaveProperty('observations');
    }
    // Purchase view: its exclusions are exactly the purchase-tagged ones.
    expect(result.purchaseQuantityAccuracy.excluded.every((e) => e.source === 'purchase')).toBe(true);
    expect(result.purchaseQuantityAccuracy.excludedReasons['future-shop']).toBe(1);
    // Correction view: corrections have no recency window — null, deliberately.
    expect(result.explicitQuantityCorrectionAccuracy.evaluationWindowDays).toBeNull();
    // The global excluded list is the union, with reason counts to match.
    const tally = result.excluded.reduce((counts, e) => {
      counts[e.reason] = (counts[e.reason] || 0) + 1;
      return counts;
    }, {});
    expect(result.excludedReasons).toEqual(tally);
  });
});

// ---------- 7. snapshot schema versioning ------------------------------------

describe('unknown snapshot schema versions are rejected safely', () => {
  const goodV2 = { id: 'p1', predictionKey: 'rice', name: 'Rice', subjectKey: 'rice', qty: '300g', day: TODAY, schemaVersion: 2 };

  it('the support set is explicit and versioned', () => {
    expect(SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS).toContain(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshotSchemaStatus(goodV2)).toMatchObject({ ok: true, version: 2, legacy: false });
  });

  it('absent schemaVersion is legacy v1, handled deliberately', () => {
    const verdict = validatePredictionSnapshotWithReason({
      id: 'p1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: TODAY,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.snapshot.schemaVersion).toBe(1);
    expect(verdict.snapshot.legacy).toBe(true);
    expect(verdict.snapshot.subjectKeyProvenance).toBe('resolved-at-evaluation');
  });

  it('a v2 snapshot without a stored subject is rejected — identity must be frozen', () => {
    const verdict = validatePredictionSnapshotWithReason({
      id: 'p1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: TODAY, schemaVersion: 2,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe(SNAPSHOT_REJECTION_REASONS.V2_MISSING_SUBJECT);
  });

  it('unknown and malformed versions are rejected with named reasons, everywhere', () => {
    const future = { ...goodV2, id: 'p-future', schemaVersion: 99 };
    const garbage = { ...goodV2, id: 'p-garbage', schemaVersion: 'latest' };
    expect(snapshotSchemaStatus(future)).toMatchObject({ ok: false, reason: 'unsupported-snapshot-schema' });
    expect(snapshotSchemaStatus(garbage)).toMatchObject({ ok: false, reason: 'malformed-snapshot-schema' });
    expect(validatePredictionSnapshotWithReason(future).reason).toBe('unsupported-snapshot-schema');
    expect(validatePredictionSnapshotWithReason(garbage).reason).toBe('malformed-snapshot-schema');
    // Through the purchase path: not frozen, and evaluation reports the reason.
    const shop = buildShopRecord({
      state: { shoppingPredictions: [future, garbage] },
      items: [
        { id: 'p-future', name: 'Rice', qty: '600g', price: 1 },
        { id: 'p-garbage', name: 'Rice', qty: '600g', price: 1 },
      ],
      store: 'Tesco', total: 2, id: 'h-schema', day: TODAY,
    });
    expect(shop.predictions).toEqual([]);
    expect(shop.predictionRejections.map((r) => r.reason).sort()).toEqual([
      'malformed-snapshot-schema', 'unsupported-snapshot-schema',
    ]);
    const result = shoppingQuantityError(household({ shops: [shop] }), { today: TODAY });
    const reasons = result.excluded.map((e) => e.reason);
    expect(reasons).toContain('unsupported-snapshot-schema');
    expect(reasons).toContain('malformed-snapshot-schema');
    expect(result.samples).toBe(0);
  });

  it('a v2 correction event carries the schema stamp; the gate accepts it', () => {
    const event = predictionCorrectionEvent({
      predictionType: 'shopping-qty', predictionKey: 'chickpeas',
      predictionId: 'row-c', subjectKey: 'chickpeas', predictedUnit: 'tin', dimension: 'count',
      predicted: 2, actual: 1, date: TODAY,
    });
    expect(event.schemaVersion).toBe(CORRECTION_SCHEMA_VERSION);
    expect(correctionSchemaStatus(event)).toMatchObject({ ok: true, version: 2, legacy: false });
  });
});
