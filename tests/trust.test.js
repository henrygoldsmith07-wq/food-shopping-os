import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { shoppingListForPlan } from '../src/lib/loop-learning.js';
import { reconcileListWithPlan } from '../src/lib/week-loop.js';
import { householdPortionsFor } from '../src/lib/portions.js';
import { collectAdaptations, adaptationPressure, suppressedAdaptationKeys } from '../src/lib/adaptations.js';
import {
  heldAdaptationKeys,
  suppressedAdaptations,
  adaptationRejections,
  suppressionDecision,
  recoveryEvidenceFor,
  EVIDENCE_RECOVERY_THRESHOLD,
  ADAPTATION_SUPPRESS_THRESHOLD,
  ADAPTATION_REJECTION_HOLD_DAYS,
} from '../src/lib/adaptation-suppression.js';
import {
  shoppingPrediction,
  attachPredictions,
  buildShopRecord,
  weekStamp,
  evaluablePredictions,
} from '../src/lib/shopping-predictions.js';
import { inferListTopUp } from '../src/lib/loop-inference.js';
import { learnMealDecisionProfile } from '../src/lib/meal-decision.js';
import { spendAccuracy, basketReconciliation, shoppingQuantityError, snapshotCosts } from '../src/lib/eval-metrics.js';
import { buildDomainCommands } from '../src/lib/store-commands.js';
import { captureMissedMeals } from '../src/lib/plan-outcome.js';

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

describe('adaptation suppression: "not for me" outlives regeneration', () => {
  it('adapts, then the rejection holds the reduction across regeneration', () => {
    const state = household();
    const adapted = nextWeekList(state);
    expect(adapted.find((r) => r.name === 'Chickpeas (tins)').qty).toBe('1');

    // THE regression: adapt → reject → regenerate → adaptation remains suppressed.
    const rejected = { ...state, householdLedger: [rejection('chickpeas')], adaptationSuppression: { chickpeas: { rejections: [TODAY] } } };
    const regenerated = nextWeekList(rejected);
    expect(regenerated.find((r) => r.name === 'Chickpeas (tins)').qty).toBe('2');
  });

  it('keeps the row untouched even when the household edited nothing (reconcile path)', () => {
    const state = household({
      householdLedger: [rejection('chickpeas')],
      plan: { '2026-09-16': { dinner: 'chickpea-curry' } },
      shoppingList: [
        { id: 's1', name: 'Chickpeas (tins)', qty: '2', checked: false, fromRecipe: 'Chickpea Curry', lastAutoQty: '2' },
        { id: 's2', name: 'Rice', qty: '300g', checked: false, fromRecipe: 'Chickpea Curry', lastAutoQty: '300g' },
      ],
    });
    const changes = reconcileListWithPlan(state, ['2026-09-16']);
    const row = (changes.shoppingList || state.shoppingList).find((r) => r.id === 's1');
    expect(row.qty).toBe('2'); // no fresh reduction applied over the rejection
  });

  it('one rejection holds for the holding period, then the evidence may apply again', () => {
    const state = household({ householdLedger: [rejection('chickpeas')] });
    expect([...heldAdaptationKeys(state, { today: TODAY })]).toContain('chickpeas');
    const later = { ...state, day: '2026-09-20' };
    expect([...heldAdaptationKeys(later, { today: '2026-09-20' })]).toContain('chickpeas');
    const expired = { ...state, day: `2026-09-${16 + ADAPTATION_REJECTION_HOLD_DAYS + 1}`.slice(0, 10) };
    const expiredDay = '2026-09-24'; // 8 days after the rejection
    void expired;
    expect([...heldAdaptationKeys({ ...state, day: expiredDay }, { today: expiredDay })]).not.toContain('chickpeas');
  });

  it('recovers only when the hold expires — not because the list regenerated', () => {
    const state = household({ householdLedger: [rejection('chickpeas')] });
    for (let i = 0; i < 5; i += 1) {
      expect(nextWeekList(state).find((r) => r.name === 'Chickpeas (tins)').qty).toBe('2');
    }
  });
});

describe('influence suppression: count + recency, never a decayed blur', () => {
  it('two rejections inside the window suppress influence; one does not', () => {
    const one = household({ householdLedger: [rejection('chickpeas', '2026-09-10')] });
    expect(suppressedAdaptations(one, { today: TODAY }).has('chickpeas')).toBe(false);
    const two = household({
      householdLedger: [rejection('chickpeas', '2026-09-10'), rejection('chickpeas', '2026-09-13')],
    });
    expect(suppressedAdaptations(two, { today: TODAY }).has('chickpeas')).toBe(true);
    expect(suppressedAdaptationKeys(two, { today: TODAY })).toContain('chickpeas');
    expect(ADAPTATION_SUPPRESS_THRESHOLD).toBe(2);
  });

  it('a rejection older than the window no longer counts toward suppression', () => {
    const old = household({
      householdLedger: [rejection('chickpeas', '2026-08-01'), rejection('chickpeas', '2026-08-02')],
    });
    expect(suppressedAdaptations(old, { today: TODAY }).has('chickpeas')).toBe(false);
  });

  it('adaptationPressure reports whole rejection days, not fractional weights', () => {
    const state = household({
      householdLedger: [rejection('chickpeas', '2026-09-10'), rejection('chickpeas', '2026-09-13')],
    });
    const pressure = adaptationPressure(state, { today: TODAY });
    expect(pressure.get('chickpeas').rejections).toEqual(['2026-09-10', '2026-09-13']);
  });

  it('reads the explicit suppression stamp even without the ledger', () => {
    const state = household({
      adaptationSuppression: { chickpeas: { rejections: ['2026-09-10', '2026-09-13'] } },
    });
    expect(adaptationRejections(state).get('chickpeas').rejections).toEqual(['2026-09-10', '2026-09-13']);
    expect(suppressedAdaptations(state, { today: TODAY }).has('chickpeas')).toBe(true);
  });

  it('a twice-undone adaptation is hidden from the adaptation card but the evidence stays', () => {
    const state = household({
      householdLedger: [rejection('chickpeas', '2026-09-10'), rejection('chickpeas', '2026-09-13')],
      shoppingList: [
        {
          id: 's1', name: 'Chickpeas (tins)', qty: '1', checked: false,
          fromRecipe: 'Chickpea Curry', autoReduction: {
            reason: 'binned', fromQty: '2', toQty: '1', applied: true, count: 2,
            lastBinnedAt: '2026-09-13',
          },
        },
      ],
    });
    const { adaptations, suppressed } = collectAdaptations(state, { today: TODAY });
    expect(adaptations.find((a) => a.key === 'chickpeas')).toBeUndefined();
    expect(suppressed.has('chickpeas')).toBe(true);
  });
});

describe('portions suppression', () => {
  it('an undone learned-appetite change leaves the configured portions in place', () => {
    const learned = {
      portions: 4,
      householdPreferences: { portions: { observations: 5, typical: 2 } },
      cooked: [],
      day: TODAY,
      portionsOverride: 'auto',
    };
    expect(householdPortionsFor(learned).portions).toBe(2);
    const rejected = {
      ...learned,
      householdLedger: [rejection('portions')],
      adaptationSuppression: { portions: { rejections: [TODAY] } },
    };
    expect(householdPortionsFor(rejected).portions).toBe(4);
  });
});

describe('list top-up: one authoritative Plan → Shopping calculation', () => {
  it('scales to the household portions, honours waste learning and suppression', () => {
    const state = household({
      plan: { '2026-09-16': { dinner: 'chickpea-curry' }, '2026-09-17': { dinner: 'chickpea-curry' } },
      shoppingList: [{ id: 's0', name: 'Rice', qty: '300g', checked: false, fromRecipe: 'Chickpea Curry' }],
    });
    const topUp = inferListTopUp(state, { today: TODAY });
    const chickpeas = topUp.find((r) => r.name === 'Chickpeas (tins)');
    // Household of 4, learned reduction applies (evidence: two binned tins).
    expect(chickpeas).toBeDefined();
    expect(chickpeas.qty).toBe('1');
    expect(chickpeas.wasteNote).toMatch(/binned 2× recently/i);

    // The same top-up with the adaptation rejected: no reduced quantity.
    const rejected = {
      ...state,
      householdLedger: [rejection('chickpeas')],
    };
    const heldTopUp = inferListTopUp(rejected, { today: TODAY });
    expect(heldTopUp.find((r) => r.name === 'Chickpeas (tins)').qty).toBe('2');
  });
});

describe('exact recommendation attribution', () => {
  const acceptance = (day, recommendationId, recipeId) => ledgerEvent('RecommendationAccepted', day, {
    recipeId,
    recommendationId,
    context: { source: 'tonight-card' },
  });
  const cook = (day, recipeId, recommendationId = null) => ledgerEvent('MealCooked', day, {
    recipeId,
    recommendationId,
    source: 'user-confirmed',
  });

  it('follows through only on the exact cook that answered the suggestion', () => {
    const state = household({
      householdLedger: [
        acceptance('2026-09-15', 'tonight-2026-09-15-chickpea-curry', 'chickpea-curry'),
        // An independent cook of the SAME dish the next day — not the cook
        // session the suggestion started.
        cook('2026-09-16', 'chickpea-curry', null),
      ],
    });
    const profile = learnMealDecisionProfile(state, { today: TODAY });
    expect(profile.followThroughRate).toBe(0);
    expect(profile.influence).toBe(0.5);
  });

  it('attributes follow-through when the cook carries the recommendation id', () => {
    const state = household({
      householdLedger: [
        acceptance('2026-09-15', 'tonight-2026-09-15-chickpea-curry', 'chickpea-curry'),
        cook('2026-09-15', 'chickpea-curry', 'tonight-2026-09-15-chickpea-curry'),
      ],
    });
    const profile = learnMealDecisionProfile(state, { today: TODAY });
    expect(profile.followThroughRate).toBe(1);
  });

  it('legacy acceptances without ids still fall back to recipe-and-time', () => {
    const state = household({
      householdLedger: [
        acceptance('2026-09-15', null, 'chickpea-curry'),
        cook('2026-09-16', 'chickpea-curry'),
      ],
    });
    const profile = learnMealDecisionProfile(state, { today: TODAY });
    expect(profile.followThroughRate).toBe(1);
  });
});

describe('spend accuracy: prediction snapshot vs recorded total', () => {
  it('snapshots the basket prediction from list rows', () => {
    expect(snapshotCosts([
      { name: 'Rice', price: 1.2 },
      { name: 'Chickpeas (tins)', price: 1.5 },
    ])).toBe(2.7);
  });

  it('scores predicted vs actual, with absolute error, bias and samples', () => {
    const state = household({
      shops: [
        { date: '2026-09-10', total: 12, predicted: 10, items: [{ name: 'A', price: 10 }] },
        { date: '2026-09-13', total: 9, predicted: 10, items: [{ name: 'B', price: 9 }] },
      ],
    });
    const result = spendAccuracy(state, { today: TODAY });
    expect(result.value).toBe(0.15); // mean of 20% under and 10% over
    expect(result.absoluteError).toBe(1.5);
    expect(result.bias).toBe(0.05); // + = under-predicts on average
    expect(result.samples).toBe(2);
  });

  it('excludes shops without a snapshot instead of reconstructing one', () => {
    const state = household({
      shops: [{ date: '2026-09-10', total: 12, items: [{ name: 'A', price: 11 }] }],
    });
    const result = spendAccuracy(state, { today: TODAY });
    expect(result.value).toBeNull();
  });

  it('keeps item-total reconciliation as a separate data-quality metric', () => {
    const state = household({
      shops: [{ date: '2026-09-10', total: 12, predicted: 12, items: [{ name: 'A', price: 10 }] }],
    });
    expect(spendAccuracy(state, { today: TODAY }).value).toBe(0);
    expect(basketReconciliation(state, { today: TODAY }).value).toBeCloseTo(0.17, 2);
  });
});

describe('shopping quantity error: one normalized measurement', () => {
  it('compares compatible quantities through the measurement engine', () => {
    const state = household({
      // The prediction frozen onto the shop record at purchase time — the
      // quantity the list actually showed — not a recipe reconstruction.
      shops: [{
        date: '2026-09-16', total: 5, predicted: 1.2,
        items: [{ id: 's1', name: 'Rice', price: 1.2, qty: '450g' }],
        predictions: [{ id: 's1', predictionKey: 'rice', name: 'Rice', qty: '300g', day: '2026-09-16' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.value).toBe(0.5); // bought 450g vs predicted 300g
    expect(result.assumption).toMatch(/prediction snapshots/i);
  });

  it('excludes incompatible quantities instead of inventing comparability', () => {
    const state = household({
      shops: [{
        date: '2026-09-16', total: 5, predicted: 1.5,
        items: [{ id: 's3', name: 'Chickpeas (tins)', price: 1.5, qty: '400g' }], // grams vs tins
        predictions: [{ id: 's3', predictionKey: 'chickpeas (tins)', name: 'Chickpeas (tins)', qty: '2', day: '2026-09-16' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.value).toBeNull();
    expect(result.evidence).toBe(0);
    expect(result.excluded.some((e) => e.reason === 'incompatible-dimensions')).toBe(true);
  });

  it('accepts density conversions the engine vouches for', () => {
    const state = household({
      shops: [{
        date: '2026-09-16', total: 5, predicted: 1,
        items: [{ id: 's2', name: 'Coconut milk', price: 1, qty: '1 tin' }],
        predictions: [{ id: 's2', predictionKey: 'coconut milk', name: 'Coconut milk', qty: '392g', day: '2026-09-16' }],
      }],
    });
    const result = shoppingQuantityError(state, { today: TODAY });
    expect(result.value).toBe(0); // 1 tin → 392 ml/g for coconut milk
  });
});

describe('provenance: user-confirmed | observed | inferred', () => {
  it('a one-tap loop closure records user-confirmed, never inferred', () => {
    let state = household({ plan: { '2026-09-15': { dinner: 'chickpea-curry' } } });
    const commands = buildDomainCommands((patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    });
    commands.resolveMealOutcome({ date: '2026-09-15', slot: 'dinner', recipeId: 'chickpea-curry', cooked: true });
    const event = state.householdLedger.find((e) => e.type === 'MealCooked');
    expect(event.source).toBe('user-confirmed');
    expect(event.inferred).toBeUndefined();
    const stamp = state.mealPlanEvents.at(-1);
    expect(stamp.source).toBe('user-confirmed');
  });

  it('the rollover miss-stamp is labelled inferred', () => {
    const state = household({ plan: { '2026-09-15': { dinner: 'chickpea-curry' } } });
    const stamped = captureMissedMeals(state);
    const stamp = stamped.mealPlanEvents.at(-1);
    expect(stamp.source).toBe('inferred');
  });

  it('a manual cook ride is user-confirmed', () => {
    let state = household({ plan: {} });
    const commands = buildDomainCommands((patch) => {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    });
    commands.cookPlannedMeal({ date: TODAY, slot: 'dinner', recipeId: 'chickpea-curry' });
    expect(state.householdLedger.find((e) => e.type === 'MealCooked').source).toBe('user-confirmed');
  });
});
