/**
 * Temporary demonstration kitchen — never written to the real user store.
 *
 * Built from EMPTY_STATE with a coherent plan → pantry → shopping story so a
 * new user can see how the surfaces connect, then discard everything.
 */

import { EMPTY_STATE, todayStamp, uid } from '../lib/state.js';
import { weekDates, addDays } from '../lib/kitchen.js';
import { applyProductMode } from './productModes.js';
import { shoppingForPlan } from '../lib/mealplan.js';
import { byId } from './recipes.js';

export const DEMO_LABEL = 'Demonstration data';
export const DEMO_BANNER =
  'Example week — temporary demo kitchen. Nothing here is saved, and it never counts toward streaks, XP or analytics.';

/** Dinner ids used across the sample week (real recipe catalogue). */
export const DEMO_DINNER_IDS = [
  'chicken-traybake',
  'chickpea-curry',
  'salmon-teriyaki',
  'veg-chilli',
  'chicken-traybake',
  'chickpea-curry',
  'salmon-teriyaki',
];

export const DEMO_WALKTHROUGH = [
  {
    id: 'plan',
    title: 'Plan the week',
    blurb: 'Seven dinners are already on the calendar. Open Plan to change any slot.',
    tab: 'plan',
  },
  {
    id: 'list',
    title: 'Build the shopping list',
    blurb: 'Generate one list from the plan, minus what is already in the demo pantry.',
    action: 'generateList',
  },
  {
    id: 'shop',
    title: 'Shop the aisles',
    blurb: 'Tick items as you “buy” them. The list is grouped by aisle.',
    tab: 'shop',
    action: 'tickHalf',
  },
  {
    id: 'pantry',
    title: 'Update the pantry',
    blurb: 'Record the shop and put bought items into the demo pantry automatically.',
    action: 'recordShop',
  },
  {
    id: 'done',
    title: 'See the loop',
    blurb: 'Plan → list → shop → pantry. Exit anytime — your real kitchen is untouched.',
  },
];

/**
 * A full app state clone for the demo session.
 * Flagged with `isDemoSession` so UI and persistence can refuse to treat it as real.
 */
export const createExampleWeekState = (day = todayStamp()) => {
  const dates = weekDates(day);
  const plan = Object.fromEntries(
    dates.map((date, i) => [date, { dinner: DEMO_DINNER_IDS[i % DEMO_DINNER_IDS.length] }]),
  );

  // Pantry already holds staples so the list is reduced (shows the connection).
  const pantry = [
    { id: uid('dp'), name: 'Olive oil', emoji: '🫒', cat: 'Cupboard', location: 'Cupboard', qty: '1 bottle', cost: 0, store: '', expiry: null, low: false },
    { id: uid('dp'), name: 'Rice', emoji: '🍚', cat: 'Cupboard', location: 'Cupboard', qty: '1 kg', cost: 0, store: '', expiry: null, low: false },
    { id: uid('dp'), name: 'Garlic', emoji: '🧄', cat: 'Fresh', location: 'Cupboard', qty: '1 bulb', cost: 0, store: '', expiry: addDays(day, 10), low: false },
    { id: uid('dp'), name: 'Onion', emoji: '🧅', cat: 'Fresh', location: 'Cupboard', qty: '3', cost: 0, store: '', expiry: addDays(day, 7), low: false },
  ];

  const mode = applyProductMode('meal_planning', {});
  const listPreview = shoppingForPlan(plan, dates, { pantry });

  return {
    ...EMPTY_STATE,
    ...mode,
    isDemoSession: true,
    onboarded: true,
    usefulSetupPending: false,
    name: 'Example kitchen',
    household: 2,
    day,
    goal: 'maintain',
    diets: [],
    plan,
    pantry,
    // Pre-seed an empty list; walkthrough generates it so the hand-off is visible
    shoppingList: [],
    // Explicitly empty history — no fake shops, logs, XP or badges
    shops: [],
    log: {},
    cooked: [],
    waste: [],
    measurements: [],
    workouts: [],
    reminders: [],
    myRecipes: [],
    favourites: DEMO_DINNER_IDS.slice(0, 3).filter((id) => byId(id)),
    weeklyBudget: 75,
    welcomeDismissed: true,
    // Walkthrough progress is UI-only; seed a hint for the first step
    demoMeta: {
      label: DEMO_LABEL,
      listWouldContain: listPreview.length,
      startedAt: Date.now(),
    },
  };
};

export const isDemoState = (state) => Boolean(state?.isDemoSession);
