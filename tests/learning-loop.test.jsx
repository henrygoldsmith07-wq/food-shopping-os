import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HomeTab from '../src/components/HomeTab.jsx';
import { byId } from '../src/data/recipes.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { diaryActions } from '../src/lib/diary-actions.js';
import { planActions } from '../src/lib/plan-actions.js';
import { recommendationFunnel } from '../src/lib/eval-metrics.js';

/**
 * The learning loop, end to end: cooking, eating leftovers and responding
 * to suggestions all land in the household ledger, because that is where
 * the decision profile, the funnel and recovery read what happened.
 * The store tests drive the real actions with a minimal set wrapper — the
 * same functions the store composes — so "recorded" means what the app
 * records. The Home tests use a mock app, as the week recovery UI tests do.
 */

const makeStore = (overrides = {}) => {
  let current = {
    ...EMPTY_STATE,
    autoUsePantry: false,
    householdLedger: [],
    ...overrides,
  };
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(current) : patch;
    if (!next || typeof next !== 'object') return current;
    current = { ...current, ...next };
    return current;
  };
  return {
    get state() { return current; },
    diary: diaryActions(set),
    plan: planActions(set),
  };
};

describe('cooking writes the ledger', () => {
  const recipe = byId('chicken-traybake');

  it('completeRecipe appends one MealCooked event for an unplanned cook', () => {
    const store = makeStore({ day: '2026-09-02', plan: {} });
    store.diary.completeRecipe(recipe, { leftovers: 0, actualMins: 42 });
    const events = store.state.householdLedger.filter((e) => e.type === 'MealCooked');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      recipeId: 'chicken-traybake',
      date: '2026-09-02',
      plannedRecipeId: null,
      actualMins: 42,
      origin: 'user',
    });
    expect(events[0].substituted).toBeUndefined();
  });

  it('an off-plan cook never claims the first planned slot as a substitution', () => {
    // The invented attribution this pins: cooking something different used to
    // be recorded as replacing the day's first planned meal. A deliberate
    // swap is its own explicit flow (markMealPlanOutcome); an off-plan cook
    // links to nothing.
    const store = makeStore({
      day: '2026-09-02',
      plan: { '2026-09-02': { dinner: 'some-other-recipe', lunch: 'a-third-recipe' } },
    });
    store.diary.completeRecipe(recipe, { leftovers: 2, actualMins: 50 });
    const event = store.state.householdLedger.filter((e) => e.type === 'MealCooked').at(-1);
    expect(event.plannedRecipeId).toBeNull();
    expect(event.substituted).toBeUndefined();
    expect(event.recommendationId).toBeNull();
    // The planned slots stay pending — the plan was not cooked.
    expect(store.state.mealPlanEvents).toHaveLength(0);
  });

  it('cooking the exact planned dish links the slot without inventing a substitution', () => {
    const store = makeStore({
      day: '2026-09-02',
      plan: { '2026-09-02': { dinner: 'chicken-traybake' } },
    });
    store.diary.completeRecipe(recipe, { leftovers: 0, actualMins: 40 });
    const event = store.state.householdLedger.filter((e) => e.type === 'MealCooked').at(-1);
    expect(event.plannedRecipeId).toBe('chicken-traybake');
    expect(event.substituted).toBeUndefined();
    // The plan outcome is recorded as cooked, not substituted.
    expect(store.state.mealPlanEvents.at(-1).status).toBe('cooked');
  });

  it('a recommendation id rides the cook event so follow-through is exact', () => {
    const store = makeStore({ day: '2026-09-02', plan: {} });
    store.diary.completeRecipe(recipe, { leftovers: 0, actualMins: 30, recommendationId: 'tonight-2026-09-02-chicken-traybake' });
    const event = store.state.householdLedger.filter((e) => e.type === 'MealCooked').at(-1);
    expect(event.recommendationId).toBe('tonight-2026-09-02-chicken-traybake');
  });

  it('eating a saved portion records the meal it actually was', () => {
    const store = makeStore({
      day: '2026-09-02',
      pantry: [{ id: 'pl1', cat: 'Leftovers', name: 'Lemon chicken', recipeId: 'chicken-traybake', portions: 2, qty: '2 portions' }],
    });
    store.plan.useLeftover('pl1');
    const event = store.state.householdLedger.at(-1);
    expect(event.type).toBe('MealCooked');
    expect(event).toMatchObject({ leftover: true, leftoverId: 'pl1', recipeId: 'chicken-traybake', name: 'Lemon chicken' });
    // The pantry row is decremented as before.
    expect(store.state.pantry.find((p) => p.id === 'pl1').portions).toBe(1);
  });

  it('leftover consumption preserves hundreds of historical events', () => {
    // The regression this pins: useLeftover used to REPLACE the ledger with
    // its single event, erasing every event that came before it.
    const history = Array.from({ length: 300 }, (_, i) => ({
      id: `old-${i}`,
      type: 'MealPlanned',
      at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      day: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      origin: 'user',
      n: i,
    }));
    const store = makeStore({
      day: '2026-09-02',
      householdLedger: history,
      pantry: [{ id: 'pl1', cat: 'Leftovers', name: 'Soup', recipeId: 'soup', portions: 1, qty: '1 portion' }],
    });
    store.plan.useLeftover('pl1');
    const ledger = store.state.householdLedger;
    expect(ledger).toHaveLength(301);
    expect(ledger[0]).toMatchObject({ id: 'old-0', type: 'MealPlanned' });
    expect(ledger.at(-1).leftover).toBe(true);
  });

  it('explicit substitution keeps its attribution through markMealPlanOutcome', () => {
    const store = makeStore({
      day: '2026-09-02',
      plan: { '2026-09-02': { dinner: 'planned-recipe' } },
    });
    store.plan.markMealPlanOutcome({ date: '2026-09-02', slot: 'dinner', status: 'substituted', actualRecipeId: 'actual-recipe' });
    const event = store.state.householdLedger.filter((e) => e.type === 'MealCooked').at(-1);
    expect(event.substituted).toBe(true);
    expect(event.plannedRecipeId).toBe('planned-recipe');
    expect(event.recipeId).toBe('actual-recipe');
  });

  it('follow-through requires the exact decision id, not any later cook', () => {
    // Accepted pasta on Tuesday; an UNRELATED pasta cook on Wednesday must
    // not be mistaken for the recommendation being taken.
    const accepted = {
      id: 'a1', type: 'RecommendationAccepted', at: '2026-09-01T18:00:00.000Z',
      day: '2026-09-01', recipeId: 'pasta', recommendationId: 'tonight-2026-09-01-pasta',
    };
    const unrelatedCook = {
      id: 'c0', type: 'MealCooked', at: '2026-09-02T19:00:00.000Z',
      day: '2026-09-02', recipeId: 'pasta',
    };
    expect(recommendationFunnel({ householdLedger: [accepted, unrelatedCook] }, { today: '2026-09-03' }).actedOn).toBe(0);
    expect(recommendationFunnel({ householdLedger: [accepted, unrelatedCook] }, { today: '2026-09-03' }).open).toBe(1);
    // A cook carrying the decision id resolves it — that IS the dish.
    const resolved = {
      id: 'c1', type: 'MealCooked', at: '2026-09-01T20:00:00.000Z',
      day: '2026-09-01', recipeId: 'pasta', recommendationId: 'tonight-2026-09-01-pasta',
    };
    expect(recommendationFunnel({ householdLedger: [accepted, resolved] }, { today: '2026-09-03' }).actedOn).toBe(1);
    // Legacy acceptances (recorded before ids existed) keep the old heuristic.
    const legacy = { ...accepted, recommendationId: undefined };
    expect(recommendationFunnel({ householdLedger: [legacy, unrelatedCook] }, { today: '2026-09-03' }).actedOn).toBe(1);
  });

  it('a leftover meal does not fake recommendation follow-through', () => {
    const state = {
      householdLedger: [
        { id: 'a1', type: 'RecommendationAccepted', at: '2026-09-01T18:00:00.000Z', day: '2026-09-01', recipeId: 'pasta' },
        { id: 'c1', type: 'MealCooked', at: '2026-09-01T20:00:00.000Z', day: '2026-09-01', recipeId: 'curry', leftover: true, leftoverId: 'pl1' },
      ],
    };
    const funnel = recommendationFunnel(state, { today: '2026-09-02' });
    expect(funnel.actedOn).toBe(0);
    expect(funnel.open).toBe(1);
  });
});

const pickA = { recipe: { id: 'curry', name: 'Chickpea curry' }, score: 2.4, confidence: 'medium', reasons: ['50% already in your kitchen'], blocked: false };
const pickB = { recipe: { id: 'pasta', name: 'Tomato pasta' }, score: 1.9, confidence: 'low', reasons: ['20% already in your kitchen'], blocked: false };

const mockApp = vi.hoisted(() => ({}));
const openRecipe = vi.fn();

vi.mock('../src/lib/store.jsx', () => ({ useApp: () => mockApp }));
vi.mock('../src/components/GuidancePreview.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/AutopilotCard.jsx', () => ({ default: () => <section>next action</section> }));
vi.mock('../src/components/HomeFoodLoop.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/LoopCheck.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/HomeNumbers.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/OutcomeDashboard.jsx', () => ({ default: () => <div /> }));

describe('tonight card responses', () => {
  beforeEach(() => {
    Object.assign(mockApp, {
      day: '2026-09-01',
      plan: {},
      pantry: [],
      shoppingList: [],
      shops: [],
      cooked: [],
      waste: [],
      members: [],
      diets: [],
      prefs: { diets: [] },
      safeRecipes: [],
      tasteProfile: { rated: 0 },
      portions: 2,
      weeklyBudget: 60,
      spentThisWeek: 0,
      calendarBusy: [],
      tonightDecision: { pick: pickA, ranked: [pickA, pickB], confidence: 'medium', reasons: pickA.reasons },
      weekRecovery: null,
      closedLoop: { steps: [], pct: 0, next: 'plan' },
      useSoonIngredients: [],
      remindersDue: [],
      starterRecipeIds: [],
      welcomeDismissed: true,
      dismissWelcome: () => {},
      applyWeekRecovery: vi.fn(),
      undoLast: vi.fn(() => true),
      respondToRecommendation: vi.fn(),
    });
    openRecipe.mockClear();
  });

  const props = { openRecipe, openPantry: () => {}, openGuidance: () => {}, goTab: () => {}, goLog: () => {} };

  it('logs the acceptance, carries the decision id and opens cooking', () => {
    cleanup();
    render(<HomeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cook this tonight' }));
    expect(mockApp.respondToRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      accepted: true,
      recipeId: 'curry',
      context: expect.objectContaining({ source: 'tonight-card' }),
    }));
    // The SAME id goes to the cook session — the ledger event the cook
    // writes must be linkable to the acceptance event, exactly.
    expect(mockApp.respondToRecommendation.mock.calls[0][0].recommendationId)
      .toBe('tonight-2026-09-01-curry');
    expect(openRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'curry' }),
      { startCooking: true, recommendationId: 'tonight-2026-09-01-curry' },
    );
  });

  it('Not tonight logs the rejection and cycles to the next suggestion', () => {
    cleanup();
    render(<HomeTab {...props} />);
    expect(screen.getByText('Chickpea curry')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not tonight' }));
    expect(mockApp.respondToRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      accepted: false,
      recipeId: 'curry',
      context: expect.objectContaining({ reason: 'not-tonight' }),
    }));
    // The next ranked suggestion takes the card's place.
    expect(screen.getByText('Tomato pasta')).toBeTruthy();
  });
});
