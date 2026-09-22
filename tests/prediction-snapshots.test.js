import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { shoppingListForPlan } from '../src/lib/loop-learning.js';
import { householdPortionsFor } from '../src/lib/portions.js';
import {
  heldAdaptationKeys,
  suppressedAdaptations,
  adaptationRejections,
  suppressionDecision,
  recoveryEvidenceFor,
  EVIDENCE_RECOVERY_THRESHOLD,
} from '../src/lib/adaptation-suppression.js';
import {
  shoppingPrediction,
  attachPredictions,
  buildShopRecord,
  weekStamp,
  evaluablePredictions,
} from '../src/lib/shopping-predictions.js';
import { basketPredictionEvent } from '../src/lib/prediction-evidence.js';

// A real pre-purchase basket freeze, as list generation leaves it, that
// describes exactly the given rows — the honest way to make a shop
// scoreable under the frozen-spend-prediction contract.
const freezeFor = (rows) => {
  const event = basketPredictionEvent({ rows, day: TODAY, at: 1000 });
  return { event, basketPredictions: [event] };
};
import { spendAccuracy, shoppingQuantityError } from '../src/lib/eval-metrics.js';

const TODAY = '2026-09-16';
const NOON = 'T12:00:00.000Z';

const ledgerEvent = (type, day, payload = {}, extra = {}) => ({
  id: `e-${Math.random().toString(36).slice(2, 8)}`,
  type,
  at: `${day}${NOON}`,
  day,
  origin: 'user',
  ...payload,
  ...extra,
});

const WASTE = [
  { name: 'Chickpeas (tins)', reason: 'not-used-in-time', date: '2026-09-08', cost: 0.75 },
  { name: 'Chickpeas (tins)', reason: 'not-used-in-time', date: '2026-09-13', cost: 0.75 },
];

const household = (over = {}) => ({
  ...EMPTY_STATE,
  onboarded: true,
  portions: 4,
  day: TODAY,
  waste: WASTE,
  ...over,
});

const nextWeekList = (state) => shoppingListForPlan(
  { '2026-09-23': { dinner: 'chickpea-curry' } }, ['2026-09-23'],
  { pantry: [], waste: state.waste, cooked: state.cooked || [], today: TODAY, app: state, state },
);

const rejection = (key, day = TODAY) => ledgerEvent('RecommendationRejected', day, {
  recipeId: null,
  context: { kind: 'adaptation', key },
});

describe('prediction snapshots: what the list actually showed', () => {
  const listRow = (over = {}) => ({
    id: 'row-1',
    name: 'Rice',
    qty: '300g',
    fromRecipe: 'Coconut Chickpea Curry',
    ...over,
  });

  it('a snapshot records the exact displayed quantity, normalized where the engine vouches', () => {
    const p = shoppingPrediction({
      itemId: 'row-1', name: 'Rice', qty: '300g',
      sourceRecipes: ['Coconut Chickpea Curry'],
      portionsDecision: { portions: 4, source: 'configured' },
      week: weekStamp(TODAY), day: TODAY,
    });
    expect(p.id).toBe('row-1');
    expect(p.qty).toBe('300g'); // exactly what was shown, untouched
    expect(p.normalized).toEqual({ amount: 300, dim: 'mass', unit: 'g' });
    expect(p.predictionKey).toBe('rice');
    expect(p.sourceRecipes).toEqual(['Coconut Chickpea Curry']);
    expect(p.portionsDecision).toEqual({ portions: 4, source: 'configured' });
    expect(p.week).toBe('2026-09-14'); // Monday of the week containing TODAY
    expect(p.at).toBeTypeOf('number');
  });

  it('multiple recipes contributing to one item are all named on the snapshot', () => {
    const rows = [
      listRow({ id: 'a', name: 'Rice', qty: '600g', sourceRecipes: ['Curry', 'Fried Rice'] }),
      listRow({ id: 'b', name: 'Spinach', qty: '200 g', fromRecipe: 'Curry' }),
    ];
    const book = attachPredictions(rows, [], { day: TODAY, portionsDecision: { portions: 2 } });
    expect(book.find((p) => p.id === 'a').sourceRecipes).toEqual(['Curry', 'Fried Rice']);
    expect(book.find((p) => p.id === 'b').sourceRecipes).toEqual(['Curry']); // fromRecipe fallback
  });

  it('the book refreshes per row id and evicts rows that left the list', () => {
    const first = attachPredictions([listRow({ qty: '300g' })], [], { day: TODAY });
    const refreshed = attachPredictions([listRow({ qty: '600g' })], first, { day: '2026-09-17' });
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].qty).toBe('600g');
    expect(refreshed[0].day).toBe('2026-09-17'); // overwritten in place, not appended
    const afterRemoval = attachPredictions([], refreshed, { day: '2026-09-17' });
    expect(afterRemoval).toHaveLength(0); // consumed rows live on shop records, not here
  });

  it('pantry deduction, waste adjustment and suppression state ride the snapshot', () => {
    const rows = [
      listRow({ id: 'p1', name: 'Rice', qty: '200 g', requiredQty: '300 g', pantryQty: '100 g', shortfallQty: '200 g' }),
      listRow({ id: 'w1', name: 'Chickpeas (tins)', qty: '1', autoReduction: { reason: 'binned', fromQty: '2', toQty: '1', applied: true, count: 2 } }),
      listRow({ id: 's1', name: 'Avocados', qty: '3' }),
    ];
    const book = attachPredictions(rows, [], { day: TODAY, suppressedKeys: new Set(['avocados']) });
    expect(book.find((p) => p.id === 'p1').pantryDeduction).toEqual({
      requiredQty: '300 g', pantryQty: '100 g', shortfallQty: '200 g', deducted: true,
    });
    expect(book.find((p) => p.id === 'w1').wasteAdjustment.reason).toBe('binned');
    expect(book.find((p) => p.id === 's1').suppressed).toBe(true);
  });

  it('list regeneration writes fresh snapshots matching the displayed quantities', () => {
    const state = household();
    const adapted = nextWeekList(state);
    const row = adapted.find((r) => r.name === 'Chickpeas (tins)');
    expect(row).toBeDefined();
    expect(state.shoppingPredictions).toBeUndefined(); // pure builder: no writes
    expect(state.__allRecipes).toBeUndefined(); // built-in catalogue only — no test injection
    const written = attachPredictions(adapted, [], {
      day: TODAY,
      portionsDecision: householdPortionsFor(state),
      suppressedKeys: heldAdaptationKeys(state, { today: TODAY }),
      learnedAliases: state.aliasMemory || {},
    });
    const snap = written.find((p) => p.predictionKey === 'chickpeas'); // canonical key on the snapshot
    expect(snap.qty).toBe(row.qty); // the snapshot IS the displayed quantity
    expect(snap.sourceRecipes.length).toBeGreaterThan(0);
    expect(snap.suppressed).toBe(false);
  });

  it('snapshots record the learned-portions decision behind the displayed quantity', () => {
    // The household consistently cooked 2-person batches of a 4-person dish:
    // the learned appetite decides the scaling the list shows.
    const state = household({
      portions: 4,
      portionsOverride: 'auto',
      cooked: [
        { recipeId: 'chickpea-curry', date: '2026-09-05', portions: 2 },
        { recipeId: 'chickpea-curry', date: '2026-09-08', portions: 2 },
        { recipeId: 'chickpea-curry', date: '2026-09-11', portions: 2 },
      ],
    });
    const decision = householdPortionsFor(state);
    expect(decision.autoLearned).toBe(true);
    const adapted = nextWeekList(state);
    const row = adapted.find((r) => r.name === 'Rice');
    expect(row).toBeDefined();
    const book = attachPredictions(adapted, [], {
      day: TODAY,
      portionsDecision: decision,
      learnedAliases: state.aliasMemory || {},
    });
    const snap = book.find((p) => p.predictionKey === 'rice');
    expect(snap.portionsDecision.autoLearned).toBe(true);
    expect(snap.qty).toBe(row.qty); // the LEARNED quantity is what was displayed
  });

  it('snapshots record the pantry deduction behind the displayed quantity', () => {
    const state = household({
      pantry: [{ id: 'p1', name: 'Rice', qty: '100 g', confidence: 'definite', location: 'Cupboard' }],
    });
    // Built WITH the pantry, the way the app does — the 100 g on the shelf
    // is deducted from the need, and the shortfall is what gets displayed.
    const adapted = shoppingListForPlan(
      { '2026-09-23': { dinner: 'chickpea-curry' } }, ['2026-09-23'],
      { pantry: state.pantry, waste: state.waste, cooked: [], today: TODAY, app: state, state },
    );
    const row = adapted.find((r) => r.name === 'Rice');
    expect(row).toBeDefined();
    expect(row.requiredQty).toBeDefined(); // the builder names the true need
    const book = attachPredictions(adapted, [], {
      day: TODAY,
      pantry: state.pantry,
      learnedAliases: state.aliasMemory || {},
    });
    const snap = book.find((p) => p.predictionKey === 'rice');
    expect(snap.pantryDeduction.deducted).toBe(true);
    expect(snap.pantryDeduction.requiredQty).toBe(row.requiredQty);
    expect(snap.pantryDeduction.pantryQty).toBe('100 g');
    expect(snap.qty).toBe(row.qty); // and the DISPLAYED (shortfall) quantity is snapshotted
  });

  it('a suppressed adaptation labels its snapshot, not just its row', () => {
    const state = household({ householdLedger: [rejection('chickpeas (tins)')] });
    const held = heldAdaptationKeys(state, { today: TODAY });
    expect(held.has('chickpeas (tins)')).toBe(true);
    const rows = [listRow({ id: 's9', name: 'Chickpeas (tins)', qty: '2' })];
    const book = attachPredictions(rows, [], { day: TODAY, suppressedKeys: held });
    expect(book[0].suppressed).toBe(true);
  });

  it('both purchase paths freeze the same prediction metadata via one helper', () => {
    const book = attachPredictions([listRow({ id: 'row-9', name: 'Rice', qty: '300g' })], [], { day: TODAY });
    const state = { shoppingPredictions: book, ...freezeFor([{ id: 'row-9', name: 'Rice', qty: '300g', price: 1.2 }]) };
    const viaRecordShop = buildShopRecord({
      state, items: [{ id: 'row-9', name: 'Rice', qty: '300g', price: 1.2 }],
      store: 'Tesco', total: 2.7, id: 'h1', day: TODAY,
    });
    const viaCommand = buildShopRecord({
      state, items: [{ id: 'row-9', name: 'Rice', qty: '300g', price: 1.2 }],
      store: 'Aldi', total: 2.2, id: 's1', day: TODAY,
    });
    for (const shop of [viaRecordShop, viaCommand]) {
      expect(shop.predictions).toHaveLength(1);
      expect(shop.predictions[0].qty).toBe('300g');
      // The PRE-PURCHASE freeze is copied verbatim — never the checkout rows.
      expect(shop.predicted).toBe(1.2);
      expect(shop.spendPrediction.basketPredictionId).toBe(state.basketPredictions[0].id);
    }
    expect(viaRecordShop.total).toBe(2.7);
    expect(viaCommand.total).toBe(2.2);
  });

  it('a shop with no snapshot rows and no freeze honestly carries no spend prediction', () => {
    const shop = buildShopRecord({
      state: {}, items: [{ name: 'Bread', qty: '1 loaf', price: 0 }], total: 0, id: 'h2', day: TODAY,
    });
    // Nothing was frozen pre-purchase, so there is nothing to copy — the
    // record says so, and spend accuracy excludes (never reconstructs).
    expect(shop.predicted).toBeNull();
    expect(shop.spendPrediction).toBeNull();
    expect(shop.predictions).toEqual([]);
  });

  it('evaluable predictions carry explicit Forq provenance and a readable quantity', () => {
    // Provenance is now FROZEN ON the snapshot (who produced the quantity),
    // not inferred from sourceRecipes: only Forq-generated advice is
    // evaluable for prediction accuracy, whatever its recipe lineage.
    const book = [
      shoppingPrediction({ itemId: 'x1', name: 'Rice', qty: '300g', provenance: 'forq-plan' }),
      shoppingPrediction({ itemId: 'x2', name: 'Bread', qty: '1 loaf', provenance: 'user-manual' }),
      shoppingPrediction({ itemId: 'x3', name: 'Pasta', qty: '500g', sourceRecipes: ['Curry'] }), // legacy v1: plan-derived
    ];
    expect(evaluablePredictions(book).map((p) => p.id)).toEqual(['x1', 'x3']);
  });
});

describe('quantity error against snapshots: prediction vs purchase', () => {
  it('scores the purchase against the prediction FROZEN onto the shop record', () => {
    const state = household({
      shoppingPredictions: [
        { id: 'b1', predictionKey: 'rice', name: 'Rice', qty: '900g', at: 99 }, // live book lies — must be ignored
      ],
      shops: [{
        id: 'h1', date: '2026-09-15', total: 3,
        items: [{ id: 'b1', name: 'Rice', qty: '600g' }],
        predictions: [{ id: 'b1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-15' }], // frozen at purchase
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.value).toBe(1); // bought double what was shown
    expect(result.samples).toBe(1);
    expect(result.observations[0].predictionId).toBe('b1');
    expect(result.observations[0].source).toBe('purchase');
  });

  it('mean error and exclusions are reported separately', () => {
    const state = household({
      shops: [{
        id: 'h2', date: '2026-09-15', total: 5,
        items: [
          { id: 'b1', name: 'Rice', qty: '600g' },             // +100% over
          { id: 'b2', name: 'Chickpeas (tins)', qty: '1' },     // 50% under
          { id: 'b3', name: 'Basil', qty: '' },                 // no quantity recorded
          { id: 'b4', name: 'Mystery', qty: '2' },              // never predicted
        ],
        predictions: [
          { id: 'b1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-15' },
          { id: 'b2', predictionKey: 'chickpeas', name: 'Chickpeas (tins)', qty: '2', day: '2026-09-15' },
        ],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(2);
    expect(result.value).toBe(0.75); // (1 + 0.5) / 2
    expect(result.excluded.map((e) => e.reason).sort()).toEqual(['no-frozen-prediction', 'unrecorded-purchase-quantity']);
  });

  it('incompatible dimensions are excluded and counted, not forced', () => {
    const state = household({
      shops: [{
        id: 'h3', date: '2026-09-15', total: 2,
        items: [{ id: 'b3', name: 'Chickpeas (tins)', qty: '400g' }],
        predictions: [{ id: 'b3', predictionKey: 'chickpeas', name: 'Chickpeas (tins)', qty: '2', day: '2026-09-15' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.value).toBeNull();
    expect(result.excluded.filter((e) => e.reason === 'incompatible-dimensions')).toHaveLength(1);
  });
});

describe('spend accuracy hardening: only valid predictions are scored', () => {
  it('excludes missing, zero and malformed predictions with reasons', () => {
    // Row spend-provenance rides the freeze: strict spend accuracy scores
    // only Forq-priced rows (an unattributable basket is excluded).
    const priced = freezeFor([{ id: 'g', name: 'A', price: 8, provenance: 'forq' }]);
    // The spendPrediction shape checkout actually copies onto the record.
    const copied = (overrides = {}) => ({
      basketPredictionId: priced.event.id,
      predictedAt: priced.event.day,
      predictedTotal: priced.event.predicted,
      rows: priced.event.rows,
      priceSource: priced.event.source,
      rowPredictionIds: priced.event.rowPredictionIds,
      schemaVersion: priced.event.schemaVersion,
      matchedBy: 'row-ids',
      ...overrides,
    });
    const state = household({ basketPredictions: priced.book, shops: [
      { id: 'g', date: TODAY, total: 10, items: [{ id: 'g', name: 'A', price: 10 }], spendPrediction: copied() }, // scores (row-exact)
      { id: 'm', date: TODAY, total: 5 },                                                     // no snapshot
      { id: 'z', date: TODAY, total: 4, spendPrediction: copied({ predictedTotal: 0 }) },     // zero prediction
      { id: 'n', date: TODAY, total: null, predicted: 9 },   // malformed total
      { id: 'u', date: TODAY, total: 'free', predicted: 3 }, // malformed total
    ] });
    const result = spendAccuracy(state, { today: TODAY });
    expect(result.samples).toBe(1);
    expect(result.value).toBe(0.25); // |10 − 8| / 8
    expect(result.excluded.map((e) => e.reason).sort()).toEqual([
      'malformed-total', 'malformed-total', 'no-pre-purchase-spend-prediction', 'zero-prediction',
    ]);
  });

  it('a zero-priced basket is excluded, not scored as a perfect prediction', () => {
    const state = household({ shops: [{ id: 'z', date: TODAY, total: 0, predicted: 0 }] });
    const result = spendAccuracy(state, { today: TODAY });
    expect(result.value).toBeNull();
    expect(result.samples).toBe(0);
    expect(result.excluded[0].reason).toBe('zero-total');
  });
});

describe('suppression recovery: new evidence earns reconsideration', () => {
  const rejectionOn = (day, id = null) => ({
    ...ledgerEvent('RecommendationRejected', day, { context: { kind: 'adaptation', key: 'chickpeas (tins)' } }),
    ...(id ? { id } : {}),
  });
  const wasteOn = (day, id, name = 'Chickpeas (tins)') => ({
    id, type: 'IngredientWasted', day, at: `${day}${NOON}`, origin: 'user', name,
  });

  it('rejection → hold: regeneration never clears a fresh rejection', () => {
    const state = household({ householdLedger: [rejectionOn('2026-09-16')] });
    const decision = suppressionDecision(state, 'chickpeas (tins)', { today: TODAY });
    expect(decision.state).toBe('rejected');
    expect(decision.holdDaysLeft).toBeGreaterThan(0);
    expect(heldAdaptationKeys(state, { today: TODAY }).has('chickpeas (tins)')).toBe(true);
  });

  it('one new waste event is not enough; the threshold is explicit', () => {
    const state = household({ householdLedger: [
      rejectionOn('2026-09-12'), // rejected four days ago
      wasteOn('2026-09-14', 'w1'), // binned again two days ago
    ] });
    const decision = suppressionDecision(state, 'chickpeas (tins)', { today: TODAY });
    expect(decision.state).toBe('rejected');
    expect(decision.recoveryEvidence).toBe(1);
    expect(decision.recoveryEvidenceNeeded).toBe(EVIDENCE_RECOVERY_THRESHOLD);
    expect(heldAdaptationKeys(state, { today: TODAY }).has('chickpeas (tins)')).toBe(true);
  });

  it('enough genuinely new evidence makes the key recovery-eligible (and un-held)', () => {
    const state = household({ householdLedger: [
      rejectionOn('2026-09-12'),
      wasteOn('2026-09-14', 'w1'),
      wasteOn('2026-09-15', 'w2'),
    ] });
    const decision = suppressionDecision(state, 'chickpeas (tins)', { today: TODAY });
    expect(decision.state).toBe('recovery-eligible');
    expect(decision.recoveryLatestDay).toBe('2026-09-15');
    expect(heldAdaptationKeys(state, { today: TODAY }).has('chickpeas (tins)')).toBe(false);
    // Recovery flips the key back to "earned" — and binned-again evidence is
    // exactly what the reduction was telling the truth about, so the next
    // regeneration re-earns it. That is reconsideration, not repetition:
    // it required genuinely new behaviour after the household's "no".
    const adapted = nextWeekList(state);
    expect(adapted.find((r) => r.name === 'Chickpeas (tins)').wasteNote).toContain('Binned 2× recently');
  });

  it('evidence before the rejection is not new evidence', () => {
    const state = household({ householdLedger: [
      wasteOn('2026-09-10', 'old1'),
      wasteOn('2026-09-11', 'old2'),
      rejectionOn('2026-09-12'),
    ] });
    expect(recoveryEvidenceFor(state, 'chickpeas (tins)', { today: TODAY }).events).toBe(0);
    expect(suppressionDecision(state, 'chickpeas (tins)', { today: TODAY }).state).toBe('rejected');
  });

  it('evidence resolves through the alias table — the same conversation, differently named', () => {
    const state = household({ householdLedger: [
      rejectionOn('2026-09-12'),
      wasteOn('2026-09-14', 'w1', 'chickpeas'),
      wasteOn('2026-09-15', 'w2', 'chickpeas'),
    ] });
    expect(suppressionDecision(state, 'chickpeas (tins)', { today: TODAY }).state).toBe('recovery-eligible');
  });

  it('an influence-suppressed key reports suppressed, then recovery-eligible — never silently clear', () => {
    const base = [
      rejectionOn('2026-09-01', 'r1'),
      rejectionOn('2026-09-03', 'r2'),
    ];
    expect(suppressedAdaptations(household({ householdLedger: base }), { today: TODAY }).has('chickpeas (tins)')).toBe(true);
    const withEvidence = household({ householdLedger: [...base, wasteOn('2026-09-14', 'w1'), wasteOn('2026-09-15', 'w2')] });
    const decision = suppressionDecision(withEvidence, 'chickpeas (tins)', { today: TODAY });
    expect(decision.state).toBe('recovery-eligible');
    expect(decision.rejectionCount).toBe(2);
  });

  it('the hold ends by its own clock, and only its clock', () => {
    const state = household({ householdLedger: [rejectionOn('2026-08-01')] });
    expect(suppressionDecision(state, 'chickpeas (tins)', { today: TODAY }).state).toBe('clear');
  });
});

describe('rejection counting: unique events, never days', () => {
  it('two same-day rejections are two events', () => {
    const state = household({
      householdLedger: [
        { ...rejection('chickpeas (tins)'), id: 'r1', at: '2026-09-16T09:00:00.000Z' },
        { ...rejection('chickpeas (tins)'), id: 'r2', at: '2026-09-16T15:00:00.000Z' },
      ],
    });
    const entry = adaptationRejections(state).get('chickpeas (tins)');
    expect(entry.rejectionCount).toBe(2);
    expect(entry.rejections).toEqual([TODAY]); // one day, two events
    expect(suppressedAdaptations(state, { today: TODAY }).has('chickpeas (tins)')).toBe(true);
  });

  it('the undo stamp dedupes against its own ledger event by id', () => {
    const state = household({
      householdLedger: [{ ...rejection('chickpeas (tins)'), id: 'fixed-id' }],
      adaptationSuppression: {
        'chickpeas (tins)': { events: [{ id: 'fixed-id', day: TODAY }], rejections: [TODAY] },
      },
    });
    const entry = adaptationRejections(state).get('chickpeas (tins)');
    expect(entry.rejectionCount).toBe(1); // ledger + stamp describe ONE rejection
  });

  it('legacy day-only stamps still count exactly once', () => {
    const state = household({
      adaptationSuppression: { 'chickpeas (tins)': { rejections: ['2026-09-15'] } },
    });
    const entry = adaptationRejections(state).get('chickpeas (tins)');
    expect(entry.rejectionCount).toBe(1);
    expect(suppressionDecision(state, 'chickpeas (tins)', { today: TODAY }).state).toBe('rejected');
  });

  it('two same-day legacy stamp days stay two events', () => {
    // A writer that recorded two rejections on one day as two different
    // days-with-times keeps both counts through the day-coverage fallback.
    const state = household({
      adaptationSuppression: { 'chickpeas (tins)': { rejections: ['2026-09-15', '2026-09-16'] } },
    });
    expect(adaptationRejections(state).get('chickpeas (tins)').rejectionCount).toBe(2);
  });
});
