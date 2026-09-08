import { describe, expect, it } from 'vitest';
import { buildHouseholdModel, confidenceForCount, householdModelSummary, makeFact } from '../src/lib/household-model.js';

const state = {
  day: '2026-09-01',
  household: 2,
  portionsOverride: 'auto',
  members: [{ id: 'm1', diets: ['vegetarian'], allergies: ['peanuts'] }],
  diets: [],
  allergies: [],
  intolerances: [],
  religious: [],
  tasteRatings: { r1: 'love', r2: 'nope' },
  favourites: ['r1'],
  cooked: [
    { recipeId: 'r1', date: '2026-08-28' },
    { recipeId: 'r1', date: '2026-08-29' },
    { recipeId: 'r3', date: '2026-08-30' },
  ],
  cookingTimeHistory: [{ recipeId: 'r1', estimatedMins: 30, actualMins: 35 }],
  preferenceEvents: [],
  waste: [
    { name: 'Milk', reason: 'expired', date: '2026-08-29' },
    { name: 'Milk', reason: 'expired', date: '2026-08-30' },
    { name: 'Bread', reason: 'cooked-too-much', date: '2026-08-30' },
  ],
  shops: [
    { date: '2026-08-20', items: [{ name: 'Milk', quantity: 2 }] },
    { date: '2026-08-27', items: [{ name: 'Milk', quantity: 2 }] },
    { date: '2026-09-01', items: [{ name: 'Milk', quantity: 2 }] },
  ],
  plan: { '2026-09-01': { dinner: 'r1' } },
  mealPlanEvents: [{ date: '2026-08-28', status: 'cooked' }],
  offers: [{ id: 'o1', used: true }],
  coupons: [],
  aliasMemory: { tomatos: 'tomatoes' },
  timeBudget: 'normal',
};

const recipes = [
  { id: 'r1', name: 'Veg curry', cuisine: 'indian', tags: ['vegan'], time: 30, ingredients: [{ name: 'Milk' }] },
  { id: 'r2', name: 'Chicken pie', cuisine: 'british', tags: ['meat'], time: 60, ingredients: [{ name: 'Chicken' }] },
  { id: 'r3', name: 'Pasta', cuisine: 'italian', tags: ['vegetarian'], time: 20, ingredients: [{ name: 'Pasta' }] },
];

describe('unified household model', () => {
  it('grades confidence by evidence count', () => {
    expect(confidenceForCount(0)).toBe('none');
    expect(confidenceForCount(1)).toBe('low');
    expect(confidenceForCount(4)).toBe('medium');
    expect(confidenceForCount(9)).toBe('high');
  });

  it('every fact carries confidence, evidence count, source and time', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    for (const [key, fact] of Object.entries(model)) {
      if (key === 'version' || key === 'updatedAt') continue;
      expect(fact, key).toHaveProperty('value');
      expect(fact, key).toHaveProperty('confidence');
      expect(['high', 'medium', 'low', 'none']).toContain(fact.confidence);
      expect(fact, key).toHaveProperty('evidenceCount');
      expect(fact, key).toHaveProperty('source');
      expect(fact, key).toHaveProperty('updatedAt');
    }
  });

  it('covers all required domains', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    for (const key of ['appetite', 'preferences', 'dislikes', 'dietaryConstraints', 'mealAcceptance',
      'portionAccuracy', 'effortTolerance', 'weekdayBehaviour', 'ingredientConsumption',
      'wasteProbability', 'shoppingCadence', 'priceSensitivity', 'substitutions']) {
      expect(model[key], key).toBeDefined();
    }
  });

  it('learns dislikes, constraints, waste risk and cadence from evidence', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    expect(model.dislikes.value.recipes).toContain('r2');
    expect(model.dietaryConstraints.value.diets).toContain('vegetarian');
    expect(model.dietaryConstraints.value.allergies).toContain('peanuts');
    expect(Object.keys(model.wasteProbability.value).length).toBeGreaterThan(0);
    expect(model.shoppingCadence.value.trips).toBe(3);
    expect(model.substitutions.value[0]).toMatchObject({ from: 'tomatos', to: 'tomatoes' });
  });

  it('is honest when empty', () => {
    const model = buildHouseholdModel({}, { recipes: [], today: '2026-09-01' });
    expect(model.preferences.confidence).toBe('none');
    expect(model.mealAcceptance.value).toBeNull();
    expect(householdModelSummary(model)).toMatch(/Not enough history|Every suggestion/i);
  });

  it('makeFact defaults confidence from evidence', () => {
    expect(makeFact('x', { evidenceCount: 0 }).confidence).toBe('none');
    expect(makeFact('x', { evidenceCount: 5 }).confidence).toBe('medium');
  });
});
