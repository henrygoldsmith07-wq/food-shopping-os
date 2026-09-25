/**
 * SPEND EVIDENCE — GOLDEN PROOFS (task 11).
 *
 * Every scored spend sample must prove WHAT FORQ PREDICTED before shopping
 * and WHAT WAS ACTUALLY PAID — and the two sides must never come from the
 * same mutable list field. Every override-learning sample must prove WHICH
 * prediction changed, what the final choice was, which episode it belongs
 * to, and how recency weights it. Anything unprovable is EXCLUDED with a
 * named reason — never reconstructed, never guessed.
 *
 * These proofs drive REAL public actions (addToList → recordShop — the
 * same slices the store composes) wherever a flow exists; raw builders are
 * used only where the app has no flow yet (e.g. stamping an observed till
 * price onto a recorded shop), and those spots say so.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { spendAccuracy, overrideLearningProfile, applyOverrideLearning } from '../src/lib/eval-metrics.js';
import { basketPredictionEvent, PREDICTION_PROVENANCE } from '../src/lib/prediction-evidence.js';
import { quantityOverrideEvent } from '../src/lib/override-events.js';
import { linkReceiptRows, receiptOutcomeRecords, priceProvenanceFor, PRICE_PROVENANCE } from '../src/lib/price-evidence.js';
import { shoppingListMutations } from '../src/lib/shopping-list-mutations.js';
import { shoppingActions } from '../src/lib/shopping-actions.js';
import { buildShopRecord } from '../src/lib/shopping-predictions.js';

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

describe('spend evidence golden proofs', () => {
  it('1. a Forq-priced row predicted £2, the till observed £3 — scored £2→£3 through the real addToList→recordShop flow', () => {
    let state = household({});
    // FORQ'S PREDICTION: Rice at £2 comes from Forq's plan advice (a
    // recipe-derived row), and the £2 is FORQ'S OWN retailer price data —
    // stamped on the item so the 'manual' default never mislabels it.
    const app = driver(shoppingListMutations, state);
    app.run('addToList', { id: 'rice-1', name: 'Rice', qty: '300g', price: 2, fromRecipe: 'Chickpea Curry', priceSource: 'retailer' });
    state = app.state();
    // ...frozen as a genuine pre-till basket prediction (addToList freezes it).
    const freeze = state.basketPredictions.at(-1);
    expect(freeze.predicted).toBe(2);
    expect(freeze.rows[0].priceProvenance).toBe('retailer-price');

    // THE OBSERVED ACTUAL: the household checks the row out; recordShop
    // keeps the shown price as a PREDICTION echo with NO actual...
    const app2 = driver(shoppingActions, { ...state, shoppingList: state.shoppingList.map((r) => ({ ...r, checked: true })) });
    app2.run('recordShop', { store: 'Tesco', total: 3, toPantry: false });
    state = app2.state();
    const shop = state.shops[0];
    expect(shop.items[0].price).toBe(2); // prediction echo
    expect(shop.items[0].actualPrice).toBeNull(); // observed nothing yet
    expect(state.receiptOutcomes).toEqual([]); // honest empty — nothing observed
    // ...and the RECEIPT OBSERVATION step (till line seen on the paper
    // receipt) stamps the independent outcome; spend evaluation reads it.
    const observed = {
      ...shop,
      items: shop.items.map((i) => ({ ...i, actualPrice: 3, actualPriceSource: 'actual-receipt' })),
    };
    const result = spendAccuracy(household({ shops: [observed] }), { today: TODAY });
    expect(result.samples).toBe(1);
    const [obs] = result.observations;
    expect(obs.predictedSubtotal).toBe(2);
    expect(obs.actualSubtotal).toBe(3);
    expect(obs.actualPriceSources).toEqual(['actual-receipt']); // the independent side
    expect(obs.evaluatedRowIds).toEqual(['rice-1']);
    expect(obs.chronologyProof).toBe('precise');
    expect(result.percentageError).toBe(0.5);
  });

  it('2. no receipt price observed → no row-level sample, honestly excluded', () => {
    const freeze = basketPredictionEvent({
      rows: [{ id: 'a', name: 'A', price: 4, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    const shop = {
      id: 'h1', date: TODAY, total: 5,
      items: [{ id: 'a', name: 'A', price: 4 }], // echo price only — no actual
      spendPrediction: copiedFreeze(freeze),
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    expect(result.excluded.map((e) => e.reason)).toContain('missing-actual-row-price');
    // The whole-basket fallback cannot rescue it either: the £5 total is not
    // provably the itemised basket sum.
    expect(result.excluded.map((e) => e.reason)).not.toContain('whole-basket');
  });

  it('3. the whole-basket fallback fires only when the predicted basket provably covers the entire purchase', () => {
    // Provable: identical row sets, total == itemised sum, full coverage →
    // ONE whole-basket comparison is allowed.
    const freeze = basketPredictionEvent({
      rows: [{ id: 'a', name: 'A', price: 4, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    const provable = {
      id: 'h1', date: TODAY, total: 5,
      items: [{ id: 'a', name: 'A', price: 5 }],
      spendPrediction: copiedFreeze(freeze),
    };
    const ok = spendAccuracy(household({ shops: [provable] }), { today: TODAY });
    expect(ok.samples).toBe(1);
    expect(ok.observations[0].coverageMode).toBe('whole-basket');
    expect(ok.observations[0].evaluatedRowIds).toEqual([]); // no row actuals
    // Not provable: an extra receipt row breaks the identical-set proof.
    const notProvable = {
      id: 'h2', date: TODAY, total: 9,
      items: [{ id: 'a', name: 'A', price: 5 }, { id: 'x', name: 'Extra', price: 4 }],
      spendPrediction: copiedFreeze(freeze),
    };
    const no = spendAccuracy(household({ shops: [notProvable] }), { today: TODAY });
    expect(no.samples).toBe(0);
    expect(no.value).toBeNull();
  });

  it('4. a user-entered price is never claimed as a Forq price prediction', () => {
    const freeze = basketPredictionEvent({
      rows: [{ id: 'm', name: 'Soap', qty: '1', price: 3, provenance: 'user-manual' }],
      day: TODAY,
    });
    const shop = {
      id: 'h1', date: TODAY, total: 3,
      items: [{ id: 'm', name: 'Soap', price: 3, actualPrice: 3, actualPriceSource: 'actual-receipt' }],
      spendPrediction: copiedFreeze(freeze),
    };
    const result = spendAccuracy(household({ shops: [shop] }), { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded.map((e) => e.reason)).toContain('manual-price-basket');
  });

  it('5. addToList freezes provenance from the NEW book — a hand-priced row is user-priced in the same freeze', () => {
    const app = driver(shoppingListMutations, household({}));
    app.run('addToList', { id: 'h1', name: 'Soap', qty: '1', price: 3 });
    const state = app.state();
    const latest = state.basketPredictions.at(-1);
    expect(latest.rows[0].provenance).toBe('user-manual');
    expect(latest.rows[0].priceProvenance).toBe('user-manual-price');
    // The v1-style fallback can no longer mislabel it: no legacy flag rides.
    expect(latest.rows[0].priceProvenanceLegacy).toBe(false);
  });

  it('6. linkReceiptRows is conservative: row-id, then user-confirmed, then unambiguous canonical-exact', () => {
    const predictionRows = [
      { listItemId: 'r1', subjectKey: 'rice' },
      { listItemId: 'r2', subjectKey: 'quinoa' },
    ];
    const receiptRows = [
      { id: 'r1', name: 'Rice', price: 2 },                    // row-id
      { confirmedRowId: 'r2', name: 'Quinoa', price: 3 },      // user-confirmed
    ];
    const links = linkReceiptRows({ predictionRows, receiptRows });
    expect(links.get('r1').method).toBe('row-id');
    expect(links.get('r2').method).toBe('user-confirmed');
    // Ambiguous canonical match (two receipt rows for one subject) never
    // auto-links — no silent name match.
    const ambiguous = linkReceiptRows({
      predictionRows: [{ listItemId: 'p1', subjectKey: 'rice' }],
      receiptRows: [
        { id: 'x1', name: 'Rice', price: 2 },
        { id: 'x2', name: 'Rice', price: 2 },
      ],
    });
    expect(ambiguous.has('p1')).toBe(false);
  });

  it('7. receipt outcomes exist only for independently observed actuals — the echo price manufactures nothing', () => {
    const shop = {
      id: 'h1', store: 'Tesco', date: TODAY, total: 5,
      items: [
        { id: 'a', name: 'A', price: 2, actualPrice: 2, actualPriceSource: 'actual-receipt' },
        { id: 'b', name: 'B', price: 3 }, // echo only
      ],
    };
    const outcomes = receiptOutcomeRecords(shop);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      schemaVersion: 1, shopId: 'h1', rowId: 'a', subjectKey: null,
      actualPrice: 2, actualPriceSource: 'actual-receipt', confidence: 'high', store: 'Tesco',
    });
  });

  it('8. an override stays learnable after its row and snapshot are removed (v2 frozen evidence)', () => {
    let state = household({});
    const app = driver(shoppingListMutations, state);
    app.run('addToList', { id: 'row-e', name: 'Eggs', qty: '6', fromRecipe: 'Omelette', price: 1.5 });
    state = app.state();
    const snap = state.shoppingPredictions.find((p) => p.id === 'row-e');
    const app2 = driver(shoppingActions, state);
    app2.run('substituteListItem', 'row-e', { name: 'Egg whites', price: 2 });
    state = app2.state();
    // The original row is gone from the list AND its snapshot was replaced.
    expect(state.shoppingList.some((r) => r.name === 'Eggs')).toBe(false);
    // The override event (stamped BEFORE the removal) froze what was shown...
    const override = quantityOverrideEvent({
      predictionId: snap.id,
      subjectKey: snap.subjectKey || 'eggs',
      listItemId: 'row-e',
      originalQty: snap.qty,
      overrideQty: '4',
      dimension: snap.normalized?.dim || 'count',
      predictionProvenance: snap.provenance,
      predictionDay: snap.day,
      prediction: { originalQty: snap.qty, normalized: snap.normalized },
      day: TODAY,
    });
    // ...and still proves itself with the live book empty.
    const profile = overrideLearningProfile(household({ quantityOverrides: [override] }), { today: TODAY });
    expect(profile.samples).toBe(1);
    expect(profile.observations[0].evidenceChain).toBe('frozen-event');
  });

  it('9. four edits of one shown prediction = ONE episode; the final edit decides', () => {
    const events = [1000, 2000, 3000, 4000].map((at, i) => quantityOverrideEvent({
      predictionId: 'row-e', subjectKey: 'eggs', listItemId: 'row-e',
      originalQty: '6', overrideQty: i === 3 ? '3' : '5',
      dimension: 'count', predictionProvenance: 'forq-plan', day: TODAY, at, id: `q${i + 1}`,
    }));
    const profile = overrideLearningProfile(household({ quantityOverrides: events }), { today: TODAY });
    expect(profile.samples).toBe(4);
    const eggs = profile.bySubject[0];
    expect(eggs.episodeCount).toBe(1); // one prediction = one story
    expect(eggs.editCount).toBe(4);    // the wobble rides as metadata
    expect(eggs.strength).toBe('weak'); // one episode is never strong
    expect(eggs.episodes[0].editCount).toBe(4);
    expect(eggs.episodes[0].finalQty).toBe('3'); // where the advice settled
    expect(eggs.episodes[0].direction).toBe('decrease');
    // And only the settled value is obeyed — the wobble is not averaged in.
    const adjusted = applyOverrideLearning([{ id: 'x', name: 'Eggs', qty: '6', fromRecipe: 'Omelette' }], profile);
    expect(adjusted).toHaveLength(1); // weak → recorded, not applied
  });

  it('10. four episodes strengthen; strength scales with DISTINCT overridden predictions', () => {
    const predictions = ['row-e', 'row-e2', 'row-e3', 'row-e4'].map((id) => ({
      id, name: 'Eggs', qty: '6', subjectKey: 'eggs', provenance: 'forq-plan',
      day: TODAY, schemaVersion: 2, normalized: { amount: 6, dim: 'count', unit: 'count' },
    }));
    const events = predictions.map((p, i) => quantityOverrideEvent({
      predictionId: p.id, subjectKey: 'eggs', listItemId: p.id,
      originalQty: '6', overrideQty: '3', dimension: 'count', day: TODAY, id: `q${i + 1}`,
    }));
    const profile = overrideLearningProfile(household({ shoppingPredictions: predictions, quantityOverrides: events }), { today: TODAY });
    const eggs = profile.bySubject[0];
    expect(eggs.episodeCount).toBe(4);
    expect(eggs.strength).toBe('high');
    const adjusted = applyOverrideLearning([{ id: 'x', name: 'Eggs', qty: '6', fromRecipe: 'Omelette' }], profile);
    expect(adjusted[0].qty).toBe('3'); // full strength: 6 × (1 − 0.5)
  });

  it('11. recency: a 28-day-old edit weighs half; the decay is exposed, never hidden', () => {
    const mk = (id, predictionId, day) => quantityOverrideEvent({
      predictionId, subjectKey: 'eggs', listItemId: predictionId,
      originalQty: '6', overrideQty: '3', dimension: 'count',
      predictionProvenance: 'forq-plan', day, id,
    });
    // TWO episodes: one edited today (weight 1), one exactly a half-life ago
    // (weight 0.5) — the subject's applied evidence weighs 0.75.
    const profile = overrideLearningProfile(household({ quantityOverrides: [
      mk('q1', 'row-e', TODAY),
      mk('q2', 'row-e2', '2026-08-19'),
    ] }), { today: TODAY });
    expect(profile.effectiveSampleWeight).toBe(0.75); // (1 + 0.5) / 2
    expect(profile.bySubject[0].recencyWeight).toBe(0.75);
    expect(profile.oldestEvidenceDay).toBe('2026-08-19');
    expect(profile.newestEvidenceDay).toBe(TODAY);
    expect(profile.recencyAssumption).toMatch(/0\.5\^/);
  });

  it('12. recency scales what learning APPLIES: stale evidence moves the shown quantity less', () => {
    // Four episodes each, all settling at −50%, so the only difference is
    // recency: four fresh edits weigh 1, one stale edit drags the mean to
    // 0.875 — and the applied factor scales accordingly (no rounding
    // inversion: 6 → 3 fresh, 6 → 3.375 → 4 whole eggs stale).
    const mk = (id, predictionId, day) => quantityOverrideEvent({
      predictionId, subjectKey: 'eggs', listItemId: predictionId,
      originalQty: '6', overrideQty: '3', dimension: 'count',
      predictionProvenance: 'forq-plan', day, id,
    });
    const freshOnly = overrideLearningProfile(household({ quantityOverrides: [
      mk('q1', 'row-e', TODAY),
      mk('q2', 'row-e2', TODAY),
      mk('q3', 'row-e3', TODAY),
      mk('q4', 'row-e4', TODAY),
    ] }), { today: TODAY });
    const oneStale = overrideLearningProfile(household({ quantityOverrides: [
      mk('q1', 'row-e', TODAY),
      mk('q2', 'row-e2', TODAY),
      mk('q3', 'row-e3', TODAY),
      mk('q4', 'row-e4', '2026-08-19'),
    ] }), { today: TODAY });
    const items = [{ id: 'x', name: 'Eggs', qty: '6', fromRecipe: 'Omelette' }];
    const freshQty = applyOverrideLearning(items, freshOnly)[0].qty;
    const staleQty = applyOverrideLearning(items, oneStale)[0].qty;
    expect(freshOnly.bySubject[0].recencyWeight).toBe(1);
    expect(oneStale.bySubject[0].recencyWeight).toBe(0.875);
    expect(freshQty).toBe('3');   // full factor −0.5
    expect(staleQty).toBe('4');   // 6 × (1 − 0.5 × 0.875) = 3.375 → 4 whole eggs
    expect(Number(freshQty) < Number(staleQty)).toBe(true); // stale evidence moves it LESS
  });

  it('13. a substituted row\'s displayed price is stamped user-substitution — never claimed as Forq advice', () => {
    let state = household({});
    const app = driver(shoppingListMutations, state);
    app.run('addToList', { id: 'row-1', name: 'Rice', qty: '300g', price: 1, fromRecipe: 'Curry' });
    state = app.state();
    const app2 = driver(shoppingActions, state);
    app2.run('substituteListItem', 'row-1', { name: 'Quinoa', price: 3 });
    state = app2.state();
    const snap = state.shoppingPredictions.find((p) => p.id === 'row-1');
    expect(snap.provenance).toBe(PREDICTION_PROVENANCE.USER_SUBSTITUTION);
    const latest = state.basketPredictions.at(-1);
    expect(latest.rows[0].priceProvenance).toBe(PRICE_PROVENANCE.USER_SUBSTITUTION);
  });

  it('14. post-purchase repricing cannot rewrite the frozen historical evidence', () => {
    const freeze = basketPredictionEvent({
      rows: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4, provenance: 'forq' }],
      day: TODAY, at: 1000,
    });
    const snap = { id: 'row-1', name: 'Rice', qty: '300g', subjectKey: 'rice', provenance: 'forq-plan', day: TODAY, schemaVersion: 2, normalized: { amount: 300, dim: 'mass', unit: 'g' } };
    const base = household({
      shoppingList: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4, checked: false }],
      shoppingPredictions: [snap],
      basketPredictions: [freeze],
    });
    const record = buildShopRecord({
      state: base, items: [{ id: 'row-1', name: 'Rice', qty: '300g', price: 4 }], store: 'Tesco', total: 4, id: 'h1', day: TODAY,
    });
    const stamped = {
      ...record,
      items: record.items.map((i) => ({ ...i, actualPrice: 4, actualPriceSource: 'actual-receipt' })),
    };
    const before = spendAccuracy(household({ shops: [stamped] }), { today: TODAY });
    expect(before.samples).toBe(1);
    expect(before.observations[0].predictedSubtotal).toBe(4);
    // The household reprices the (already bought) row afterwards...
    const app = driver(shoppingListMutations, base);
    app.run('updateListItem', 'row-1', { price: 9 });
    const after = spendAccuracy({ ...app.state(), shops: [stamped] }, { today: TODAY });
    // ...but the historical record still reads its copied freeze, verbatim.
    expect(after.observations[0].predictedSubtotal).toBe(4);
    expect(after.value).toBe(before.value);
    expect(after.observations[0].basketPredictionId).toBe(freeze.id);
  });

  it('15. legacy v1 freeze rows still resolve deliberately — labelled legacy, never silently reinterpreted', () => {
    // A v1-era freeze row: positive price, no provenance stamp of any kind.
    const row = { listItemId: 'a', name: 'A', price: 5 };
    const resolved = priceProvenanceFor(row);
    expect(resolved).toEqual({ provenance: 'forq-price-estimate', legacy: true });
    // An explicit user price stays the household's, with no legacy flag.
    expect(priceProvenanceFor({ listItemId: 'b', name: 'B', price: 3, priceSource: 'manual' }))
      .toEqual({ provenance: 'user-manual-price', legacy: false });
    // And an unknown price is unknown — never a £0 forecast.
    expect(priceProvenanceFor({ listItemId: 'c', name: 'C', price: 0 }).provenance).toBe('unknown');
  });
});
