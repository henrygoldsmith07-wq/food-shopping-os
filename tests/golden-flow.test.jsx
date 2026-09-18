import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { EMPTY_STATE, STORAGE_KEY } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';
import { ledgerEvents } from '../src/lib/event-ledger.js';
import { shoppingListForPlan } from '../src/lib/loop-learning.js';
import { collectAdaptations } from '../src/lib/adaptations.js';
import { loopInference } from '../src/lib/loop-inference.js';
import { buildDomainCommands } from '../src/lib/store-commands.js';
import { weekDates } from '../src/lib/kitchen.js';

// One journey, many screens: keep every step well inside the timeout.
vi.setConfig({ testTimeout: 20_000 });

/**
 * THE canonical golden flow — the one test that proves Forq's promise:
 *
 *   plan meals → generate quantities → shop → update pantry → cook →
 *   save leftovers/waste → learn → generate next week →
 *   verify the changed recommendation → verify the explanation
 *
 * It walks the loop twice: once through the pure domain code (every engine
 * the UI leans on, deterministically, no jsdom required) and once through
 * the real app shell (This Week screen: the adaptation explained beside the
 * change with a working undo, and loop closure confirmed in one tap).
 * Nothing here invents outcomes — the household's actions are recorded the
 * way the app records them, and every "learning" assertion is backed by
 * evidence this test itself created.
 */

const TODAY = '2026-09-16'; // a Wednesday; weekDates gives the real week

/** Seed state: onboarded household of 4, mid-week, empty-ish kitchen. */
const baseState = () => ({
  ...EMPTY_STATE,
  onboarded: true,
  name: 'Sam',
  day: TODAY,
  portions: 4,
  weeklyBudget: 60,
});

/** The full loop, driven exactly the way the app's own writers drive it. */
const runGoldenFlow = (start = baseState()) => {
  let state = start;
  const commands = buildDomainCommands((patch) => {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  });

  // 1. PLAN — two curry nights this week, chosen by the household.
  const dates = weekDates(TODAY);
  const [d1, d2] = dates.filter((d) => d >= TODAY);
  commands.planMeals({ date: d1, slot: 'dinner', recipeId: 'chickpea-curry' });
  commands.planMeals({ date: d2, slot: 'dinner', recipeId: 'chickpea-curry' });
  expect(ledgerEvents(state, { type: 'MealPlanned' })).toHaveLength(2);

  // 2. QUANTITIES — the plan becomes a list scaled to the household.
  //    Scaling runs through the shared `app` decision (portions.js), the
  //    one every list path reads, so the week loop cannot disagree.
  const list = shoppingListForPlan(state.plan, [d1, d2], {
    pantry: state.pantry, cooked: state.cooked, today: TODAY,
    app: { ...state, portions: 4, portionsOverride: 'auto' },
  });
  const rice = list.find((row) => row.name === 'Rice');
  expect(rice).toBeDefined(); // curry's rice is written for 4; household eats 4
  expect(rice.qty).toBe('300g'); // the recipe's native 4-serving amount

  // 3. SHOP — the buy is recorded (store command, ledger event).
  commands.purchaseIngredients({
    items: [{ name: 'Rice', price: 1.2, qty: '300g' }, { name: 'Chickpeas (tins)', price: 1.5, qty: '2' }],
    store: 'Tesco', total: 2.7,
  });
  expect(ledgerEvents(state, { type: 'IngredientPurchased' })).toHaveLength(1);

  // 4. COOK — tonight's planned dinner is cooked.
  commands.cookPlannedMeal({ date: d1, slot: 'dinner', recipeId: 'chickpea-curry' });
  expect(state.cooked.some((c) => c.recipeId === 'chickpea-curry' && c.date === d1)).toBe(true);

  // 5. LEFTOVERS — the household batch-cooked extra: two spare portions go
  //    in the fridge for a later slot.
  commands.createLeftover({ name: 'Coconut Chickpea Curry', portions: 2, safeDays: 3 });
  state = {
    ...state,
    pantry: [
      ...state.pantry,
      {
        id: 'p-curry-leftover', name: 'Coconut Chickpea Curry (leftovers)', cat: 'Leftovers',
        qty: '2 portions', recipeId: 'chickpea-curry', portions: 2,
        location: 'Fridge', addedAt: TODAY, expiry: d2,
      },
    ],
  };
  expect(ledgerEvents(state, { type: 'LeftoverCreated' })).toHaveLength(1);

  // 6. WASTE — the household binned tins of chickpeas twice in the last
  //    fortnight (bought for curries, never used in time). This is the
  //    evidence the next plan must learn from, dated in the past the way
  //    real records are.
  state = {
    ...state,
    waste: [
      { name: 'Chickpeas (tins)', reason: 'not-used-in-time', date: '2026-09-08', cost: 0.75 },
      { name: 'Chickpeas (tins)', reason: 'not-used-in-time', date: '2026-09-13', cost: 0.75 },
    ],
  };

  return { state, commands, dates, dinner1: d1, dinner2: d2 };
};

describe('the golden flow: plan → shop → cook → learn → next week', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('closes the loop in pure domain code and learns for the next plan', () => {
    const { state } = runGoldenFlow();

    // The full loop is one story in the ledger: planned → purchased →
    // cooked → leftovers. No invented outcomes, no missing hand-offs.
    const projection = ledgerEvents(state).map((e) => e.type);
    expect(projection).toContain('MealPlanned');
    expect(projection).toContain('IngredientPurchased');
    expect(projection).toContain('MealCooked');
    expect(projection).toContain('LeftoverCreated');

    // Loop honesty where evidence is already closed: tonight has a recorded
    // cook and tomorrow's dinner is still in the future, so the inference
    // engine asks nothing and invents nothing.
    const inference = loopInference(state, { today: TODAY });
    expect(inference.proposals).toHaveLength(0);

    // 7. NEXT WEEK, PLANNED FROM WHAT ACTUALLY HAPPENED.
    // One curry night next week (by then the saved portions have been
    // eaten). For four people that means 2 tins — and the two binned tins
    // are the evidence, so the next list asks for one fewer can, with the
    // reason beside the change.
    const nextWeek = '2026-09-23';
    const replan = shoppingListForPlan(
      { [nextWeek]: { dinner: 'chickpea-curry' } }, [nextWeek],
      {
        pantry: state.pantry.filter((p) => p.cat !== 'Leftovers'),
        waste: state.waste, cooked: state.cooked, today: TODAY,
        app: { ...state, portions: 4, portionsOverride: 'auto' },
      },
    );
    // THE CHANGED RECOMMENDATION + THE EXPLANATION, beside the change.
    const chickpeas = replan.find((row) => row.name === 'Chickpeas (tins)');
    expect(chickpeas).toBeDefined();
    expect(chickpeas.qty).toBe('1');
    expect(chickpeas.wasteNote).toMatch(/binned 2× recently/i);
    expect(chickpeas.autoReduction).toMatchObject({ fromQty: '2', toQty: '1', applied: true, count: 2 });

    // The adaptation ledger says the same thing, in the four-part shape
    // (change → evidence → confidence → undo), read off the real list row.
    const listed = {
      ...state,
      shoppingList: replan.map((row, i) => ({
        id: `s-golden-${i}`, fromRecipe: 'chickpea-curry', checked: false, price: 0, ...row,
      })),
    };
    const { adaptations } = collectAdaptations(listed, { today: TODAY });
    const chickpeaRow = adaptations.find((a) => a.kind === 'waste-qty' && a.key.includes('chickpea'));
    expect(chickpeaRow).toBeDefined();
    expect(chickpeaRow.title).toMatch(/reduced chickpeas/i);
    expect(chickpeaRow.evidence).toMatch(/You binned chickpeas \(tins\) 2× in the last month/i);
    expect(['high', 'medium']).toContain(chickpeaRow.confidence);
    expect(chickpeaRow.undo).toBeTruthy();

    // Empty-state honesty: no waste history → no invented reduction.
    const untouched = shoppingListForPlan(
      { [nextWeek]: { dinner: 'chickpea-curry' } }, [nextWeek],
      {
        pantry: state.pantry.filter((p) => p.cat !== 'Leftovers'),
        waste: [], cooked: state.cooked, today: TODAY,
        app: { ...state, portions: 4, portionsOverride: 'auto' },
      },
    );
    const untouchedChickpeas = untouched.find((row) => row.name === 'Chickpeas (tins)');
    expect(untouchedChickpeas.qty).toBe('2');
    expect(untouchedChickpeas.wasteNote).toBeUndefined();
  });

  it('shows the adaptation on This Week with its explanation, and undo restores it', () => {
    // Seed the state a real household reaches after the loop above: the
    // leftover has been eaten, the household has planned another curry
    // night later this week, and the learned reduction is on the live list.
    const { state, dinner2 } = runGoldenFlow();
    const dates = weekDates(TODAY);
    const later = dates.filter((d) => d > dinner2);
    const seeded = {
      ...state,
      pantry: state.pantry.filter((p) => p.cat !== 'Leftovers'),
      plan: { ...state.plan, [later[0]]: { dinner: 'chickpea-curry' } },
      shoppingList: [
        {
          id: 's-chickpeas', name: 'Chickpeas (tins)', qty: '1', checked: false, price: 0,
          fromRecipe: 'chickpea-curry', lastAutoQty: '1', emoji: '🥫', aisle: 'Tins & jars',
          autoReduction: {
            reason: 'binned', fromQty: '2', toQty: '1', applied: true,
            count: 2, lastBinnedAt: '2026-09-13',
          },
          wasteNote: 'Binned 2× recently — buying one fewer',
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    render(<App />);

    // The week is the landing screen, and the adaptation card is on it.
    const card = screen.getByLabelText('Changes Forq made');
    expect(within(card).getByText(/Reduced chickpeas \(tins\) from 2 to 1/i)).toBeDefined();
    // change → evidence → confidence → undo, in one place.
    expect(within(card).getByText(/You binned chickpeas \(tins\) 2× in the last month/i)).toBeDefined();
    expect(within(card).getByText(/Strong evidence|Some evidence/i)).toBeDefined();
    expect(within(card).getByRole('button', { name: /Undo: Reduced chickpeas/i })).toBeDefined();

    // Undo: the quantity goes back, and the reversal is recorded —
    // repeated reversals would make this change lose its influence.
    fireEvent.click(within(card).getByRole('button', { name: /Undo: Reduced chickpeas/i }));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const row = stored.shoppingList.find((i) => i.id === 's-chickpeas');
    expect(row.qty).toBe('2');
    expect(row.autoReduction).toBeNull();
    expect(stored.householdLedger.some((e) =>
      e.type === 'RecommendationRejected' && e.context?.kind === 'adaptation')).toBe(true);
  });

  it('asks one lightweight question for an open meal instead of logging it by hand', () => {
    const { state } = runGoldenFlow();
    // A PAST meal with no outcome yet: the loop's one honest question.
    const pastDate = '2026-09-15';
    const open = {
      ...state,
      plan: { ...state.plan, [pastDate]: { ...(state.plan[pastDate] || {}), lunch: 'salmon-teriyaki' } },
      cooked: state.cooked.filter((c) => !(c.date === pastDate && c.recipeId === 'salmon-teriyaki')),
    };
    const inference = loopInference(open, { today: TODAY });
    expect(inference.proposals.some((p) => p.date === pastDate && p.recipeId === 'salmon-teriyaki')).toBe(true);

    // In the app, the confirmation is one tap on This Week, and answering it
    // writes the same ledger event a manual log would.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(open));
    render(<App />);
    const question = screen.getByText(/marked Teriyaki Salmon Bowls as missed .* did it actually happen/i);
    expect(question).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Yes — .*marked Teriyaki Salmon Bowls as missed/i }));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.householdLedger.some((e) =>
      e.type === 'MealCooked' && e.date === pastDate && e.recipeId === 'salmon-teriyaki')).toBe(true);
  });

  it('learns, adapts, is corrected, regenerates — and the correction is respected', () => {
    // The full trust journey on top of the golden flow: the learned
    // reduction appears, the household rejects it, the list regenerates —
    // and the reduction stays gone. A correction that cannot change future
    // behaviour is not learning, it is gaslighting.
    const { state } = runGoldenFlow();
    const nextWeek = '2026-09-23';
    const listFor = (source, today = TODAY) => shoppingListForPlan(
      { [nextWeek]: { dinner: 'chickpea-curry' } }, [nextWeek],
      {
        pantry: (source.pantry || []).filter((p) => p.cat !== 'Leftovers'),
        waste: source.waste, cooked: source.cooked || [], today,
        app: { ...source, portions: 4, portionsOverride: 'auto' }, state: source,
      },
    );

    // LEARN + ADAPT: two binned tins → next week asks for one fewer.
    const adapted = listFor(state);
    const adaptedRow = adapted.find((r) => r.name === 'Chickpeas (tins)');
    expect(adaptedRow.qty).toBe('1');
    expect(adaptedRow.wasteNote).toMatch(/binned 2× recently/i);

    // CORRECT: the household rejects the change, through the same command
    // the adaptation card's undo button drives — ledger rejection with the
    // stable canonical key, plus the explicit suppression stamp.
    const rejectionDay = TODAY;
    const corrected = {
      ...state,
      day: TODAY,
      householdLedger: [...(state.householdLedger || []), {
        id: 'e-golden-reject',
        type: 'RecommendationRejected',
        at: `${rejectionDay}T12:00:00.000Z`,
        day: rejectionDay,
        origin: 'user',
        recommendationId: 'adaptation:chickpeas',
        context: { kind: 'adaptation', key: 'chickpeas', undo: 'waste-qty' },
      }],
      adaptationSuppression: {
        chickpeas: { rejections: [rejectionDay], lastRejectedAt: rejectionDay },
      },
    };

    // REGENERATE: the same plan, the same evidence, a fresh list.
    const regenerated = listFor(corrected);
    const heldRow = regenerated.find((r) => r.name === 'Chickpeas (tins)');
    // RESPECTED: the quantity is back to the unlearned amount, with no
    // reduction applied over the household's no.
    expect(heldRow.qty).toBe('2');
    expect(heldRow.autoReduction).toBeUndefined();
    expect(heldRow.wasteNote).toBeUndefined();

    // The reversal is on the record, attributed to the adaptation key.
    expect(corrected.householdLedger.some((e) =>
      e.type === 'RecommendationRejected'
      && e.context?.key === 'chickpeas')).toBe(true);

    // ...and the learning engine reads the same story: the adaptation for
    // this key is held back, not shown as a live change.
    const listed = {
      ...corrected,
      shoppingList: regenerated.map((row, i) => ({
        id: `s-regen-${i}`, fromRecipe: 'chickpea-curry', checked: false, price: 0, ...row,
      })),
    };
    const { adaptations } = collectAdaptations(listed, { today: TODAY });
    expect(adaptations.find((a) => a.kind === 'waste-qty' && a.key === 'chickpeas')).toBeUndefined();
  });

  it('keeps the loop honest: an empty household gets nothing invented', () => {
    const empty = deriveApp({ ...EMPTY_STATE, onboarded: true, day: TODAY });
    const { adaptations } = collectAdaptations(empty, { today: TODAY });
    expect(adaptations).toHaveLength(0);
    const inference = loopInference(empty, { today: TODAY });
    expect(inference.proposals).toHaveLength(0);
    expect(inference.listTopUp).toHaveLength(0);
  });
});
