import { describe, it, expect } from 'vitest';
import {
  PRODUCT_MODES,
  PRODUCT_MODE_IDS,
  DEFAULT_PRODUCT_MODE,
  resolveProductMode,
  applyProductMode,
  tabsForMode,
  orderSetupSteps,
  applyRecommendationBoost,
  notificationKindsForMode,
  advancedToolsForMode,
  profileSectionVisible,
} from '../src/data/productModes.js';
import { DEFAULT_WIDGETS } from '../src/data/preferences.js';
import { setupProgress } from '../src/lib/setup.js';
import { notificationPresets } from '../src/lib/reminder-suggest.js';
import { guidanceFor } from '../src/lib/guidance.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

describe('product modes', () => {
  it('defines the five selectable modes from setup', () => {
    expect(PRODUCT_MODE_IDS).toEqual([
      'meal_planning',
      'shopping_budget',
      'nutrition',
      'household',
      'everything',
    ]);
    expect(PRODUCT_MODES.map((m) => m.label)).toEqual([
      'Meal Planning',
      'Shopping and Budgeting',
      'Nutrition',
      'Household Organisation',
      'Everything',
    ]);
  });

  it('defaults to meal planning (primary product promise)', () => {
    expect(DEFAULT_PRODUCT_MODE).toBe('meal_planning');
    expect(resolveProductMode(undefined).id).toBe('meal_planning');
    expect(resolveProductMode('nope').id).toBe('meal_planning');
  });

  it('applyProductMode sets widgets, entryGoal and advanced tools', () => {
    const applied = applyProductMode('shopping_budget', { name: 'Ada' });
    expect(applied.productMode).toBe('shopping_budget');
    expect(applied.entryGoal).toBe('shop');
    expect(applied.widgets).toContain('water');
    expect(applied.widgets).toContain('pantry');
    expect(applied.advancedToolsVisible).toEqual([]);
    expect(applied.name).toBe('Ada');
  });

  it('everything mode surfaces the full widget set and advanced tools', () => {
    const applied = applyProductMode('everything');
    expect(applied.widgets).toEqual([...DEFAULT_WIDGETS]);
    expect(applied.advancedToolsVisible).toEqual(
      expect.arrayContaining(['planet', 'micros', 'fasting', 'results', 'register']),
    );
  });

  it('reorders nav tabs without dropping any', () => {
    const nutrition = tabsForMode('nutrition');
    expect(nutrition[0]).toBe('home');
    expect(nutrition[1]).toBe('log');
    expect(new Set(nutrition).size).toBe(5);
    expect(nutrition).toEqual(expect.arrayContaining(['plan', 'shop', 'recipes']));
  });

  it('orders setup steps by mode', () => {
    const steps = [
      { id: 'targets' }, { id: 'log' }, { id: 'pantry' },
      { id: 'plan' }, { id: 'shop' }, { id: 'cook' },
    ];
    expect(orderSetupSteps(steps, 'nutrition').map((s) => s.id)[0]).toBe('targets');
    expect(orderSetupSteps(steps, 'household').map((s) => s.id)[0]).toBe('pantry');
    expect(orderSetupSteps(steps, 'shopping_budget').map((s) => s.id)[0]).toBe('shop');
  });

  it('setupProgress reorders gates for the active mode', () => {
    const progress = setupProgress({ productMode: 'nutrition', targets: {}, log: {}, pantry: [], plan: {}, shops: [], cooked: [] });
    expect(progress.steps[0].id).toBe('targets');
  });

  it('boosts recommendations for the active mode', () => {
    const items = [
      { id: 'plan', priority: 65 },
      { id: 'budget', priority: 88 },
      { id: 'protein', priority: 62 },
    ];
    const meal = applyRecommendationBoost(items, 'meal_planning');
    expect(meal[0].id).toBe('plan');
    const shop = applyRecommendationBoost(items, 'shopping_budget');
    expect(shop[0].id).toBe('budget');
    const nutrition = applyRecommendationBoost(items, 'nutrition');
    expect(nutrition[0].id).toBe('protein');
  });

  it('filters notification presets by mode', () => {
    const mealKinds = notificationKindsForMode('meal_planning');
    expect(mealKinds).toContain('meal');
    expect(mealKinds).toContain('grocery');
    expect(mealKinds).not.toContain('sale');

    const presets = notificationPresets([], 'meal_planning');
    expect(presets.every((p) => mealKinds.includes(p.kind))).toBe(true);
    expect(presets.length).toBe(mealKinds.length);

    const all = notificationPresets([]);
    expect(all.length).toBe(9);
  });

  it('advanced tools follow mode defaults when not stored', () => {
    expect(advancedToolsForMode('meal_planning', null)).toEqual([]);
    expect(advancedToolsForMode('nutrition', null)).toEqual(['micros']);
    expect(advancedToolsForMode('everything', null)).toContain('planet');
    expect(advancedToolsForMode('meal_planning', ['fasting'])).toEqual(['fasting']);
  });

  it('profile sections differ by mode while preferences stay reachable', () => {
    expect(profileSectionVisible('meal_planning', 'nutrition')).toBe(false);
    expect(profileSectionVisible('nutrition', 'nutrition')).toBe(true);
    expect(profileSectionVisible('household', 'household')).toBe(true);
    expect(profileSectionVisible('shopping_budget', 'spending')).toBe(true);
    // Guidance (prefs entry) remains for focused modes
    expect(profileSectionVisible('meal_planning', 'guidance')).toBe(true);
  });

  it('deriveApp exposes mode, nav order and widgets', () => {
    const app = deriveApp({
      ...EMPTY_STATE,
      productMode: 'shopping_budget',
      widgets: null,
      advancedToolsVisible: null,
    });
    // widgets null falls back to mode widgets via resolve
    expect(app.productMode).toBe('shopping_budget');
    expect(app.navTabs[1]).toBe('shop');
    expect(app.homeWidgets).toContain('pantry');
    expect(app.advancedToolsVisible).toEqual([]);
  });

  it('guidanceFor applies mode boosts on empty diary', () => {
    const base = {
      ...EMPTY_STATE,
      onboarded: true,
      productMode: 'meal_planning',
      entryGoal: 'plan',
      targets: { kcal: 2000, protein: 120, carbs: 200, fat: 70 },
      log: {},
      plan: {},
      pantry: [],
      shops: [],
      shoppingList: [],
      reminders: [],
      dismissedSetupSteps: [],
    };
    const items = guidanceFor(deriveApp(base));
    expect(items.length).toBeGreaterThan(0);
    // plan or setup-plan should rank highly for meal planning
    const topIds = items.slice(0, 3).map((i) => i.id);
    expect(topIds.some((id) => id === 'plan' || id.startsWith('setup-'))).toBe(true);
  });
});
