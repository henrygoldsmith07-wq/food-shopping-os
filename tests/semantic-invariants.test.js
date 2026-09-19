/**
 * Semantic-correctness regressions: prediction identity, evidence quality,
 * substitution lineage, correction semantics and evaluation provenance.
 *
 * Every scored sample must prove: which prediction was shown, what it
 * referred to, when it was shown, what outcome occurred, and that both
 * sides represent the same measurable thing. Anything unprovable is
 * excluded, never guessed.
 */
import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import {
  validatePredictionSnapshotWithReason,
  SNAPSHOT_REJECTION_REASONS,
  snapshotSubjectKey,
  shoppingPrediction,
} from '../src/lib/shopping-predictions.js';
import { shoppingQuantityError, spendAccuracy } from '../src/lib/eval-metrics.js';
import {
  PREDICTION_CORRECTION_OPTIONS,
  predictionCorrectionEvent,
  predictionLearningProfile,
  normalizeCorrectionSemantics,
} from '../src/lib/prediction-feedback.js';
import {
  suppressionDecision,
  recoveryEvidenceFor,
} from '../src/lib/adaptation-suppression.js';
import { shoppingActions } from '../src/lib/shopping-actions.js';
import { buildDomainCommands } from '../src/lib/store-commands.js';
import { evaluationToday, gateRecordDay, signedAgeDays } from '../src/lib/evaluation-time.js';

const TODAY = '2026-09-19';
const NOON = 'T12:00:00.000Z';

const household = (over = {}) => ({
  ...EMPTY_STATE,
  onboarded: true,
  day: TODAY,
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

const correction = (over = {}) => ({
  id: `pc-${Math.random().toString(36).slice(2, 8)}`,
  type: 'prediction_correction',
  predictionType: 'shopping-qty',
  predictionKey: 'rice',
  predicted: 300,
  actual: 2,
  date: '2026-09-18',
  at: Date.now(),
  ...over,
});

const frozenShop = (over = {}) => ({
  id: 'h1',
  date: '2026-09-18',
  total: 3,
  items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
  predictions: [{ id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-18' }],
  ...over,
});

// ---------- 1. real correction evidence in suppression recovery ------------

describe('recovery reads the real predictionCorrections store', () => {
  // The rejection sits inside the hold window (TODAY − 6 days).
  const rejection = ledgerEvent('RecommendationRejected', '2026-09-13', {
    recommendationId: 'adaptation:rice',
    context: { kind: 'adaptation', key: 'rice', undo: 'waste-qty' },
  });

  it('a correction in state.predictionCorrections alone earns reconsideration', () => {
    // NO ledger copy — correctPrediction() writes to predictionCorrections,
    // and recovery must not require it to be mirrored into the ledger.
    const state = household({
      householdLedger: [rejection],
      predictionCorrections: [
        correction({ predictionKey: 'Rice', actual: 0, date: '2026-09-14' }),
        correction({ predictionKey: 'rice', actual: 2, date: '2026-09-15', id: 'pc-2' }),
      ],
    });
    const evidence = recoveryEvidenceFor(state, 'rice', { today: TODAY });
    expect(evidence.events).toBe(2);
    expect(evidence.kinds).toEqual({ 'quantity-correction': 2 });
    const decision = suppressionDecision(state, 'rice', { today: TODAY });
    expect(decision.state).toBe('recovery-eligible');
    expect(decision.recoveryStage).toBe('reconsideration-eligible');
    expect(decision.recoveryKinds).toEqual({ 'quantity-correction': 2 });
  });

  it('the same correction id in ledger and corrections store is counted once', () => {
    const shared = correction({ id: 'pc-shared', predictionKey: 'rice', date: '2026-09-14' });
    const state = household({
      householdLedger: [rejection, shared], // mirrored copy
      predictionCorrections: [shared],
    });
    expect(recoveryEvidenceFor(state, 'rice', { today: TODAY }).events).toBe(1);
  });

  it('corrections before the rejection, or in the future, are not evidence', () => {
    const state = household({
      householdLedger: [rejection],
      predictionCorrections: [
        correction({ date: '2026-09-12' }), // before the rejection
        correction({ date: '2026-10-01' }), // future
        correction({ id: 'pc-fresh', date: '2026-09-14' }), // fresh and attributable
      ],
    });
    expect(recoveryEvidenceFor(state, 'rice', { today: TODAY }).events).toBe(1);
  });

  it('a correction for a different ingredient is not attributable evidence', () => {
    const state = household({
      householdLedger: [rejection],
      predictionCorrections: [
        correction({ predictionKey: 'quinoa', id: 'pc-other', date: '2026-09-14' }),
        correction({ predictionKey: 'quinoa', id: 'pc-other2', date: '2026-09-15' }),
      ],
    });
    expect(recoveryEvidenceFor(state, 'rice', { today: TODAY }).events).toBe(0);
    expect(suppressionDecision(state, 'rice', { today: TODAY }).state).toBe('rejected');
  });

  it('corrections unlock recovery for the learned-portions subject too', () => {
    const portionRejection = ledgerEvent('RecommendationRejected', '2026-09-13', {
      recommendationId: 'adaptation:portions',
      context: { kind: 'adaptation', key: 'portions', undo: 'portions' },
    });
    const state = household({
      householdLedger: [portionRejection],
      predictionCorrections: [
        correction({ predictionType: 'portions', predictionKey: 'portions', predicted: 4, actual: 2, date: '2026-09-14' }),
        correction({ predictionType: 'portions', predictionKey: 'portions', predicted: 4, actual: 2, date: '2026-09-15', id: 'pc-p2' }),
      ],
    });
    const decision = suppressionDecision(state, 'portions', { today: TODAY });
    expect(decision.state).toBe('recovery-eligible');
    expect(decision.recoveryKinds).toEqual({ 'portion-correction': 2 });
  });
});

// ---------- 2. substitution lineage ---------------------------------------

describe('substitution lineage: a row id is not ingredient identity', () => {
  it('substituteListItem writes a fresh lineage-marked snapshot for the new ingredient', () => {
    const book = [
      shoppingPrediction({ itemId: 'row-1', name: 'Rice', qty: '300g', sourceRecipes: ['Curry'], day: TODAY }),
    ];
    let state = household({ shoppingPredictions: book, shoppingList: [
      { id: 'row-1', name: 'Rice', qty: '300g', checked: false },
    ] });
    const actions = shoppingActions((patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    });
    actions.substituteListItem('row-1', { name: 'Quinoa', price: 2 });

    // The row changed name and carries lineage…
    const row = state.shoppingList[0];
    expect(row.name).toBe('Quinoa');
    expect(row.substitutedFrom).toBe('Rice');
    // …the row id now holds a QUINOA snapshot, explicitly marked as a
    // substitution — the Rice record cannot ride the id…
    expect(state.shoppingPredictions.find((p) => p.predictionKey === 'rice')).toBeUndefined();
    const fresh = state.shoppingPredictions.find((p) => p.id === 'row-1');
    expect(fresh.predictionKey).toBe('quinoa');
    expect(fresh.qty).toBe('300g'); // the displayed quantity of the substituted row
    expect(fresh.substitutedFrom).toBe('Rice'); // explicit lineage
    expect(fresh.isSubstitution).toBe(true);
    // …and it does not borrow recipe provenance that never asked for quinoa.
    expect(fresh.sourceRecipes).toEqual([]);
  });

  it('a Rice prediction cannot score a Quinoa purchase — the row id alone is not identity', () => {
    const state = household({
      shops: [{
        id: 'h-sub',
        date: '2026-09-18',
        total: 2,
        // The row kept its id through the substitution; the frozen book
        // still carries the Rice advice on that id.
        items: [{ id: 'row-1', name: 'Quinoa', qty: '300g', price: 2 }],
        predictions: [{ id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-18' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.value).toBeNull();
    expect(result.excluded[0].reason).toBe('prediction-subject-mismatch');
    expect(result.excluded[0].predictedSubject).toBe('rice');
    expect(result.excluded[0].outcomeSubject).toBe('quinoa');
  });

  it('an explicitly lineage-marked substituted row is excluded from accuracy, not silently scored', () => {
    const state = household({
      shops: [{
        id: 'h-sub2',
        date: '2026-09-18',
        total: 2,
        items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
        predictions: [{
          id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-18',
          substitutedFrom: 'Quinoa', isSubstitution: true,
        }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded[0].reason).toBe('substituted-row-not-comparable');
    expect(result.excluded[0].substitutedFrom).toBe('Quinoa');
  });

  it('substitution validation runs at freeze time too — a lineage-marked snapshot is not frozen as-is', () => {
    // buildShopRecord validates through the central gate; a snapshot whose
    // subject cannot be proven is not frozen onto the shop record at all.
    const verdict = validatePredictionSnapshotWithReason(
      { id: 'x', predictionKey: 'rice', name: 'Rice', qty: '300g', day: TODAY },
      { aliasMemory: {} },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.snapshot.subjectKey).toBe('rice');
  });
});

// ---------- 3. "3+" is censored evidence -----------------------------------

describe('correction semantics: 3+ is a lower bound, never exactly 3', () => {
  it('the option table names its response types explicitly', () => {
    const plus = PREDICTION_CORRECTION_OPTIONS.find((o) => o.label === '3+');
    expect(plus.responseType).toBe('lower-bound');
    for (const o of PREDICTION_CORRECTION_OPTIONS.filter((o) => o.label !== '3+')) {
      expect(o.responseType).toBe('exact');
    }
  });

  it('new correction events store responseType, valueType and censored', () => {
    const exact = predictionCorrectionEvent({ predictionType: 'shopping-qty', predictionKey: 'rice', predicted: 2, actual: 2, date: TODAY });
    expect(exact.responseType).toBe('exact');
    expect(exact.valueType).toBe('exact-value');
    expect(exact.censored).toBe(false);
    const bounded = predictionCorrectionEvent({ predictionType: 'shopping-qty', predictionKey: 'rice', predicted: 2, actual: 3, date: TODAY });
    expect(bounded.responseType).toBe('lower-bound');
    expect(bounded.valueType).toBe('lower-bound');
    expect(bounded.censored).toBe(true);
  });

  it('legacy stored corrections are classified in place by the migration', () => {
    // A legacy row (no responseType): actual 3 was the "3+" button.
    const legacy = normalizeCorrectionSemantics({ id: 'pc-old', type: 'prediction_correction', predictionType: 'shopping-qty', predictionKey: 'rice', predicted: 2, actual: 3, date: TODAY });
    expect(legacy.responseType).toBe('lower-bound');
    expect(legacy.censored).toBe(true);
    // An explicit exact 3 (responseType: 'exact') stays exact.
    const explicit = normalizeCorrectionSemantics({ id: 'pc-new', type: 'prediction_correction', predictionType: 'shopping-qty', predictionKey: 'rice', predicted: 3, actual: 3, responseType: 'exact', date: TODAY });
    expect(explicit.responseType).toBe('exact');
    expect(explicit.censored).toBe(false);
  });

  it('a censored 3+ is excluded from accuracy with an explicit reason — never scored as actual === 3', () => {
    const state = household({
      predictionCorrections: [
        correction({ predicted: 2, actual: 3, date: '2026-09-18', id: 'pc-3plus' }), // "3+"
        correction({ predicted: 2, actual: 2, date: '2026-09-18', id: 'pc-exact' }), // exact 2
      ],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    // Only the exact answer is scored: |2−2|/2 = 0 — the 3+ row would have
    // contributed 0.5 if it were misread as "exactly 3".
    expect(result.samples).toBe(1);
    expect(result.explicitQuantityCorrectionAccuracy.value).toBe(0);
    expect(result.excluded.some((e) => e.reason === 'censored-correction-lower-bound' && e.outcomeId === 'pc-3plus')).toBe(true);
  });

  it('censored rows still teach learning without entering error averages', () => {
    const profile = predictionLearningProfile([
      correction({ predicted: 2, actual: 3, id: 'a' }), // 3+: too low
      correction({ predicted: 2, actual: 2, id: 'b' }), // exact
      correction({ predicted: 2, actual: 0, id: 'c' }), // exact
    ]);
    const row = profile.byType['shopping-qty'];
    expect(row.corrections).toBe(3);
    expect(row.exactSamples).toBe(2);
    expect(row.censoredLowerBounds).toBe(1);
    expect(row.meanAbsoluteError).toBe(1); // (0 + 2) / 2 — the 3+ contributed nothing
    expect(row.correctionScope).toBe('exact-only');
  });
});

// ---------- 4. separate correction feedback from purchase accuracy ---------

describe('purchase accuracy and explicit correction accuracy are separate metrics', () => {
  it('purchase accuracy answers only the till-run question; corrections never blend into it', () => {
    const state = household({
      shops: [frozenShop()], // |600−300|/300 = 1
      predictionCorrections: [correction({ predicted: 2, actual: 0, date: '2026-09-18', id: 'pc-1' })], // |0−2|/2 = 1
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.purchaseQuantityAccuracy.value).toBe(1);
    expect(result.purchaseQuantityAccuracy.samples).toBe(1);
    expect(result.explicitQuantityCorrectionAccuracy.value).toBe(1);
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(1);
    // The combined view is explicit about being the LEARNING signal…
    expect(result.combinedLearningSignal.value).toBe(1);
    expect(result.combinedLearningSignal.samples).toBe(2);
    // …and the top-level value is the combined learning view, labelled as such.
    expect(result.value).toBe(1);
    expect(result.observations).toHaveLength(2);
  });

  it('categorical (portions) corrections never enter quantity accuracy', () => {
    const state = household({
      predictionCorrections: [
        correction({ predictionType: 'portions', predictionKey: 'portions', predicted: 4, actual: 2, date: '2026-09-18', id: 'pc-p' }),
        correction({ predictionType: 'shopping-qty', predictionKey: 'rice', predicted: 2, actual: 1, date: '2026-09-18', id: 'pc-q' }),
      ],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.explicitQuantityCorrectionAccuracy.samples).toBe(1);
    expect(result.explicitQuantityCorrectionAccuracy.observations[0].outcomeId).toBe('pc-q');
  });

  it('correction feedback still influences learning (predictionLearningProfile)', () => {
    const profile = predictionLearningProfile([
      correction({ predictionKey: 'rice', predicted: 2, actual: 0 }),
      correction({ predictionKey: 'rice', predicted: 2, actual: 3 }),
    ]);
    expect(profile.corrections).toBe(2);
    expect(profile.byType['shopping-qty'].corrections).toBe(2);
  });
});

// ---------- 5+6+7. central validation, subject identity, provenance --------

describe('canonical validation, subject identity and provenance', () => {
  it('malformed frozen snapshots fail central validation with explicit reasons', () => {
    const cases = [
      [{ id: 'a', name: 'Rice', qty: '300g' }, SNAPSHOT_REJECTION_REASONS.NO_PROVENANCE],
      [{ name: 'Rice', qty: '300g', day: TODAY }, SNAPSHOT_REJECTION_REASONS.NO_ID],
      [{ id: 'b', qty: '300g', day: TODAY }, SNAPSHOT_REJECTION_REASONS.NO_SUBJECT],
      [{ id: 'c', name: 'Rice', qty: '', day: TODAY }, SNAPSHOT_REJECTION_REASONS.NO_QTY],
      [{ id: 'd', name: 'Mystery', qty: 'a few', day: TODAY }, SNAPSHOT_REJECTION_REASONS.NO_DIMENSION],
    ];
    for (const [snap, reason] of cases) {
      expect(validatePredictionSnapshotWithReason(snap)).toMatchObject({ ok: false, reason });
    }
  });

  it('subject identity resolves alias-aware and is frozen with the snapshot', () => {
    expect(snapshotSubjectKey({ predictionKey: 'Chickpeas (tins)' })).toBe('chickpeas');
    expect(snapshotSubjectKey({ name: 'Chickpeas (tins)' })).toBe('chickpeas');
    const validated = validatePredictionSnapshotWithReason(
      shoppingPrediction({ itemId: 'c1', name: 'Chickpeas (tins)', qty: '2', day: TODAY }),
    );
    expect(validated.snapshot.subjectKey).toBe('chickpeas');
  });

  it('a purchase whose frozen snapshot lacks provenance is excluded, not scored', () => {
    const state = household({
      shops: [{
        id: 'h-old',
        date: '2026-09-18',
        total: 3,
        items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
        // Pre-provenance freeze: no day, no at.
        predictions: [{ id: 'row-1', predictionKey: 'rice', name: 'Rice', qty: '300g' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(0);
    expect(result.excluded[0].reason).toBe('missing-prediction-provenance');
  });

  it('a snapshot whose subject differs from the outcome subject is excluded (alias-aware match)', () => {
    const state = household({
      shops: [{
        id: 'h-alias',
        date: '2026-09-18',
        total: 3,
        items: [{ id: 'row-1', name: 'chickpeas', qty: '3', price: 1.2 }],
        // Snapshot names the tins; outcome names the plain name — SAME
        // canonical subject, so this scores.
        predictions: [{ id: 'row-1', predictionKey: 'Chickpeas (tins)', name: 'Chickpeas (tins)', qty: '2', day: '2026-09-18' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.samples).toBe(1);
    expect(result.value).toBe(0.5); // |3−2|/2
  });
});

// ---------- 8. one evaluation-time policy ----------------------------------

describe('the shared evaluation-time policy', () => {
  it('a malformed today means no usable clock — dated records are excluded, not scored against the system date', () => {
    const state = household({ shops: [frozenShop()] });
    const result = shoppingQuantityError(state, { today: 'not-a-date' });
    expect(result.samples).toBe(0);
    expect(result.excluded[0].reason).toBe('invalid-evaluation-today');
    // Spend accuracy honours the same policy…
    const spend = spendAccuracy(state, { today: 'not-a-date' });
    expect(spend.samples).toBe(0);
    expect(spend.excluded[0].reason).toBe('invalid-evaluation-today');
    // …as does the gate helper itself.
    expect(gateRecordDay('2026-09-18', null)).toBe('no-evaluation-today');
    expect(evaluationToday({ today: 'not-a-date' })).toBeNull();
  });

  it('signed age, future and window gates agree across metrics', () => {
    expect(signedAgeDays('2026-09-18', TODAY)).toBe(1);
    expect(signedAgeDays('2026-09-20', TODAY)).toBe(-1);
    expect(gateRecordDay('2026-09-20', TODAY)).toBe('future');
    expect(gateRecordDay('2026-01-01', TODAY, { windowDays: 56 })).toBe('outside-window');
    expect(gateRecordDay('2026-09-18', TODAY, { windowDays: 56 })).toBe('ok');
    expect(gateRecordDay('garbage', TODAY)).toBe('malformed-day');
  });

  it('historical today works consistently across quantity and spend metrics', () => {
    const state = household({ shops: [frozenShop()] }); // 2026-09-18, predicted 2.4, total 3
    // Quantity: in-window from the later date…
    expect(shoppingQuantityError(state, { today: '2026-09-20' }).samples).toBe(1);
    // …future from the earlier one.
    expect(shoppingQuantityError(state, { today: '2026-09-17' }).excluded[0].reason).toBe('future-shop');
    // Spend: same record, same gate.
    const shop = { ...frozenShop(), predicted: 2.4 };
    const spendState = household({ shops: [shop] });
    expect(spendAccuracy(spendState, { today: '2026-09-20' }).samples).toBe(1);
    expect(spendAccuracy(spendState, { today: '2026-09-17' }).excluded[0].reason).toBe('future-shop');
  });
});

// ---------- purchase paths still share one lifecycle ------------------------

describe('purchase paths and lineage interplay', () => {
  it('purchaseIngredients freezes only schema-valid snapshots and dedupes replays', () => {
    const book = [
      shoppingPrediction({ itemId: 'row-1', name: 'Rice', qty: '300g', sourceRecipes: ['Curry'], day: TODAY }),
      { id: 'junk', name: 'Mystery', qty: 'a few', day: TODAY }, // fails the gate
    ];
    let state = household({ shoppingPredictions: book });
    const commands = buildDomainCommands((patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    });
    commands.purchaseIngredients({
      items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1',
    });
    expect(state.shops[0].predictions).toHaveLength(1); // only the valid snapshot froze
    commands.purchaseIngredients({
      items: [{ id: 'row-1', name: 'Rice', qty: '600g', price: 1.2 }],
      store: 'Tesco', total: 1.2, id: 'h1',
    });
    expect(state.shops).toHaveLength(1); // replay deduped
  });
});
