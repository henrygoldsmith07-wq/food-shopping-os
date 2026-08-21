/**
 * The shape of the app's state, and the pure helpers that read or roll it over.
 *
 * Kept apart from the provider in `store.jsx` so that what a Forq install *is*
 * — an empty kitchen with nothing pretended — can be read, and tested, without
 * mounting React.
 */

import { CATALOGUE } from '../data/foods.js';
import { DEFAULT_TARGETS } from '../data/nutrients.js';
import { dayStamp, levelFrom } from './kitchen.js';
import { searchFoods } from './foodlog.js';

export const STORAGE_KEY = 'forq-state-v2';
export const STATE_VERSION = 4;

/* ---------- Pure helpers (exported for tests) ---------- */
export const XP_PER_LEVEL = 160;
export const levelFromXp = (xp) => levelFrom(xp, XP_PER_LEVEL);
export const xpIntoLevel = (xp) => Math.max(0, xp) % XP_PER_LEVEL;

export const todayStamp = dayStamp;

/**
 * New calendar day → zero the trackers that only mean anything today. The
 * diary, pantry, list and history are all keyed by date, so they carry over
 * untouched and a new day simply starts empty.
 */
export const rolloverDay = (state, today = todayStamp()) =>
  state.day === today ? state : { ...state, day: today, water: 0, waterExtraMl: 0 };

/** A logged entry, re-read as a catalogue food (recents survive edits). */
export const foodFromEntry = (e) => ({
  id: e.foodId,
  name: e.name,
  brand: e.brand,
  emoji: e.emoji,
  unit: e.unit || 'g',
  per100: e.per100,
  source: 'recent',
  tags: [],
  servings: [{ label: e.servingLabel || `${e.grams} ${e.unit || 'g'}`, grams: e.grams }],
});

/** Most recently logged foods, newest first, one row per food. */
export const recentFoodsFrom = (log = {}, catalogue = CATALOGUE, limit = 24) => {
  const days = Object.keys(log).sort().reverse();
  const seen = new Map();
  for (const day of days) {
    for (const e of [...(log[day] || [])].reverse()) {
      if (!e.foodId || seen.has(e.foodId)) continue;
      const food = catalogue.find((f) => f.id === e.foodId) || (e.per100 ? foodFromEntry(e) : null);
      if (food) seen.set(e.foodId, food);
      if (seen.size >= limit) return [...seen.values()];
    }
  }
  return [...seen.values()];
};

export const ACCENT_IDS = ['mono', 'forest', 'ocean', 'wine', 'honey', 'sage', 'clay', 'ink'];

export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** An emoji for a typed-in item, borrowed from the food catalogue when it matches. */
export const emojiFor = (name) => searchFoods(name, CATALOGUE, 1)[0]?.emoji || '🍽️';

/**
 * A brand new kitchen: nothing pre-filled, nothing pretended. Every number in
 * the app grows from what the user logs, buys, cooks and plans.
 */
export const EMPTY_STATE = {
  schemaVersion: STATE_VERSION,
  onboarded: false,
  /** meal_planning · shopping_budget · nutrition · household · everything */
  productMode: 'meal_planning',
  entryGoal: 'plan', // plan · shop · pantry — derived from product mode
  /** AdvancedPanel views shown initially; null = use mode default */
  advancedToolsVisible: null,
  /**
   * Progressive disclosure: optional tool ids the user has added.
   * Empty = core loop only (plan → list → shop → pantry → cook).
   */
  enabledTools: [],
  starterRecipeIds: [],
  dismissedSetupSteps: [],
  welcomeDismissed: false,
  /**
   * Soft stage-2 setup: diets / weekly budget not collected at first open.
   * Cleared when filled or dismissed so planning is never blocked.
   */
  usefulSetupPending: false,
  theme: 'light',
  accent: 'mono',
  name: '',
  day: todayStamp(),
  /* goals — what you're aiming at, and how you want to eat */
  goal: 'maintain',
  diets: [], // dietary pattern ids: keto, vegan, gluten-free…
  body: { sex: 'unspecified', age: null, heightCm: null, weightKg: null, activity: 'light' },
  maintenanceKcal: 0, // typed in when body stats aren't given
  targetMode: 'auto', // 'auto' follows the goal; 'custom' is yours to set
  // The questions asked before a restrictive goal, and the answers given:
  // { control, preoccupied, 'unplanned-loss', 'advised-against', pregnancy } → yes | no
  goalScreening: null,
  // A deficit is proposed until it is agreed to: { signature, confirmedAt }
  targetConfirmation: null,
  weeklyKcal: 0, // 0 = seven times the daily target
  /* budget & shopping */
  weeklyBudget: 0,
  monthlyBudget: 0,
  household: 1,
  householdName: '',
  activeMemberId: null,
  members: [], // {id,name,portions,diets,role,permissions,notifications}
  chores: [],
  householdEvents: [],
  shoppingList: [], // {id,name,emoji,aisle,store,qty,price,checked,note,priority,assigneeId}
  favouriteShopping: [], // saved products {name,emoji,aisle,qty,price,note}
  shops: [], // recorded trips {id,date,store,total,items[]}
  shoppingPreferences: { offlineMode: false, largeTouch: false }, // local shopping controls; list data remains local-first
  shoppingMeta: { lastChangedAt: 0, lastChangedBy: '' }, // shared-list freshness, not a second source of truth
  aisleMemory: {}, // name → the aisle you filed it under
  storeRoutes: {}, // store → the aisle order you actually walked
  offers: [], // vouchers and deals you told it about
  coupons: [], // coupon/rewards vault — manual + photo-OCR draft (no feed, never invented)
  aliasMemory: {}, // scan/pantry corrections: 'tomatos' → 'tomatoes' — makes entity resolution learn
  priceAlerts: [], // item price targets checked against recorded shops
  priceAlertConfig: { risePct: 15, bargainPct: 15, overrides: {} }, // receipt-only rise/bargain thresholds, 15% default, per-item tunable
  waste: [], // what you threw away, and what it cost
  /* kitchen */
  pantry: [], // {id,name,emoji,cat,location,qty,cost,store,expiry,low,confidence,amountConfidence}
  pantryConflicts: [], // quantity/source conflicts awaiting a household decision
  pantryEvents: [], // purchase, confirmation and recipe-consumption evidence
  lastPantryEvent: null,
  autoUsePantry: false,
  plan: {}, // { 'YYYY-MM-DD': {breakfast,lunch,dinner} }
  mealPlanEvents: [], // {id,date,slot,plannedRecipeId,actualRecipeId,status,reason,at}
  calendarBusy: [], // [{date,source,importedAt}] imported from a connected calendar
  myRecipes: [], // dishes you generated, imported or were sent
  favourites: [], // recipe ids
  tasteRatings: {}, // recipe id -> nope | like | love
  recipeCollections: [], // {id,name,recipeIds[],createdAt}
  recipeRatings: {}, // recipe id -> personal 1–5 score
  cooked: [], // [{recipeId, date}]
  cookingTimeHistory: [], // {id,recipeId,date,estimatedMins,actualMins}
  /* health — every reading is one you took */
  measurements: [], // {id, key, value, date}
  vitals: [], // {id, key, values:{}, date, note}
  sleep: [], // {id, date, hours, quality, note}
  stress: [], // {id, date, level, note}
  cycles: [], // {id, start, end, flow, symptoms[]}
  trackCycle: false, // asked at setup, and yours to change whenever
  healthVaultEnabled: false,
  // Under-18 setup asks separately about what leaves the device; this is that
  // answer, and null until it has actually been given.
  youthConsent: null, // {acceptedAt, productInsights, healthSharing}
  photos: [], // {id, date, thumb, note} — small, capped, local-first and syncable
  /* exercise */
  workouts: [], // {id, date, type, minutes, intensity, kcal, ...}
  countExerciseKcal: false, // eating back an estimate is a choice
  /* advanced: things you imported or measured elsewhere */
  bloods: [], // {id, date, values:{}, lab, note} — typed from your own report
  glucose: [], // {date, time, value} — imported from a CGM export
  fast: null, // a running fast you started: {startedAt, plan, hours}
  fastPlan: '16-8', // the window you named, if you named one
  /* how you want to be treated: hard lines, soft preferences, and units */
  allergies: [], // hard: a recipe naming one is never offered
  intolerances: [], // soft: flagged, because the amount is the point
  religious: [], // hard: rules you keep
  cuisines: [], // the ones you'd rather cook
  equipment: [], // owned appliances: air-fryer, slow-cooker — recipes needing kit you don't own are skipped
  skill: 'confident',
  timeBudget: 'normal',
  units: {}, // only what you changed; the rest follow DEFAULT_UNITS
  widgets: null, // null = the default Home layout
  // What you're here for: plan-shop · reduce-waste · consistency · nutrition ·
  // household. Empty shows every module. Hiding one hides its screens only —
  // nothing below this line is ever filtered by it.
  modes: [],
  /* reminders — none until you make one */
  reminders: [], // {id, kind, label, times[], days[], on, snoozeUntil}
  placeReminders: [], // foreground-only geofences: {id,label,latitude,longitude,radius,on}
  reminderDone: {}, // 'YYYY-MM-DD|id|HH:MM' → true, so a firing is ticked once
  lastSeenAt: 0, // when the app was last open, for catching you up
  /* food diary */
  log: {}, // { 'YYYY-MM-DD': entry[] }
  favouriteFoods: [],
  customFoods: [],
  mealTemplates: [],
  targets: DEFAULT_TARGETS,
  water: 0,
  waterExtraMl: 0,
};
