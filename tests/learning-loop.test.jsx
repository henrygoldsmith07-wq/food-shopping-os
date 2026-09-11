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

  it('a cook that differs from the plan is recorded as a substitution', () => {
    const store = makeStore({
      day: '2026-09-02',
      plan: { '2026-09-02': { dinner: 'some-other-recipe' } },
    });
    store.diary.completeRecipe(recipe, { leftovers: 2, actualMins: 50 });
    const event = store.state.householdLedger.filter((e) => e.type === 'MealCooked').at(-1);
    expect(event.substituted).toBe(true);
    expect(event.plannedRecipeId).toBe('some-other-recipe');
    expect(event.leftoverPortions).toBe(2);
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

  it('logs the acceptance and opens cooking when the pick is taken', () => {
    cleanup();
    render(<HomeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cook this tonight' }));
    expect(mockApp.respondToRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      accepted: true,
      recipeId: 'curry',
      context: expect.objectContaining({ source: 'tonight-card' }),
    }));
    expect(openRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'curry' }), { startCooking: true });
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
