import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import {
  shoppingQuantityError,
  spendAccuracy,
} from '../src/lib/eval-metrics.js';
import {
  correctionProofOf,
} from '../src/lib/correction-measurements.js';
import { predictionLearningProfile } from '../src/lib/prediction-feedback.js';
import {
  directionalLearning,
  isNumericallyValidCorrection,
  listSnapshotsConsistent,
  listSnapshotDivergence,
} from '../src/lib/evidence-contracts.js';
import {
  upsertPredictions,
  evaluablePredictions,
  listSnapshotSync,
  validatePredictionSnapshotWithReason,
} from '../src/lib/shopping-predictions.js';
import {
  PREDICTION_PROVENANCE,
  basketPredictionEvent,
  quantityOverrideEvent,
  overrideSchemaStatus,
  basketSchemaStatus,
  provenanceStatusFor,
} from '../src/lib/prediction-evidence.js';
import { shoppingActions } from '../src/lib/shopping-actions.js';
import { shoppingListMutations } from '../src/lib/shopping-list-mutations.js';
import { buildShopRecord } from '../src/lib/shop-record.js';
import { hydrate } from '../src/lib/store-persistence.js';

const TODAY = '2026-09-16';

const household = (over = {}) => ({
  ...EMPTY_STATE,
  onboarded: true,
  day: TODAY,
  portions: 4,
  ...over,
});

/** Drive an action slice exactly the way the store api composes it. */
const driver = (slice, state, extra = {}) => {
  const ref = { state };
  const actions = slice((patch) => {
    const changes = typeof patch === 'function' ? patch(ref.state) : patch;
    ref.state = { ...ref.state, ...changes };
  }, extra);
  return { state: () => ref.state, run: (name, ...args) => actions[name](...args) };
};

/** A v2 correction with the full frozen measurement block (count scale). */
const provenCorrection = (over = {}) => ({
  id: 'pc-x',
  type: 'prediction_correction',
  predictionType: 'shopping-qty',
  predictionKey: 'eggs',
  predictionId: 'row-e',
  subjectKey: 'eggs',
  dimension: 'count',
  predictedUnit: 'count',
  predicted: 2,
  actual: 1,
  date: '2026-09-15',
  at: Date.now(),
  schemaVersion: 2,
  ...over,
});

/** A v2 snapshot carrying provenance — the engine-stamped shape. */
const v2Prediction = (over = {}) => ({
  id: 'row-1',
  predictionKey: 'rice',
  name: 'Rice',
  qty: '300g',
  day: TODAY,
  subjectKey: 'rice',
  provenance: PREDICTION_PROVENANCE.FORQ_PLAN,
  normalized: { amount: 300, dim: 'mass', unit: 'g' },
  schemaVersion: 2,
  ...over,
});

describe('the strict correction proof is shared by accuracy AND learning', () => {
  it('the exact same correction is numerically valid everywhere', () => {
    const c = provenCorrection();
    // The one proof…
    expect(isNumericallyValidCorrection(c)).toBe(true);
    // …drives the learning profile…
    const profile = predictionLearningProfile([c]);
    expect(profile.byType['shopping-qty'].exactSamples).toBe(1);
    expect(profile.byType['shopping-qty'].qualitativeOnly).toBe(0);
    // …and the accuracy metric, identically.
    const result = shoppingQuantityError(household({ predictionCorrections: [c] }), { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(1);
    expect(result.explicitQuantityCorrectionAccuracy.excluded).toHaveLength(0);
  });

  it('the exact same correction is qualitative everywhere when unprovable (grams vs 0–3)', () => {
    const c = provenCorrection({ dimension: 'mass', predictedUnit: 'g', predicted: 300 });
    expect(isNumericallyValidCorrection(c)).toBe(false);
    expect(correctionProofOf(c).reason).toBe('correction-measurement-unproven');
    const profile = predictionLearningProfile([c]);
    expect(profile.byType['shopping-qty'].exactSamples).toBe(0);
    expect(profile.byType['shopping-qty'].qualitativeOnly).toBe(1);
    const result = shoppingQuantityError(household({ predictionCorrections: [c] }), { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0);
    expect(result.explicitQuantityCorrectionAccuracy.excluded[0].reason).toBe('correction-measurement-unproven');
  });

  it('a missing predicted value NEVER becomes zero error', () => {
    const c = provenCorrection({ predicted: null });
    const proof = correctionProofOf(c);
    expect(proof.status).toBe('unproven');
    expect(proof.reason).toBe('missing-predicted-qty');
    const profile = predictionLearningProfile([c]);
    const row = profile.byType['shopping-qty'];
    expect(row.qualitativeOnly).toBe(1);
    expect(row.exactSamples).toBe(0);
    expect(row.meanAbsoluteError).toBeNull();
    expect(row.meanSignedError).toBeNull();
    expect(row.absoluteError).toBe(0); // nothing entered the math
  });
});

describe('provenance: only Forq advice moves Forq claimed accuracy', () => {
  const shopWith = (provenance) => ({
    id: 'h1', date: TODAY, total: 2,
    items: [{ id: 'row-1', name: 'Rice', qty: '600g', subjectKey: 'rice' }],
    predictions: [v2Prediction({ provenance })],
  });

  it('forq-plan quantities DO enter purchase accuracy', () => {
    const result = shoppingQuantityError(household({ shops: [shopWith(PREDICTION_PROVENANCE.FORQ_PLAN)] }), { today: TODAY });
    expect(result.samples).toBe(1); // |600−300|/300 = 1
    expect(result.value).toBe(1);
    expect(result.excluded).toHaveLength(0);
  });

  it('manually entered quantities NEVER enter (improve or worsen) accuracy', () => {
    const result = shoppingQuantityError(household({ shops: [shopWith(PREDICTION_PROVENANCE.USER_MANUAL)] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    expect(result.excluded[0].reason).toBe('not-forq-provenance');
    expect(result.excluded[0].provenance).toBe('user-manual');
  });

  it('repeat-shop rows are explicitly non-evaluable', () => {
    const book = upsertPredictions(
      [{ id: 'r1', name: 'Rice', qty: '300g' }],
      [],
      { day: TODAY, provenanceByRow: { r1: PREDICTION_PROVENANCE.USER_REPEAT_SHOP } },
    );
    expect(book[0].provenance).toBe('user-repeat-shop');
    expect(book[0].evaluableForPredictionAccuracy).toBe(false);
    expect(evaluablePredictions(book)).toHaveLength(0);
    // And a shop built from such rows is excluded, not scored.
    const shop = {
      id: 'h2', date: TODAY, total: 2,
      items: [{ id: 'r1', name: 'Rice', qty: '300g', subjectKey: 'rice' }],
      predictions: book,
    };
    const result = shoppingQuantityError(household({ shops: [shop] }), { today: TODAY });
    expect(result.excluded[0].reason).toBe('not-forq-provenance');
  });

  it('legacy v1 rows keep the historical semantic, labelled — not reinterpreted', () => {
    const status = provenanceStatusFor({ sourceRecipes: ['Curry'] });
    expect(status).toMatchObject({ ok: true, legacy: true, provenance: 'forq-plan', evaluable: true });
    const manual = provenanceStatusFor({});
    expect(manual).toMatchObject({ legacy: true, provenance: 'user-manual', evaluable: false });
    // A validated legacy snapshot says WHERE its provenance was decided.
    const verdict = validatePredictionSnapshotWithReason({
      id: 'row-9', predictionKey: 'rice', name: 'Rice', qty: '300g', day: TODAY,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.snapshot.provenanceResolvedAt).toBe('legacy-defaulted-at-read');
  });
});

describe('list ↔ snapshot consistency is enforced on every mutation write', () => {
  const seed = () => household({
    shoppingList: [
      { id: 'a', name: 'Rice', qty: '300g', checked: false },
      { id: 'b', name: 'Bread', qty: '1', checked: true },
    ],
    shoppingPredictions: upsertPredictions(
      [{ id: 'a', name: 'Rice', qty: '300g' }, { id: 'b', name: 'Bread', qty: '1' }],
      [],
      { day: TODAY },
    ),
  });

  it('removeListItem removes the row AND its live snapshot in one write', () => {
    const app = driver(shoppingActions, seed());
    app.run('removeListItem', 'a');
    expect(app.state().shoppingList.map((r) => r.id)).toEqual(['b']);
    expect(app.state().shoppingPredictions.map((p) => p.id)).toEqual(['b']);
    expect(listSnapshotsConsistent(app.state())).toBe(true);
  });

  it('removeListItems and clearChecked evict exactly the gone rows', () => {
    const app = driver(shoppingActions, seed());
    app.run('removeListItems', ['a', 'b']);
    expect(app.state().shoppingPredictions).toEqual([]);
    expect(listSnapshotsConsistent(app.state())).toBe(true);
  });

  it('moveCheckedToPantry keeps the books consistent', () => {
    const app = driver(shoppingActions, seed());
    app.run('moveCheckedToPantry', 'Cupboard');
    expect(app.state().shoppingList.map((r) => r.id)).toEqual(['a']);
    expect(app.state().shoppingPredictions.map((p) => p.id)).toEqual(['a']);
    expect(listSnapshotsConsistent(app.state())).toBe(true);
  });

  it('the invariant helper fails loudly when the books diverge', () => {
    const diverged = {
      shoppingList: [{ id: 'a', name: 'Rice' }],
      shoppingPredictions: [{ id: 'a' }, { id: 'ghost' }],
    };
    expect(listSnapshotsConsistent(diverged)).toBe(false);
    expect(listSnapshotDivergence(diverged).orphans).toEqual(['ghost']);
    // listSnapshotSync is the repair: orphans evicted, in the same write.
    const repaired = listSnapshotSync(diverged.shoppingList, diverged.shoppingPredictions);
    expect(repaired.removed).toEqual(['ghost']);
    expect(listSnapshotsConsistent({ ...diverged, shoppingPredictions: repaired.shoppingPredictions })).toBe(true);
  });

  it('frozen historical snapshots survive list deletion and still score', () => {
    const snap = v2Prediction();
    const shop = {
      id: 'h9', date: TODAY, total: 2,
      items: [{ id: 'row-1', name: 'Rice', qty: '300g', subjectKey: 'rice' }],
      predictions: [snap],
    };
    // The whole live list and book are deleted after the buy…
    const state = household({ shops: [shop], shoppingList: [], shoppingPredictions: [] });
    expect(listSnapshotsConsistent(state)).toBe(true);
    // …and the frozen copy on the shop record still scores exactly.
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(1);
    expect(result.value).toBe(0);
  });
});

describe('quantity overrides are explicit, attributable, and never rewrite advice', () => {
  const seed = () => {
    const snapshot = upsertPredictions([{ id: 'row-1', name: 'Rice', qty: '300g' }], [], { day: TODAY })[0];
    return household({
      shoppingList: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 1.2, checked: false }],
      shoppingPredictions: [snapshot],
      activeMemberId: 'member-7',
    });
  };

  it('editing a quantity records an override; the frozen advice is untouched', () => {
    const app = driver(shoppingListMutations, seed(), { latest: { current: seed() } });
    app.run('updateListItem', 'row-1', { qty: '500g' });
    const state = app.state();
    const [event] = state.quantityOverrides;
    expect(event).toMatchObject({
      type: 'quantity_override',
      predictionId: 'row-1',
      subjectKey: 'rice',
      originalQty: '300g',
      overrideQty: '500g',
      dimension: 'mass',
      actor: 'member-7',
      day: TODAY,
    });
    // The ORIGINAL prediction is not silently rewritten…
    expect(state.shoppingPredictions[0].qty).toBe('300g');
    // …and the override is schema-versioned.
    expect(overrideSchemaStatus(event).ok).toBe(true);
  });

  it('override evidence is attributable to the correct prediction', () => {
    const app = driver(shoppingListMutations, seed(), { latest: { current: seed() } });
    app.run('updateListItem', 'row-1', { qty: '150g' });
    const event = app.state().quantityOverrides[0];
    const snapshot = app.state().shoppingPredictions.find((p) => p.id === event.predictionId);
    expect(snapshot).toBeDefined();
    expect(event.originalQty).toBe(snapshot.qty); // exactly what was shown
    expect(event.subjectKey).toBe(snapshot.subjectKey);
  });

  it('a price edit re-freezes the basket prediction now (source: reprice)', () => {
    const app = driver(shoppingListMutations, seed(), { latest: { current: seed() } });
    const before = app.state().basketPredictions?.length ?? 0;
    app.run('updateListItem', 'row-1', { price: 2.5 });
    const freezes = app.state().basketPredictions;
    expect(freezes.length).toBe(before + 1);
    expect(freezes.at(-1)).toMatchObject({ source: 'reprice', schemaVersion: 1, predicted: 2.5 });
  });
});

describe('spend predictions are frozen when shown, copied verbatim at checkout', () => {
  it('the freeze happens at list generation (addToList), not at checkout', () => {
    const app = driver(shoppingListMutations, household(), { latest: { current: household() } });
    app.run('addToList', [{ name: 'Rice', qty: '300g', price: 1.2, fromRecipe: 'Curry' }]);
    const freezes = app.state().basketPredictions;
    expect(freezes).toHaveLength(1);
    expect(freezes[0]).toMatchObject({ type: 'basket_prediction', source: 'list-generation' });
    expect(freezes[0].predicted).toBe(1.2);
    // The freeze records each row's price data VERBATIM from the list as shown.
    const listedRow = app.state().shoppingList[0];
    expect(freezes[0].rows[0]).toMatchObject({
      listItemId: listedRow.id,
      name: 'Rice',
      price: 1.2,
      priceSource: listedRow.priceSource,
    });
    expect(basketSchemaStatus(freezes[0]).ok).toBe(true);
  });

  it('checkout copies the freeze; post-freeze price changes cannot rewrite it', () => {
    const snap = v2Prediction();
    // The freeze: rice at 4.0, bread at 6.0 → total 10, frozen pre-till.
    const freeze = basketPredictionEvent({
      rows: [
        { id: 'row-1', name: 'Rice', qty: '300g', price: 4 },
        { id: 'row-2', name: 'Bread', qty: '1', price: 6 },
      ],
      day: TODAY,
      rowPredictionIds: ['row-1', 'row-2'],
    });
    const state = household({
      basketPredictions: [freeze],
      shoppingPredictions: [snap],
      shoppingList: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 9, checked: true }], // repriced AFTER the freeze
    });
    const record = buildShopRecord({
      state, items: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 9 }],
      store: 'Tesco', total: 9, id: 'h1', day: TODAY,
    });
    // The shop's spend prediction is the FROZEN subset price (4.0), not the
    // till-time 9.0 — checkout copied history, it did not reconstruct it.
    expect(record.predicted).toBe(4);
    expect(record.spendPrediction.matchedBy).toBe('row-subset');
    expect(record.spendPrediction.basketPredictionId).toBe(freeze.id);
    expect(record.spendPrediction.predictedAt).toBe(TODAY);
    expect(record.spendPrediction.rowPredictionIds).toEqual(['row-1', 'row-2']);
    // And spendAccuracy scores it against the freeze, not the till price.
    const result = spendAccuracy({ ...state, shops: [{ ...record, date: TODAY, total: 9 }] }, { today: TODAY });
    expect(result.samples).toBe(1);
    expect(result.absoluteError).toBe(5); // |9 − 4|
  });

  it('shops without a genuine pre-purchase prediction are excluded, never reconstructed', () => {
    const state = household({
      shops: [{ id: 'h1', date: TODAY, total: 10, predicted: 10, items: [{ name: 'A', price: 10 }] }],
    });
    const result = spendAccuracy(state, { today: TODAY });
    expect(result.value).toBeNull();
    expect(result.samples).toBe(0);
    expect(result.excluded[0].reason).toBe('no-pre-purchase-spend-prediction');
  });
});

describe('censored 3+ evidence stays directional across every consumer', () => {
  it('the proof, the profile and the metric all refuse exact MAE but keep the floor', () => {
    const c = provenCorrection({ predicted: 1, actual: 3 }); // "3+"
    const proof = correctionProofOf(c);
    expect(proof.status).toBe('censored');
    expect(proof).toMatchObject({
      lowerBound: 3,
      direction: 'prediction-too-low',
      minimumError: 2,
      minimumRelativeError: 2,
      subjectKey: 'eggs',
      predictionId: 'row-e',
    });
    const profile = predictionLearningProfile([c]);
    const row = profile.byType['shopping-qty'];
    expect(row.exactSamples).toBe(0);
    expect(row.meanAbsoluteError).toBeNull();
    expect(row.censoredLowerBounds).toBe(1);
    expect(row.tooLowLowerBounds).toBe(1);
    expect(row.minimumRelativeError).toBe(2);
    const aggregate = directionalLearning([proof]);
    expect(aggregate).toMatchObject({ total: 1, tooLow: 1, minimumError: 2, minimumRelativeError: 2 });
    const result = shoppingQuantityError(household({ predictionCorrections: [c] }), { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(0);
    expect(result.explicitQuantityCorrectionAccuracy.directionalEvidence).toHaveLength(1);
    expect(result.explicitQuantityCorrectionAccuracy.excluded[0].reason).toBe('censored-correction-lower-bound');
  });
});

describe('unknown or malformed evidence schemas fail safely', () => {
  it('an unknown snapshot provenance is rejected with a named reason', () => {
    const verdict = validatePredictionSnapshotWithReason(v2Prediction({ provenance: 'alien-source' }));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('unknown-prediction-provenance');
  });

  it('a v2 snapshot missing provenance does not conform to its claimed schema', () => {
    const verdict = validatePredictionSnapshotWithReason(v2Prediction({ provenance: undefined }));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('snapshot-v2-missing-provenance');
  });

  it('unknown override and basket schemas are rejected with named reasons', () => {
    const futureOverride = quantityOverrideEvent({ predictionId: 'p1', originalQty: '2', overrideQty: '3' });
    futureOverride.schemaVersion = 99;
    expect(overrideSchemaStatus(futureOverride)).toMatchObject({ ok: false, reason: 'unsupported-override-schema' });
    expect(overrideSchemaStatus({})).toMatchObject({ ok: false, reason: 'malformed-override-schema' });
    expect(basketSchemaStatus({ schemaVersion: 'x', predicted: 1 })).toMatchObject({ ok: false, reason: 'malformed-basket-prediction' });
  });

  it('persistence drops unknown-schema evidence books instead of carrying them into metrics', () => {
    const good = basketPredictionEvent({ rows: [{ id: 'a', name: 'Rice', price: 1 }], day: TODAY });
    const bad = { ...good, id: 'bad', schemaVersion: 42 };
    const stored = hydrate(household({
      basketPredictions: [good, bad],
      quantityOverrides: [quantityOverrideEvent({}), { schemaVersion: 9 }],
    }));
    expect(stored.basketPredictions.map((b) => b.id)).toEqual([good.id]);
    expect(stored.quantityOverrides).toHaveLength(1);
  });
});
