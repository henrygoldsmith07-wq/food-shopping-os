/**
 * Selectable product modes — simplify what the app *surfaces*, not what it can do.
 *
 * Choosing a mode at setup (or later in Preferences) sets defaults for:
 *   dashboard widgets · bottom-nav order · onboarding questions ·
 *   recommendation priority · notification presets · advanced tools visibility
 *
 * Features stay available; mode only changes what is front and centre.
 */

import { DEFAULT_WIDGETS } from './preferences.js';
import { NOTIFICATION_PRESETS } from './reminders.js';
import { ALL_ENABLED_TOOLS, DEFAULT_ENABLED_TOOLS } from './optionalTools.js';

const ALL_TABS = ['home', 'plan', 'log', 'shop', 'recipes'];
const ALL_ADVANCED = ['planet', 'micros', 'fasting', 'results', 'register'];
const ALL_PROFILE = [
  'goals', 'household', 'guidance', 'health', 'exercise', 'reminders', 'nutrition', 'spending', 'progress',
];
const ALL_SETUP = ['plan', 'cook', 'pantry', 'shop', 'log', 'targets'];
const ALL_NOTIFICATION_KINDS = [...new Set(NOTIFICATION_PRESETS.map((p) => p.kind))];

const mode = (def) => ({
  primaryTabs: ALL_TABS,
  setupOrder: ALL_SETUP,
  recommendationBoost: {},
  notificationKinds: ALL_NOTIFICATION_KINDS,
  advancedToolsVisible: [],
  profileSections: ALL_PROFILE,
  onboarding: {
    showHousehold: true,
    showBudget: true,
    showDiets: true,
    showStarters: true,
    showNutrition: true,
  },
  ...def,
});

/**
 * @typedef {ReturnType<typeof mode>} ProductMode
 */

export const PRODUCT_MODES = [
  mode({
    id: 'meal_planning',
    label: 'Meal Planning',
    blurb: 'Decide what to cook — the list comes from the plan.',
    entryGoal: 'plan',
    widgets: ['rings', 'setup', 'meals', 'recipe', 'leftovers', 'reminders'],
    primaryTabs: ['home', 'plan', 'recipes', 'shop', 'log'],
    setupOrder: ['plan', 'cook', 'pantry', 'shop', 'log', 'targets'],
    recommendationBoost: {
      plan: 18,
      expiry: 8,
      restock: 4,
      budget: -15,
      protein: -10,
      'log-today': -8,
    },
    notificationKinds: ['meal', 'grocery', 'expiry', 'dailySummary'],
    advancedToolsVisible: [],
    profileSections: ['goals', 'household', 'guidance', 'reminders', 'progress'],
    onboarding: {
      showHousehold: true,
      showBudget: false,
      showDiets: true,
      showStarters: true,
      showNutrition: false,
    },
  }),
  mode({
    id: 'shopping_budget',
    label: 'Shopping and Budgeting',
    blurb: 'One list from the plan, spend tracking, fewer impulse buys.',
    entryGoal: 'shop',
    widgets: ['rings', 'setup', 'water', 'pantry', 'leftovers', 'reminders'],
    primaryTabs: ['home', 'shop', 'plan', 'recipes', 'log'],
    setupOrder: ['shop', 'pantry', 'plan', 'cook', 'log', 'targets'],
    recommendationBoost: {
      budget: 22,
      restock: 14,
      expiry: 10,
      plan: 6,
      protein: -25,
      'log-today': -10,
    },
    notificationKinds: ['grocery', 'budget', 'expiry', 'pantry', 'sale', 'restock'],
    advancedToolsVisible: [],
    profileSections: ['goals', 'household', 'guidance', 'reminders', 'spending', 'progress'],
    onboarding: {
      showHousehold: true,
      showBudget: true,
      showDiets: false,
      showStarters: true,
      showNutrition: false,
    },
  }),
  mode({
    id: 'nutrition',
    label: 'Nutrition',
    blurb: 'Diary, targets and macros first — planning supports the numbers.',
    entryGoal: 'plan',
    widgets: ['rings', 'setup', 'goals', 'log', 'meals', 'water', 'reminders'],
    primaryTabs: ['home', 'log', 'plan', 'recipes', 'shop'],
    setupOrder: ['targets', 'log', 'plan', 'cook', 'pantry', 'shop'],
    recommendationBoost: {
      'log-today': 20,
      protein: 22,
      plan: 4,
      budget: -18,
      restock: -8,
    },
    notificationKinds: ['meal', 'water', 'weighIn', 'dailySummary', 'weeklyReport'],
    advancedToolsVisible: ['micros'],
    profileSections: ['goals', 'guidance', 'health', 'exercise', 'reminders', 'nutrition', 'progress'],
    onboarding: {
      showHousehold: false,
      showBudget: false,
      showDiets: true,
      showStarters: false,
      showNutrition: true,
    },
  }),
  mode({
    id: 'household',
    label: 'Household Organisation',
    blurb: 'Pantry, people, shared lists and less food going off.',
    entryGoal: 'pantry',
    widgets: ['rings', 'setup', 'pantry', 'leftovers', 'water', 'reminders'],
    primaryTabs: ['home', 'shop', 'plan', 'recipes', 'log'],
    setupOrder: ['pantry', 'shop', 'plan', 'cook', 'log', 'targets'],
    recommendationBoost: {
      expiry: 24,
      restock: 12,
      plan: 6,
      budget: 4,
      protein: -28,
      'log-today': -12,
    },
    notificationKinds: ['expiry', 'pantry', 'grocery', 'restock', 'meal'],
    advancedToolsVisible: [],
    profileSections: ['household', 'guidance', 'reminders', 'spending', 'progress'],
    onboarding: {
      showHousehold: true,
      showBudget: false,
      showDiets: false,
      showStarters: false,
      showNutrition: false,
    },
  }),
  mode({
    id: 'everything',
    label: 'Everything',
    blurb: 'Full app — every surface visible from day one.',
    entryGoal: 'plan',
    widgets: [...DEFAULT_WIDGETS],
    primaryTabs: [...ALL_TABS],
    setupOrder: [...ALL_SETUP],
    recommendationBoost: {},
    notificationKinds: [...ALL_NOTIFICATION_KINDS],
    advancedToolsVisible: [...ALL_ADVANCED],
    profileSections: [...ALL_PROFILE],
    onboarding: {
      showHousehold: true,
      showBudget: true,
      showDiets: true,
      showStarters: true,
      showNutrition: true,
    },
  }),
];

export const PRODUCT_MODE_IDS = PRODUCT_MODES.map((m) => m.id);
export const DEFAULT_PRODUCT_MODE = 'meal_planning';
export const productModeBy = Object.fromEntries(PRODUCT_MODES.map((m) => [m.id, m]));

/** Resolve a stored or partial id to a full mode definition. */
export const resolveProductMode = (id) =>
  productModeBy[id] || productModeBy[DEFAULT_PRODUCT_MODE];

/**
 * Defaults applied when a mode is chosen (setup finish or Preferences change).
 * Does not install reminders — only shapes which presets are offered.
 */
export const applyProductMode = (modeId, base = {}) => {
  const m = resolveProductMode(modeId);
  // Everything unlocks optional tools; focused modes start with the core loop only.
  const enabledTools = base.enabledTools !== undefined
    ? base.enabledTools
    : (m.id === 'everything' ? [...ALL_ENABLED_TOOLS] : [...DEFAULT_ENABLED_TOOLS]);
  return {
    ...base,
    productMode: m.id,
    entryGoal: base.entryGoal || m.entryGoal,
    widgets: base.widgets ?? [...m.widgets],
    advancedToolsVisible: base.advancedToolsVisible ?? [...m.advancedToolsVisible],
    enabledTools,
  };
};

/** Bottom-nav order for a mode (unknown tabs appended, never dropped). */
export const tabsForMode = (modeId, allTabs = ALL_TABS) => {
  const m = resolveProductMode(modeId);
  const preferred = m.primaryTabs.filter((id) => allTabs.includes(id));
  const rest = allTabs.filter((id) => !preferred.includes(id));
  return [...preferred, ...rest];
};

/** Sort setup steps by the mode’s preferred unlock order. */
export const orderSetupSteps = (steps, modeId) => {
  if (!modeId) return steps;
  const order = resolveProductMode(modeId).setupOrder;
  return [...steps].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
};

/** Boost guidance item priority from mode (preserves feature set). */
export const applyRecommendationBoost = (items, modeId) => {
  const boost = resolveProductMode(modeId).recommendationBoost || {};
  if (!Object.keys(boost).length) return items;
  return items
    .map((item) => {
      // Setup gates and urgent band (reminders, expiry, budget alerts) keep absolute ranking.
      if (item.id.startsWith('setup-') || item.priority >= 90) return item;
      const delta = boost[item.id] ?? 0;
      return delta ? { ...item, priority: item.priority + delta } : item;
    })
    .sort((a, b) => b.priority - a.priority);
};

/** Notification presets filtered to the mode’s kinds. */
export const notificationKindsForMode = (modeId) =>
  resolveProductMode(modeId).notificationKinds;

export const advancedToolsForMode = (modeId, stored) => {
  if (Array.isArray(stored)) return stored;
  return [...resolveProductMode(modeId).advancedToolsVisible];
};

export const profileSectionVisible = (modeId, section) => {
  const sections = resolveProductMode(modeId).profileSections;
  return sections.includes(section);
};

export { ALL_TABS, ALL_ADVANCED, ALL_PROFILE };
