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

  // Two clearly-labelled receipt trips from the past week so budget, price
  // memory and restock surfaces have something honest to chew on. Marked
  // `imported` like CSV imports — they read as demonstration data everywhere
  // history is shown.
  const receipt = (offsetDays, store, items) => ({
    id: uid('dh'),
    date: addDays(day, offsetDays),
    store,
    total: Math.round(items.reduce((sum, item) => sum + item.price, 0) * 100) / 100,
    saved: 0,
    imported: true,
    items: items.map(({ name, emoji, price, qty }) => ({
      name, emoji, price, qty, priceSource: 'receipt', recordedAt: addDays(day, offsetDays),
    })),
  });
  const shops = [
    receipt(-5, 'Demo Market', [
      { name: 'Chicken thighs', emoji: '🍗', price: 4.5, qty: '600 g' },
      { name: 'Coconut milk', emoji: '🥫', price: 1.1, qty: '1 tin' },
      { name: 'Basmati rice', emoji: '🍚', price: 2.3, qty: '1 kg' },
      { name: 'Semi-skimmed milk', emoji: '🥛', price: 1.65, qty: '2 L' },
    ]),
    receipt(-2, 'Demo Grocer', [
      { name: 'Salmon fillet', emoji: '🐟', price: 5.4, qty: '2 fillets' },
      { name: 'Kidney beans', emoji: '🥫', price: 0.9, qty: '2 tins' },
      { name: 'Bell pepper', emoji: '🫑', price: 1.2, qty: '3' },
      { name: 'Sourdough loaf', emoji: '🍞', price: 2.1, qty: '1' },
    ]),
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
    // Demonstration receipt history, marked `imported` so every surface that
    // shows it labels it as example data — never mistaken for real trips
    shops,
    log: {},
    // Yesterday's dinner was cooked from the plan, so streaks/cook surfaces
    // have one honest-looking entry (recipe ids come from the real catalogue)
    cooked: byId(DEMO_DINNER_IDS[0]) ? [{ recipeId: DEMO_DINNER_IDS[0], date: addDays(day, -1) }] : [],
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
