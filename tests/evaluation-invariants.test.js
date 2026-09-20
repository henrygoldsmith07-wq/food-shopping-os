import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import {
  upsertPredictions,
  replacePredictionsForList,
  attachPredictions,
  buildShopRecord,
  validatePredictionSnapshot,
  validatePredictionSnapshotWithReason,
  SNAPSHOT_REJECTION_REASONS,
  shoppingPrediction,
} from '../src/lib/shopping-predictions.js';
import { shoppingQuantityError } from '../src/lib/eval-metrics.js';
import { buildDomainCommands } from '../src/lib/store-commands.js';
import {
  suppressionDecision,
  recoveryEvidenceFor,
} from '../src/lib/adaptation-suppression.js';

const TODAY = '2026-09-16';
const NOON = 'T12:00:00.000Z';

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

const ledgerEvent = (type, day, payload = {}, extra = {}) => ({
  id: `e-${Math.random().toString(36).slice(2, 8)}`,
  type,
  at: `${day}${NOON}`,
  day,
  origin: 'user',
  ...payload,
  ...extra,
});

const frozenShop = (over = {}) => ({
  id: 'h1',
  date: '2026-09-15',
  total: 3,
  items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
  predictions: [{ id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-15' }],
  ...over,
});

describe('snapshot lifecycle invariants', () => {
  it('adding one item does not delete existing snapshots', () => {
    const existing = attachPredictions([listRow({ id: 'a', qty: '300g' })], [], { day: TODAY });
    expect(existing).toHaveLength(1);
    const after = upsertPredictions(
      [listRow({ id: 'b', name: 'Bread', qty: '1' })],
      existing,
      { day: TODAY },
    );
    expect(after.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(after.find((p) => p.id === 'a').qty).toBe('300g');
  });

  it('updating one prediction does not mutate unrelated predictions', () => {
    const existing = attachPredictions(
      [listRow({ id: 'a', qty: '300g' }), listRow({ id: 'b', name: 'Bread', qty: '1' })],
      [],
      { day: TODAY },
    );
    const beforeB = existing.find((p) => p.id === 'b');
    const after = upsertPredictions([listRow({ id: 'a', qty: '600g' })], existing, { day: TODAY });
    expect(after.find((p) => p.id === 'a').qty).toBe('600g');
    const afterB = after.find((p) => p.id === 'b');
    expect(afterB).toBe(beforeB); // same object, untouched
  });

  it('replacePredictionsForList evicts rows that left the list; the alias keeps the old name', () => {
    const existing = attachPredictions(
      [listRow({ id: 'a' }), listRow({ id: 'b', name: 'Bread', qty: '1' })],
      [],
      { day: TODAY },
    );
    // Full visible list = only row b now: a's snapshot is evicted…
    const replaced = replacePredictionsForList(
      [listRow({ id: 'b', name: 'Bread', qty: '1' })], existing, { day: TODAY },
    );
    expect(replaced.map((p) => p.id)).toEqual(['b']);
    // …and the retained alias behaves identically (fresh timestamps aside).
    const stripAt = (rows) => rows.map(({ at, ...rest }) => rest);
    expect(stripAt(attachPredictions([listRow({ id: 'b', name: 'Bread', qty: '1' })], existing, { day: TODAY })))
      .toEqual(stripAt(replaced));
    // An emptied list evicts everything — frozen copies live on shop records.
    expect(replacePredictionsForList([], existing, { day: TODAY })).toEqual([]);
  });

  it('the canonical schema gate validates snapshots centrally and rejects malformed ones', () => {
    const good = shoppingPrediction({ itemId: 'g1', name: 'Rice', qty: '300g', sourceRecipes: ['Curry'] });
    const validated = validatePredictionSnapshot(good);
    expect(validated.dimension).toBe('mass');
    expect(validated.qty).toBe('300g');
    expect(validated.subjectKey).toBe('rice'); // canonical subject identity
    // A count quantity is a real dimension…
    expect(validatePredictionSnapshot({ id: 'g2', name: 'Eggs', qty: '6', at: 5 })?.dimension).toBe('count');
    // …but no id, no quantity, or an unreadable quantity is rejected, not coerced.
    expect(validatePredictionSnapshot(null)).toBeNull();
    expect(validatePredictionSnapshot({ name: 'Rice', qty: '300g' })).toBeNull();
    expect(validatePredictionSnapshot({ id: 'g3', name: 'Rice', qty: '' })).toBeNull();
    expect(validatePredictionSnapshot({ id: 'g4', name: 'Mystery', qty: 'a few' })).toBeNull();
  });

  it('a snapshot with no day and no timestamp has no provenance and is rejected for evaluation', () => {
    const verdict = validatePredictionSnapshotWithReason({ id: 'p1', name: 'Rice', qty: '300g' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe(SNAPSHOT_REJECTION_REASONS.NO_PROVENANCE);
    // Either a day or a timestamp satisfies the provenance requirement.
    expect(validatePredictionSnapshotWithReason({ id: 'p2', name: 'Rice', qty: '300g', day: '2026-09-15' }).ok).toBe(true);
    expect(validatePredictionSnapshotWithReason({ id: 'p3', name: 'Rice', qty: '300g', at: 1726000000000 }).ok).toBe(true);
  });

  it('a snapshot with no subject identity is rejected — evaluation never guesses WHAT it was about', () => {
    const verdict = validatePredictionSnapshotWithReason({ id: 'p4', qty: '300g', day: '2026-09-15', predictionKey: '  ', name: ' ' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe(SNAPSHOT_REJECTION_REASONS.NO_SUBJECT);
  });

  it('both purchase paths freeze equivalent snapshot metadata through one helper', () => {
    const book = upsertPredictions([listRow({ id: 'row-9', qty: '300g' })], [], { day: TODAY });
    const items = [{ id: 'row-9', name: 'Rice', qty: '600g', price: 1.2 }];

    // recordShop's checked-rows flow builds its record through buildShopRecord…
    const viaRecordShop = buildShopRecord({
      state: { shoppingPredictions: book }, items, store: 'Tesco', total: 2.7, id: 'h1', day: TODAY,
    });
    // …and so does the purchaseIngredients domain command — proven by driving it.
    let state = household({ shoppingPredictions: book });
    const commands = buildDomainCommands((patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    });
    commands.purchaseIngredients({ items, store: 'Aldi', total: 2.2, id: 's1' });
    const viaCommand = state.shops.at(-1);

    expect(viaCommand.predictions).toEqual(viaRecordShop.predictions);
    expect(viaCommand.predicted).toBe(viaRecordShop.predicted);
    expect(viaCommand.date).toBe(viaRecordShop.date);
    expect(viaCommand.items).toEqual(viaRecordShop.items);
    expect(viaCommand.predictions[0].qty).toBe('300g'); // frozen at purchase, not the bought amount
  });

  it('a purchase consumes the bought rows from the live book, and consumed predictions cannot be evaluated twice', () => {
    const book = upsertPredictions([listRow({ id: 'row-9', qty: '300g' })], [], { day: TODAY });
    let state = household({ shoppingPredictions: book });
    const commands = buildDomainCommands((patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    });
    commands.purchaseIngredients({
      items: [{ id: 'row-9', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1',
    });
    expect(state.shops[0].predictions).toHaveLength(1); // frozen onto the shop record
    expect(state.shoppingPredictions.find((p) => p.id === 'row-9')).toBeUndefined(); // consumed

    // A second till run carrying the same row id finds NO book entry left to
    // freeze: it cannot score the same displayed prediction twice.
    commands.purchaseIngredients({
      items: [{ id: 'row-9', name: 'Rice', qty: '900g', price: 1.5 }],
      store: 'Tesco', total: 1.5, id: 'h2',
    });
    expect(state.shops[1].predictions).toEqual([]);

    const evaluated = shoppingQuantityError(state, { today: TODAY });
    expect(evaluated.samples).toBe(1); // only the first shop's frozen row
    expect(evaluated.observations[0].shopId).toBe('h1');
    expect(evaluated.excluded[0]).toMatchObject({ reason: 'no-frozen-prediction', shopId: 'h2' });

    // And an idempotent replay of the same purchase appends nothing at all.
    const shopsBefore = state.shops.length;
    const ledgerBefore = state.householdLedger.filter((e) => e.type === 'IngredientPurchased').length;
    commands.purchaseIngredients({
      items: [{ id: 'row-9', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1',
    });
    expect(state.shops).toHaveLength(shopsBefore);
    expect(state.householdLedger.filter((e) => e.type === 'IngredientPurchased')).toHaveLength(ledgerBefore);
  });
});

describe('evaluation truth invariants', () => {
  it('direct corrections and purchase observations enter one pipeline with one canonical shape', () => {
    const state = household({
      predictionCorrections: [
        {
          id: 'pc1', type: 'prediction_correction', predictionType: 'shopping-qty',
          predictionKey: 'chickpeas', predictionId: 'row-1', subjectKey: 'chickpeas',
          predicted: 2, predictedUnit: 'tin', dimension: 'count', actual: 1,
          date: '2026-09-15', at: Date.now(), schemaVersion: 2,
        },
      ],
      shops: [frozenShop()],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    // The root is the PURCHASE accuracy alone; the combined learning view is
    // explicit and separate (task: no blended root metric).
    expect(result.samples).toBe(1);
    expect(result.observations).toHaveLength(1);
    expect(result.combinedLearningSignal.samples).toBe(2);
    // One canonical observation shape across BOTH provenance routes.
    for (const o of result.combinedLearningSignal.observations) {
      expect(Object.keys(o)).toEqual(expect.arrayContaining([
        'relativeError', 'signedError', 'absoluteDiff', 'dimension', 'source',
        'predictionId', 'shopId', 'outcomeId',
      ]));
      expect(['purchase', 'correction']).toContain(o.source);
      expect(Number.isFinite(o.relativeError)).toBe(true);
      expect(Number.isFinite(o.signedError)).toBe(true);
      expect(Number.isFinite(o.absoluteDiff)).toBe(true);
    }
    expect(result.combinedLearningSignal.observations.map((o) => o.source).sort()).toEqual(['correction', 'purchase']);
    expect(result.observations[0].source).toBe('purchase');
    expect(result.observations[0].predictionId).toBe('row-1');
    expect(result.observations[0].shopId).toBe('h1');
    const correctionRow = result.combinedLearningSignal.observations.find((o) => o.source === 'correction');
    expect(correctionRow.outcomeId).toBe('pc1');
    expect(correctionRow.dimension).toBe('count'); // PROVEN, never assumed
    expect(correctionRow.predictionId).toBe('row-1'); // the frozen prediction it answers
  });

  it('malformed observations are excluded and counted — NaN and Infinity never enter results', () => {
    const state = household({
      predictionCorrections: [
        // v2 rows with a proven measurement block but broken values:
        // predicted missing entirely…
        { id: 'pc1', type: 'prediction_correction', predictionType: 'shopping-qty', predictionKey: 'flour', predictionId: 'row-f', subjectKey: 'flour', predictedUnit: 'tin', dimension: 'count', predicted: null, actual: 2, date: '2026-09-15', at: Date.now(), schemaVersion: 2 },
        // …predicted zero (division would blow up)…
        { id: 'pc2', type: 'prediction_correction', predictionType: 'shopping-qty', predictionKey: 'sugar', predictionId: 'row-s', subjectKey: 'sugar', predictedUnit: 'tin', dimension: 'count', predicted: 0, actual: 2, date: '2026-09-15', at: Date.now(), schemaVersion: 2 },
        // …undated (a legacy row — the date gate runs first).
        { id: 'pc3', type: 'prediction_correction', predictionType: 'shopping-qty', predictionKey: 'oats', predicted: 2, actual: 1 },
      ],
      shops: [frozenShop({ predictions: [{ id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: 'a few' }] })],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    const reasons = result.excluded.map((e) => e.reason);
    expect(reasons).toContain('missing-predicted-qty');
    expect(reasons).toContain('non-positive-predicted-qty');
    expect(reasons).toContain('undated-observation');
    // The frozen snapshot with the unreadable quantity fails the CENTRAL
    // schema gate, with the gate's own reason.
    expect(reasons).toContain('snapshot-unreadable-quantity');
    // Every reported number is finite, whatever came in.
    for (const n of [result.value, result.signedBias, ...Object.values(result.absoluteErrorsByDim)]) {
      expect(n === null || Number.isFinite(n)).toBe(true);
    }
  });

  it('a historical shop is evaluated ONLY against its frozen prediction — never the live book', () => {
    const state = household({
      // The live book currently says 100g — the CURRENT list on screen. The
      // purchase from last week was advised 300g, but that freeze was lost.
      shoppingPredictions: [{ id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: '100g', at: 999 }],
      shops: [{ id: 'h1', date: '2026-09-10', total: 2, items: [{ id: 'row-1', name: 'Rice', qty: '600g' }] }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    expect(result.excluded[0]).toMatchObject({ reason: 'no-frozen-prediction', shopId: 'h1' });
  });

  it('a missing frozen prediction is excluded with a reason, not matched by name', () => {
    const state = household({
      shops: [{
        id: 'h9', date: '2026-09-15', total: 4,
        items: [{ id: 'x1', name: 'Basil', qty: '1' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded[0].reason).toBe('no-frozen-prediction');
  });

  it('the supplied historical today is honoured — backtests see only what that day could see', () => {
    const state = household({ shops: [frozenShop()] }); // shop on 2026-09-15
    // Evaluating from 2026-09-20: the shop is in the past, so it scores.
    const backtest = shoppingQuantityError(state, { today: '2026-09-20' });
    expect(backtest.samples).toBe(1);
    expect(backtest.value).toBe(1); // |600 − 300| / 300
    // Evaluating from BEFORE the shop: it is the future — excluded, not scored.
    const early = shoppingQuantityError(state, { today: '2026-09-14' });
    expect(early.samples).toBe(0);
    expect(early.excluded[0].reason).toBe('future-shop');
  });

  it('future shops, malformed dates and shops outside the window are excluded and counted', () => {
    const future = shoppingQuantityError(
      household({ shops: [frozenShop({ date: '2026-09-30' })] }), { today: TODAY },
    );
    expect(future.excluded[0].reason).toBe('future-shop');
    const malformed = shoppingQuantityError(
      household({ shops: [frozenShop({ date: 'not-a-date' })] }), { today: TODAY },
    );
    expect(malformed.excluded[0].reason).toBe('malformed-shop-date');
    const old = shoppingQuantityError(
      household({ shops: [frozenShop({ date: '2026-06-01' })] }), { today: TODAY },
    );
    expect(old.excluded[0].reason).toBe('outside-evaluation-window');
    for (const result of [future, malformed, old]) {
      expect(result.samples).toBe(0);
      expect(result.value).toBeNull();
    }
  });

  it('absolute errors use dimension-specific denominators, never the global sample count', () => {
    const state = household({
      shops: [
        // Two mass observations: |600−300| = 300g and |450−300| = 150g.
        frozenShop({ id: 'h1', items: [{ id: 'r1', name: 'Rice', qty: '600g' }], predictions: [{ id: 'r1', name: 'Rice', qty: '300g', day: '2026-09-15' }] }),
        frozenShop({ id: 'h2', items: [{ id: 'r2', name: 'Rice', qty: '450g' }], predictions: [{ id: 'r2', name: 'Rice', qty: '300g', day: '2026-09-15' }] }),
        // One count observation: |3−2| = 1 tin.
        frozenShop({
          id: 'h3',
          items: [{ id: 'r3', name: 'Chickpeas (tins)', qty: '3' }],
          predictions: [{ id: 'r3', name: 'Chickpeas (tins)', qty: '2', day: '2026-09-15' }],
        }),
      ],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(3);
    // mass MAE over MASS observations only: (300 + 150) / 2 = 225 —
    // not 450 ÷ 3 = 150, which is what a global denominator would give.
    expect(result.absoluteErrorsByDim.mass).toBe(225);
    // count MAE over COUNT observations only: 1 — not 1 ÷ 3.
    expect(result.absoluteErrorsByDim.count).toBe(1);
    expect(result.samplesByDim).toEqual({ mass: 2, volume: 0, count: 1 });
  });
});

describe('recovery evidence is attributable to its adaptation domain', () => {
  const ingredientRejection = (day, key = 'chickpeas') => ledgerEvent('RecommendationRejected', day, {
    recommendationId: `adaptation:${key}`,
    context: { kind: 'adaptation', key, undo: 'waste-qty' },
  });

  it('a MealCooked names a recipe, never an ingredient — it is not ingredient recovery evidence', () => {
    const state = household({
      householdLedger: [
        ingredientRejection('2026-09-10'),
        ledgerEvent('MealCooked', '2026-09-12', { recipeId: 'chickpea-curry' }),
      ],
    });
    const evidence = recoveryEvidenceFor(state, 'chickpeas', { today: TODAY });
    expect(evidence.events).toBe(0);
    expect(suppressionDecision(state, 'chickpeas', { today: TODAY }).recoveryStage).toBe('rejected');
  });

  it('ingredient recovery uses attributable evidence: waste, purchase outcome, pantry correction by id, quantity correction', () => {
    const state = household({
      pantry: [
        { id: 'p1', name: 'Chickpeas (tins)' },
        { id: 'p2', name: 'Rice' },
      ],
      householdLedger: [
        ingredientRejection('2026-09-10'),
        // attributable: binned again
        ledgerEvent('IngredientWasted', '2026-09-11', { name: 'Chickpeas (tins)' }),
        // attributable: bought again
        ledgerEvent('IngredientPurchased', '2026-09-12', { items: ['Chickpeas (tins)', 'Rice'] }),
        // attributable: the pantry correction id resolves to the ingredient
        ledgerEvent('PantryCorrected', '2026-09-13', { corrections: ['p1'] }),
        // NOT attributable: a pantry correction for a different ingredient
        ledgerEvent('PantryCorrected', '2026-09-13', { corrections: ['p2'] }, { id: 'pc-other' }),
        // attributable: the household corrected the displayed quantity
        {
          id: 'qty-c1', type: 'prediction_correction', predictionType: 'shopping-qty',
          predictionKey: 'chickpeas', predicted: 2, actual: 0, date: '2026-09-14', at: Date.now(),
        },
      ],
    });
    const evidence = recoveryEvidenceFor(state, 'chickpeas', { today: TODAY });
    expect(evidence.events).toBe(4); // waste + purchase + p1 correction + qty correction
    expect(evidence.kinds).toEqual({
      'ingredient-wasted': 1,
      'purchase-outcome': 1,
      'pantry-correction': 1,
      'quantity-correction': 1,
    });
    expect(evidence.kinds['pantry-correction']).toBe(1); // the p2 correction did not count
  });

  it('a pantry correction whose id no longer resolves is not claimed as evidence', () => {
    const state = household({
      pantry: [], // the corrected item is gone from the pantry
      householdLedger: [
        ingredientRejection('2026-09-10'),
        ledgerEvent('PantryCorrected', '2026-09-12', { corrections: ['p-gone'] }),
      ],
    });
    expect(recoveryEvidenceFor(state, 'chickpeas', { today: TODAY }).events).toBe(0);
  });

  it('portion recovery uses new portion evidence: recorded portion counts and portion corrections', () => {
    const base = [
      ledgerEvent('RecommendationRejected', '2026-09-10', {
        recommendationId: 'adaptation:portions',
        context: { kind: 'adaptation', key: 'portions', undo: 'portions' },
      }),
    ];
    // A cook WITHOUT a recorded portion count says nothing about portions.
    const noPortions = household({
      householdLedger: [...base, ledgerEvent('MealCooked', '2026-09-12', { recipeId: 'chickpea-curry' })],
    });
    const noDecision = suppressionDecision(noPortions, 'portions', { today: TODAY });
    expect(noDecision.recoveryEvidence).toBe(0);
    expect(noDecision.recoveryStage).toBe('rejected');

    // One cook WITH a recorded portion count: evidence accumulates…
    const oneCook = household({
      householdLedger: [...base, ledgerEvent('MealCooked', '2026-09-12', { recipeId: 'chickpea-curry', portions: 2 })],
    });
    const oneDecision = suppressionDecision(oneCook, 'portions', { today: TODAY });
    expect(oneDecision.recoveryEvidence).toBe(1);
    expect(oneDecision.recoveryStage).toBe('evidence-accumulated');
    expect(oneDecision.state).toBe('rejected'); // not yet enough

    // …two recorded portion counts earn reconsideration.
    const twoCooks = household({
      householdLedger: [
        ...base,
        ledgerEvent('MealCooked', '2026-09-12', { recipeId: 'chickpea-curry', portions: 2 }),
        ledgerEvent('MealCooked', '2026-09-13', { recipeId: 'chickpea-curry', portions: 2 }),
      ],
    });
    const eligible = suppressionDecision(twoCooks, 'portions', { today: TODAY });
    expect(eligible.state).toBe('recovery-eligible');
    expect(eligible.recoveryStage).toBe('reconsideration-eligible');
    expect(eligible.recoveryKinds).toEqual({ 'cooked-portion-observation': 2 });
  });

  it('the recovery ladder is explainable: rejected → held → evidence accumulated → reconsideration eligible', () => {
    const rejection = ingredientRejection('2026-09-10', 'chickpeas');
    const wasteOn = (id, day) => ledgerEvent('IngredientWasted', day, { name: 'Chickpeas (tins)' }, { id });

    // plain hold
    expect(suppressionDecision(household({ householdLedger: [rejection] }), 'chickpeas', { today: TODAY }).recoveryStage)
      .toBe('rejected');
    // some evidence, not enough
    const one = household({ householdLedger: [rejection, wasteOn('w1', '2026-09-12')] });
    expect(suppressionDecision(one, 'chickpeas', { today: TODAY }).recoveryStage).toBe('evidence-accumulated');
    // enough evidence
    const two = household({ householdLedger: [rejection, wasteOn('w1', '2026-09-12'), wasteOn('w2', '2026-09-13')] });
    expect(suppressionDecision(two, 'chickpeas', { today: TODAY }).recoveryStage).toBe('reconsideration-eligible');
    // a double rejection with no new evidence is held, not merely rejected
    const doubled = household({
      householdLedger: [
        ingredientRejection('2026-09-01', 'chickpeas'),
        ingredientRejection('2026-09-03', 'chickpeas'),
      ],
    });
    const held = suppressionDecision(doubled, 'chickpeas', { today: TODAY });
    expect(held.state).toBe('suppressed');
    expect(held.recoveryStage).toBe('held');
  });
});
