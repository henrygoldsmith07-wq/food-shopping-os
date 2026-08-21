import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { applyProductMode, DEFAULT_PRODUCT_MODE } from '../src/data/productModes.js';
import { targetsFor } from '../src/lib/goals.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';

/**
 * Mirrors the slim finish() payload from Onboarding — required only.
 * Useful/advanced must not be required to mark onboarded.
 */
const finishRequiredOnly = (profile = {}) => {
  const productMode = profile.productMode || DEFAULT_PRODUCT_MODE;
  const mode = applyProductMode(productMode, {});
  const state = {
    goal: 'maintain',
    diets: profile.diets || [],
    body: { sex: 'unspecified', age: null, heightCm: null, weightKg: null, activity: 'light' },
    maintenanceKcal: 0,
    targets: DEFAULT_TARGETS,
  };
  return {
    ...mode,
    ...state,
    name: (profile.name || '').trim() || 'you',
    household: profile.household || 1,
    weeklyBudget: Math.max(0, Number(profile.weeklyBudget) || 0),
    targets: targetsFor(state),
    usefulSetupPending: !(profile.diets?.length || Number(profile.weeklyBudget) > 0),
    starterRecipeIds: [],
    plan: {},
    shoppingList: [],
    onboarded: true,
  };
};

describe('slim onboarding stages', () => {
  it('required finish needs only name, household and product mode', () => {
    const next = finishRequiredOnly({
      name: 'Ada',
      household: 3,
      productMode: 'meal_planning',
    });
    expect(next.onboarded).toBe(true);
    expect(next.name).toBe('Ada');
    expect(next.household).toBe(3);
    expect(next.productMode).toBe('meal_planning');
    expect(next.diets).toEqual([]);
    expect(next.weeklyBudget).toBe(0);
    expect(next.body.weightKg).toBe(null);
    expect(next.usefulSetupPending).toBe(true);
    expect(next.plan).toEqual({});
  });

  it('filling useful later clears the soft prompt flag', () => {
    const next = finishRequiredOnly({
      name: 'Bea',
      household: 2,
      diets: ['vegan'],
      weeklyBudget: 60,
    });
    expect(next.usefulSetupPending).toBe(false);
    expect(next.diets).toEqual(['vegan']);
    expect(next.weeklyBudget).toBe(60);
  });

  it('EMPTY_STATE does not force useful or advanced data', () => {
    expect(EMPTY_STATE.onboarded).toBe(false);
    expect(EMPTY_STATE.usefulSetupPending).toBe(false);
    expect(EMPTY_STATE.diets).toEqual([]);
    expect(EMPTY_STATE.weeklyBudget).toBe(0);
    expect(EMPTY_STATE.body.weightKg).toBe(null);
    expect(EMPTY_STATE.trackCycle).toBe(false);
  });

  it('advanced fields stay out of the required path', () => {
    const next = finishRequiredOnly({ name: 'Cara', household: 1 });
    expect(next.trackCycle).toBeUndefined(); // not set at finish — stays EMPTY default
    expect(next.maintenanceKcal).toBe(0);
    expect(next.body.heightCm).toBe(null);
  });
});
