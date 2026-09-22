import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { shoppingQuantityError, spendAccuracy } from '../src/lib/eval-metrics.js';
import {
  overrideLearningProfile,
  applyOverrideLearning,
  overridePressure,
} from '../src/lib/override-learning.js';
import {
  basketPredictionEvent,
  basketSchemaStatus,
  overrideSchemaStatus,
  quantityOverrideEvent,
  activeBasketFreezes,
} from '../src/lib/prediction-evidence.js';
import { buildShopRecord } from '../src/lib/shop-record.js';
import { shoppingActions } from '../src/lib/shopping-actions.js';
import { shoppingListMutations } from '../src/lib/shopping-list-mutations.js';

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

/** The spendPrediction shape checkout copies onto a shop record (verbatim). */
const copiedFreeze = (freeze, over = {}) => ({
  basketPredictionId: freeze.id,
  predictedAt: freeze.day,
  predictedAtMs: Number.isFinite(Number(freeze.at)) ? Number(freeze.at) : null,
  predictedTotal: freeze.predicted,
  rows: freeze.rows,
  priceSource: freeze.source,
  rowPredictionIds: freeze.rowPredictionIds,
  schemaVersion: freeze.schemaVersion,
  provenance: freeze.provenance ?? null,
  totalRows: freeze.totalRows,
  pricedRows: freeze.pricedRows,
  unpricedRows: freeze.unpricedRows,
  priceCoverage: freeze.priceCoverage,
  matchedBy: 'row-ids',
  ...over,
});

/** A genuine Forq snapshot in the live book (what override events resolve against). */
const forqSnapshot = (over = {}) => ({
  id: 'row-e',
  name: 'Eggs',
  qty: '6',
  subjectKey: 'eggs',
  provenance: 'forq-plan',
  day: TODAY,
  schemaVersion: 2,
  normalized: { amount: 6, dim: 'count', unit: 'count' },
  ...over,
});

// ---------------------------------------------------------------------------
// 1–2. Row-exact evidence sets: predicted rows == actual rows
// ---------------------------------------------------------------------------

describe('row-exact spend: predicted set and actual set are the same rows', () => {
  const setup = () => {
    // Forq priced its two rows at £2 + £2 = £4. The receipt also carries a
    // £6 manual extra → full receipt total £10.
    const freeze = basketPredictionEvent({
      rows: [
        { id: 'r1', name: 'Rice', qty: '300g', price: 2, provenance: 'forq' },
        { id: 'r2', name: 'Bread', qty: '1', price: 2, provenance: 'forq' },
      ],
      day: TODAY,
      at: 1000,
    });
    const items = [
      { id: 'r1', name: 'Rice', qty: '300g', price: 2 },
      { id: 'r2', name: 'Bread', qty: '1', price: 2 },
      { id: 'm1', name: 'Scented Candle', qty: '1', price: 6 }, // manual extra
    ];
    const shop = { id: 'h1', date: TODAY, total: 10, items, spendPrediction: copiedFreeze(freeze) };
    return { freeze, items, shop, result: spendAccuracy(household({ shops: [shop] }), { today: TODAY }) };
  };

  it('a Forq £4 subset is never scored against a £10 mixed receipt', () => {
    const { result } = setup();
    expect(result.samples).toBe(1);
    const [obs] = result.observations;
    // The comparison is £4 → £4, never £4 → £10: the manual extra is not
    // Forq's forecast error.
    expect(obs.predictedSubtotal).toBe(4);
    expect(obs.actualSubtotal).toBe(4);
    expect(result.absoluteError).toBe(0);
    expect(obs.coverageMode).toBe('subset');
    expect(obs.evaluatedRowIds).toEqual(['r1', 'r2']);
  });

  it('predicted and actual subtotals are computed over IDENTICAL row IDs', () => {
    const { freeze, items, result } = setup();
    const [obs] = result.observations;
    const freezeById = new Map(freeze.rows.map((row) => [row.listItemId, row]));
    const receiptById = new Map(items.map((item) => [String(item.id), item]));
    expect(new Set(obs.evaluatedRowIds).size).toBe(obs.evaluatedRowIds.length); // no dupes
    const predictedRecomputed = obs.evaluatedRowIds
      .reduce((sum, id) => sum + freezeById.get(id).price, 0);
    const actualRecomputed = obs.evaluatedRowIds
      .reduce((sum, id) => sum + receiptById.get(id).price, 0);
    expect(predictedRecomputed).toBe(obs.predictedSubtotal);
    expect(actualRecomputed).toBe(obs.actualSubtotal);
    // Every evaluated id exists on BOTH sides — the sets cannot diverge.
    for (const id of obs.evaluatedRowIds) {
      expect(freezeById.has(id)).toBe(true);
      expect(receiptById.has(id)).toBe(true);
    }
    expect(obs.notPurchasedRows).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3–6. Spend provenance and price coverage gates
// ---------------------------------------------------------------------------

describe('spend provenance and price coverage decide eligibility', () => {
  it('a manual-only basket can never enter Forq spend accuracy', () => {
    const freeze = basketPredictionEvent({
      rows: [
        { id: 'a', name: 'Soap', qty: '1', price: 3, provenance: 'user-manual' },
        { id: 'b', name: 'Sponge', qty: '2', price: 2, provenance: 'user-manual' },
      ],
      day: TODAY,
    });
    expect(freeze.provenance).toBe('user-manual');
    const shop = {
      id: 'h1', date: TODAY, total: 5,
      items: [{ id: 'a', name: 'Soap', price: 3 }, { id: 'b', name: 'Sponge', price: 4 }],
      spendPrediction: copiedFreeze(freeze),
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    expect(result.excluded.map((e) => e.reason)).toContain('manual-only-basket');
  });

  it('a mixed basket scores only the attributable Forq rows', () => {
    const freeze = basketPredictionEvent({
      rows: [
        { id: 'f', name: 'Rice', qty: '300g', price: 4, provenance: 'forq' },
        { id: 'u', name: 'Candle', qty: '1', price: 6, provenance: 'user-manual' },
      ],
      day: TODAY,
    });
    expect(freeze.provenance).toBe('mixed');
    const shop = {
      id: 'h1', date: TODAY, total: 11,
      items: [{ id: 'f', name: 'Rice', price: 5 }, { id: 'u', name: 'Candle', price: 6 }],
      spendPrediction: copiedFreeze(freeze),
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(1);
    const [obs] = result.observations;
    expect(obs.evaluatedRowIds).toEqual(['f']); // only the Forq-attributed row
    expect(obs.predictedSubtotal).toBe(4);
    expect(obs.actualSubtotal).toBe(5); // receipt price of THAT row, not the £11 total
    expect(obs.unpredictedReceiptRows).toBe(1);
    expect(result.percentageError).toBe(0.25);
  });

  it('incomplete price coverage is excluded — unknown prices never score as £0', () => {
    const freeze = basketPredictionEvent({
      rows: [
        { id: 'ok', name: 'Rice', qty: '300g', price: 2, provenance: 'forq' },
        { id: 'un', name: 'Mystery Item', qty: '1', price: 0, provenance: 'forq' },
      ],
      day: TODAY,
    });
    // The freeze itself records the gap honestly…
    expect(freeze.totalRows).toBe(2);
    expect(freeze.pricedRows).toBe(1);
    expect(freeze.unpricedRows).toBe(1);
    expect(freeze.priceCoverage).toBe(0.5);
    expect(freeze.rows.find((row) => row.listItemId === 'un').priced).toBe(false);
    // …and evaluation excludes rather than scoring the unknown as £0.
    const shop = {
      id: 'h1', date: TODAY, total: 5,
      items: [{ id: 'ok', name: 'Rice', price: 2 }, { id: 'un', name: 'Mystery Item', price: 3 }],
      spendPrediction: copiedFreeze(freeze),
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    const reasons = result.excluded.map((e) => e.reason);
    expect(reasons).toContain('unpriced-prediction-row');
    expect(reasons).toContain('incomplete-price-coverage');
    // The £0 row never produced a "perfect" observation.
    expect(result.observations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4 + 8–10. Subset metadata, substitution re-freeze, checkout, history
// ---------------------------------------------------------------------------

describe('freeze lifecycle: subsets are exact, re-freezes are honest, history is immutable', () => {
  it('subset freeze metadata contains only the subset rows', () => {
    const freeze = basketPredictionEvent({
      rows: [
        { id: 'row-1', name: 'Rice', qty: '300g', price: 4, provenance: 'forq' },
        { id: 'row-2', name: 'Bread', qty: '1', price: 6, provenance: 'forq' },
      ],
      day: TODAY,
      at: 1000,
    });
    const snap = forqSnapshot({ id: 'row-1', name: 'Rice', qty: '300g', subjectKey: 'rice', normalized: { amount: 300, dim: 'mass', unit: 'g' } });
    const state = household({
      basketPredictions: [freeze],
      shoppingPredictions: [snap],
    });
    const record = buildShopRecord({
      state,
      items: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4 }],
      store: 'Tesco', total: 4, id: 'h1', day: TODAY,
    });
    // A £4 total with £10 of full-basket metadata is impossible: every
    // field describes exactly the bought subset.
    expect(record.spendPrediction.predictedTotal).toBe(4);
    expect(record.spendPrediction.rows.map((row) => row.listItemId)).toEqual(['row-1']);
    expect(record.spendPrediction.rowPredictionIds).toEqual(['row-1']);
    expect(record.spendPrediction.totalRows).toBe(1);
    expect(record.spendPrediction.pricedRows).toBe(1);
    expect(record.spendPrediction.priceCoverage).toBe(1);
    expect(record.spendPrediction.subsetOf).toBe(freeze.id);
    expect(record.spendPrediction.matchedBy).toBe('row-subset');
  });

  it('Rice £1 → Quinoa £3 creates a substitution-reprice freeze; checkout evaluates against the £3-era basket', () => {
    const riceSnap = forqSnapshot({ id: 'row-1', name: 'Rice', qty: '300g', subjectKey: 'rice' });
    const freeze1 = basketPredictionEvent({
      rows: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 1, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    let state = household({
      shoppingList: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 1, checked: false }],
      shoppingPredictions: [riceSnap],
      basketPredictions: [freeze1],
    });
    const actions = driver(shoppingActions, state);
    actions.run('substituteListItem', 'row-1', { name: 'Quinoa', price: 3 });
    state = actions.state();

    const freezes = state.basketPredictions;
    const latest = activeBasketFreezes(freezes)[0];
    expect(latest.source).toBe('substitution-reprice');
    expect(latest.predicted).toBe(3);
    // The £1-era freeze remains as historical evidence but is superseded —
    // it must not describe the newly displayed basket.
    expect(freezes.find((f) => f.id === freeze1.id).invalidated).toBeTruthy();
    expect(activeBasketFreezes(freezes)).toHaveLength(1);

    // Checkout now copies the £3-era freeze.
    const record = buildShopRecord({
      state,
      items: [{ id: 'row-1', name: 'Quinoa', qty: '300g', price: 3 }],
      store: 'Tesco', total: 3, id: 'h2', day: TODAY,
    });
    expect(record.spendPrediction.basketPredictionId).toBe(latest.id);
    expect(record.spendPrediction.predictedTotal).toBe(3);
  });

  it('checkout uses the latest valid pre-purchase freeze, never an invalidated one', () => {
    const old = basketPredictionEvent({
      rows: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    const fresh = basketPredictionEvent({
      rows: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 7, provenance: 'forq' }],
      day: TODAY, at: 2000,
    });
    const snap = forqSnapshot({ id: 'row-1', name: 'Rice', qty: '300g', subjectKey: 'rice' });
    const record = buildShopRecord({
      state: household({ basketPredictions: [old, fresh], shoppingPredictions: [snap] }),
      items: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 7 }],
      store: 'Tesco', total: 7, id: 'h1', day: TODAY,
    });
    expect(record.spendPrediction.basketPredictionId).toBe(fresh.id);
    expect(record.spendPrediction.predictedTotal).toBe(7);
  });

  it('post-purchase repricing cannot change historical spend accuracy', () => {
    const freeze1 = basketPredictionEvent({
      rows: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    const snap = forqSnapshot({ id: 'row-1', name: 'Rice', qty: '300g', subjectKey: 'rice' });
    const base = household({
      shoppingList: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4, checked: true }],
      shoppingPredictions: [snap],
      basketPredictions: [freeze1],
    });
    const record = buildShopRecord({
      state: base,
      items: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4 }],
      store: 'Tesco', total: 4, id: 'h1', day: TODAY,
    });
    const shopState = household({ ...base, shops: [record] });
    const before = spendAccuracy(shopState, { today: TODAY });
    expect(before.samples).toBe(1);
    expect(before.observations[0].basketPredictionId).toBe(freeze1.id);

    // The household reprices the (already bought) row afterwards: a NEW
    // freeze supersedes freeze1 in the live book…
    const app = driver(shoppingListMutations, base);
    app.run('updateListItem', 'row-1', { price: 9 });
    expect(app.state().basketPredictions.find((f) => f.id === freeze1.id).invalidated).toBeTruthy();
    expect(activeBasketFreezes(app.state().basketPredictions)).toHaveLength(1);

    // …but the HISTORICAL record still reads its copied freeze, verbatim.
    const after = spendAccuracy({ ...app.state(), shops: [record] }, { today: TODAY });
    expect(after.observations[0].basketPredictionId).toBe(freeze1.id);
    expect(after.observations[0].predictedSubtotal).toBe(before.observations[0].predictedSubtotal);
    expect(after.value).toBe(before.value);
  });
});

// ---------------------------------------------------------------------------
// 11. Timestamps: prediction cannot postdate purchase
// ---------------------------------------------------------------------------

describe('spend provenance timestamps', () => {
  it('a freeze dated after the shop day is excluded', () => {
    const freeze = basketPredictionEvent({
      rows: [{ id: 'a', name: 'A', price: 5, provenance: 'forq' }],
      day: '2026-09-17', at: 1000,
    });
    const shop = {
      id: 'h1', date: TODAY, total: 5,
      items: [{ id: 'a', name: 'A', price: 5 }],
      spendPrediction: copiedFreeze(freeze, { predictedAt: '2026-09-17' }),
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded.map((e) => e.reason)).toContain('spend-prediction-postdates-shop');
  });

  it('predictionAt > purchaseAt (precise ms) is excluded, not assumed', () => {
    const freeze = basketPredictionEvent({
      rows: [{ id: 'a', name: 'A', price: 5, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    const shop = {
      id: 'h1', date: TODAY, total: 5, purchasedAt: 500, // bought at t=500…
      items: [{ id: 'a', name: 'A', price: 5 }],
      spendPrediction: copiedFreeze(freeze, { predictedAtMs: 1000 }), // …freeze claims t=1000
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded.map((e) => e.reason)).toContain('spend-prediction-postdates-purchase');

    // Correct ordering scores, with precise chronology proven.
    const ok = { ...shop, purchasedAt: 2000 };
    const scored = spendAccuracy(household({ shops: [ok] }), { today: TODAY });
    expect(scored.samples).toBe(1);
    expect(scored.observations[0].chronologyProof).toBe('precise');
  });
});

// ---------------------------------------------------------------------------
// 8–10. Override learning: attributable, strengthening, never an outcome
// ---------------------------------------------------------------------------

describe('quantity overrides are real, attributable learning evidence', () => {
  const eggSnap = () => forqSnapshot(); // id row-e, eggs, forq-plan
  const eggState = (events, over = {}) => household({
    shoppingPredictions: [eggSnap()],
    shoppingList: [{ id: 'row-e', name: 'Eggs', qty: '6', fromRecipe: 'Omelette' }],
    quantityOverrides: events,
    ...over,
  });
  const eggsEvent = (over = {}) => quantityOverrideEvent({
    predictionId: 'row-e',
    subjectKey: 'eggs',
    listItemId: 'row-e',
    originalQty: '6',
    overrideQty: '3',
    dimension: 'count',
    day: TODAY,
    ...over,
  });

  it('override events affect learning: profile counts them and future quantities move', () => {
    const events = [eggsEvent({ id: 'q1' }), eggsEvent({ id: 'q2' }), eggsEvent({ id: 'q3' }), eggsEvent({ id: 'q4' })];
    const profile = overrideLearningProfile(eggState(events));
    expect(profile.samples).toBe(4);
    expect(profile.directions.decrease).toBe(4);
    expect(profile.meanRelativeDelta).toBe(-0.5);
    expect(profile.bySubject[0].subjectKey).toBe('eggs');
    expect(profile.overrideRate).toBeGreaterThan(0); // ÷ Forq-advice rows shown
    // And the learning is APPLIED: repeated reductions lower the quantity
    // Forq will show next (recipe row, Forq-advice target).
    const items = [{ id: 'row-x', name: 'Eggs', qty: '6', fromRecipe: 'Omelette' }];
    const adjusted = applyOverrideLearning(items, profile);
    expect(adjusted[0].qty).toBe('3'); // 6 × (1 − 0.5), full strength (high)
    expect(adjusted[0].overrideAdjustment).toMatchObject({ count: 4, direction: 'decrease', strength: 'high' });
    // overridePressure reads the EVENT BOOK, not list inference.
    const pressure = overridePressure(eggState(events));
    expect(pressure.evidenceSource).toBe('quantity-override-events');
    expect(pressure.evidenceCounts.quantityEdits).toBe(1); // one distinct row still on the list
  });

  it('repeated same-direction overrides strengthen; one-off and mixed stay weak', () => {
    const items = [{ id: 'row-x', name: 'Eggs', qty: '6', fromRecipe: 'Omelette' }];
    // One-off → weak → nothing changes yet.
    const one = overrideLearningProfile(eggState([eggsEvent({ id: 'q1' })]));
    expect(one.bySubject[0].strength).toBe('weak');
    expect(applyOverrideLearning(items, one)).toBe(items);
    // Two consistent → medium → half strength (6 × 0.875 = 4.5 → 5 whole eggs).
    const two = overrideLearningProfile(eggState([eggsEvent({ id: 'q1' }), eggsEvent({ id: 'q2' })]));
    expect(two.bySubject[0].strength).toBe('medium');
    expect(applyOverrideLearning(items, two)[0].qty).toBe('5'); // 6 × (1 − 0.25), ceiled to a whole count
    // Four consistent → high → full strength.
    const four = overrideLearningProfile(eggState([
      eggsEvent({ id: 'q1' }), eggsEvent({ id: 'q2' }), eggsEvent({ id: 'q3' }), eggsEvent({ id: 'q4' }),
    ]));
    expect(four.bySubject[0].strength).toBe('high');
    // Profile-level confidence rides TOTAL sample count (4 → medium); the
    // per-subject STRENGTH is the high-confidence adaptation signal.
    expect(four.confidence).toBe('medium');
    // Mixed directions prove nothing → never obeyed.
    const mixed = overrideLearningProfile(eggState([
      eggsEvent({ id: 'q1' }),
      eggsEvent({ id: 'q2', originalQty: '3', overrideQty: '5' }),
      eggsEvent({ id: 'q3' }),
    ]));
    expect(mixed.bySubject[0].strength).toBe('weak-mixed');
    expect(applyOverrideLearning(items, mixed)).toBe(items);
    // Systematic-bias views are subject-level, not guesses.
    expect(one.systematic.overprediction).toBe(0);
    expect(four.systematic.overprediction).toBe(1);
  });

  it('manual and repeat-shop rows never affect override learning', () => {
    const manualSnap = forqSnapshot({ id: 'row-m', provenance: 'user-manual' });
    const repeatSnap = forqSnapshot({ id: 'row-r', provenance: 'user-repeat-shop' });
    const state = household({
      shoppingPredictions: [manualSnap, repeatSnap],
      quantityOverrides: [
        quantityOverrideEvent({ predictionId: 'row-m', subjectKey: 'eggs', listItemId: 'row-m', originalQty: '6', overrideQty: '3', day: TODAY, id: 'q1' }),
        quantityOverrideEvent({ predictionId: 'row-r', subjectKey: 'eggs', listItemId: 'row-r', originalQty: '6', overrideQty: '3', day: TODAY, id: 'q2' }),
        quantityOverrideEvent({ predictionId: 'row-m', subjectKey: 'eggs', listItemId: 'row-m', originalQty: '6', overrideQty: '3', day: TODAY, id: 'q3' }),
      ],
    });
    const profile = overrideLearningProfile(state);
    expect(profile.samples).toBe(0);
    expect(profile.excluded).toHaveLength(3);
    expect(profile.excludedReasons['not-forq-provenance']).toBe(3);
    // And a manual row is never a TARGET either: Forq does not rewrite it.
    const manualItems = [{ id: 'row-m', name: 'Eggs', qty: '6' }]; // no fromRecipe/sourceRecipes/autoGenerated
    const forqProfile = overrideLearningProfile(eggState([
      eggsEvent({ id: 'q1' }), eggsEvent({ id: 'q2' }), eggsEvent({ id: 'q3' }),
    ]));
    expect(applyOverrideLearning(manualItems, forqProfile)).toBe(manualItems);
  });

  it('an override plus its later purchase are never double-counted', () => {
    const shop = {
      id: 'h1', date: TODAY, total: 1,
      items: [{ id: 'row-e', name: 'Eggs', qty: '4', price: 1 }],
      predictions: [{ id: 'row-e', name: 'Eggs', qty: '6', day: TODAY, provenance: 'forq-plan' }],
    };
    const state = household({
      shops: [shop],
      shoppingPredictions: [eggSnap()],
      quantityOverrides: [eggsEvent({ id: 'q1' }), eggsEvent({ id: 'q2' })],
      predictionCorrections: [],
    });
    // The purchase pipeline counts exactly ONE observation…
    const qty = shoppingQuantityError(state, { today: TODAY });
    expect(qty.purchaseQuantityAccuracy.samples).toBe(1);
    expect(qty.explicitQuantityCorrectionAccuracy.samples).toBe(0);
    expect(qty.combinedLearningSignal.samples).toBe(1);
    expect(qty.purchaseQuantityAccuracy.observations).toHaveLength(1);
    // …and the overrides live in their OWN evidence stream: counted there
    // once, never added as a second "correction" of the same mistake.
    const profile = overrideLearningProfile(state);
    expect(profile.samples).toBe(2);
    const overrideIds = profile.observations.map((row) => row.predictionId);
    expect(new Set(overrideIds)).toEqual(new Set(['row-e']));
    expect(qty.combinedLearningSignal.observations.every((o) => o.source !== 'override')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 16. Legacy and current evidence schemas stay safe
// ---------------------------------------------------------------------------

describe('evidence schema versions remain safe', () => {
  it('unknown override and basket schemas fail with named reasons', () => {
    expect(overrideSchemaStatus({ schemaVersion: 9 }).ok).toBe(false);
    expect(overrideSchemaStatus({ schemaVersion: 9 }).reason).toBe('unsupported-override-schema');
    expect(overrideSchemaStatus({ schemaVersion: 'x' }).reason).toBe('malformed-override-schema');
    expect(basketSchemaStatus({ schemaVersion: 99 }).ok).toBe(false);
    expect(basketSchemaStatus({ schemaVersion: 99 }).reason).toBe('unsupported-basket-prediction-schema');
    expect(basketSchemaStatus({}).reason).toBe('malformed-basket-prediction');
    // v1 freezes are supported legacy (deliberate), v2 is current.
    expect(basketSchemaStatus({ schemaVersion: 1 })).toMatchObject({ ok: true, legacy: true });
    expect(basketSchemaStatus({ schemaVersion: 2 })).toMatchObject({ ok: true, legacy: false });

    // A future-schema freeze is excluded from spend accuracy, named.
    const shop = {
      id: 'h1', date: TODAY, total: 5,
      items: [{ id: 'a', name: 'A', price: 5 }],
      spendPrediction: { schemaVersion: 99, predictedTotal: 5, rows: [{ listItemId: 'a', price: 5 }] },
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded.map((e) => e.reason)).toContain('unsupported-basket-prediction-schema');
  });

  it('a legacy v1 freeze still scores deliberately, attributed via the shop\'s frozen snapshots', () => {
    // v1 freeze: no provenance/coverage on its rows — attribution falls back
    // to the shop record's FROZEN prediction snapshots (checkout evidence).
    const shop = {
      id: 'h1', date: TODAY, total: 6,
      items: [{ id: 'a', name: 'A', price: 6 }],
      predictions: [{ id: 'a', name: 'A', qty: '1', day: TODAY, provenance: 'forq-plan' }],
      spendPrediction: {
        basketPredictionId: 'bp-old', schemaVersion: 1,
        predictedAt: '2026-09-15', predictedTotal: 5,
        rows: [{ listItemId: 'a', name: 'A', price: 5 }],
        rowPredictionIds: ['a'], matchedBy: 'day',
      },
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(1);
    const [obs] = result.observations;
    expect(obs.evaluatedRowIds).toEqual(['a']);
    expect(obs.predictedSubtotal).toBe(5);
    expect(obs.actualSubtotal).toBe(6);
    expect(obs.chronologyProof).toBe('day-level'); // labelled, never upgraded
  });

  it('malformed override events are excluded from learning with named reasons', () => {
    const profile = overrideLearningProfile(household({
      shoppingPredictions: [forqSnapshot()],
      quantityOverrides: [
        { id: 'bad1', schemaVersion: 9, predictionId: 'row-e', subjectKey: 'eggs' },
        { id: 'bad2', schemaVersion: 'x', predictionId: 'row-e' },
        { id: 'bad3', schemaVersion: 1, predictionId: 'ghost', subjectKey: 'eggs' },
        { id: 'bad4', schemaVersion: 1, subjectKey: 'eggs' },
        quantityOverrideEvent({ predictionId: 'row-e', subjectKey: 'eggs', listItemId: 'row-e', originalQty: '6', overrideQty: '3', dimension: 'count', day: TODAY, id: 'good' }),
      ],
    }));
    expect(profile.samples).toBe(1);
    expect(profile.excludedReasons).toEqual({
      'unsupported-override-schema': 1,
      'malformed-override-schema': 1,
      'prediction-not-found': 1,
      'missing-prediction-id': 1,
    });
  });
});
