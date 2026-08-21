import { describe, expect, it } from 'vitest';
import { byId } from '../src/data/recipes.js';
import { buildPlan, pantryCoverage } from '../src/lib/planner.js';
import {
  cookingTimeLearning, householdPreferenceProfile, leftoverAwareness, mealPlanAdherence,
  perishabilityOf, perishabilitySummary, repeatFatigue, SKIP_REASONS, skipReasonLabel,
  useSoonIngredients,
} from '../src/lib/planning-intelligence.js';

const DAY = '2026-08-19';
const curry = byId('chickpea-curry');

describe('planning intelligence', () => {
  it('separates use-soon ingredients from leftovers and explains perishability', () => {
    const pantry = [
      { id: 'milk', name: 'Milk', cat: 'Dairy & eggs', expiry: DAY },
      { id: 'spinach', name: 'Spinach', cat: 'Fresh', openedDate: '2026-08-16' },
      { id: 'left', ...({ name: 'Curry leftovers', cat: 'Leftovers', portions: 2, expiry: '2026-08-20' }) },
      { id: 'rice', name: 'Rice', cat: 'Baking & dry', purchaseDate: DAY },
    ];
    expect(useSoonIngredients(pantry, { today: DAY }).map((row) => row.item.name)).toEqual(['Milk', 'Spinach']);
    expect(leftoverAwareness(pantry, { today: DAY })[0].daysLeft).toBe(1);
    expect(perishabilityOf(pantry[0], DAY).kind).toBe('soon');
    expect(perishabilitySummary(pantry, { today: DAY }).unknown).toBe(0);
  });

  it('measures planned, cooked, skipped and pending slots with reasons', () => {
    const plan = { [DAY]: { dinner: curry.id, lunch: 'salmon-teriyaki' } };
    const events = [{ date: DAY, slot: 'lunch', status: 'skipped', reason: 'no-time', at: 2 }];
    const result = mealPlanAdherence(plan, [DAY], events, [{ date: DAY, recipeId: curry.id }]);
    expect(result.planned).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.pending).toBe(0);
    expect(result.rate).toBe(50);
    expect(skipReasonLabel('no-time')).toBe('Not enough time');
    // Expanded reason set: the original six plus leftovers-available,
    // plan-too-complex, changed-preference, takeaway and cooked-a-different-meal.
    expect(SKIP_REASONS).toHaveLength(11);
    for (const id of ['leftovers-available', 'plan-too-complex', 'changed-preference', 'takeaway', 'cooked-a-different-meal']) {
      expect(SKIP_REASONS.map((r) => r.id)).toContain(id);
    }
  });

  it('does not count one cooked meal twice when the same recipe fills two slots', () => {
    const plan = { [DAY]: { lunch: curry.id, dinner: curry.id } };
    const result = mealPlanAdherence(plan, [DAY], [], [{ date: DAY, recipeId: curry.id }]);
    expect(result.completed).toBe(1);
    expect(result.pending).toBe(1);
  });

  it('flags repeat fatigue and learns real cooking time', () => {
    const plan = {
      [DAY]: { dinner: curry.id },
      '2026-08-20': { dinner: curry.id },
    };
    const fatigue = repeatFatigue(plan, [DAY, '2026-08-20'], [
      { date: '2026-08-18', recipeId: curry.id },
    ], { today: DAY });
    expect(fatigue.hasFatigue).toBe(true);
    expect(fatigue.fatigued[0].count).toBe(3);

    const learned = cookingTimeLearning([
      { recipeId: curry.id, actualMins: 31 },
      { recipeId: curry.id, actualMins: 25 },
    ], [curry]);
    expect(learned.averageMins).toBe(28);
    expect(learned.recipes[0].deltaMins).toBe(3);
  });

  it('learns household preferences from cooking, ratings and dislikes', () => {
    const profile = householdPreferenceProfile({
      recipes: [curry],
      cooked: [{ recipeId: curry.id, date: DAY }],
      ratings: { [curry.id]: 'love' },
      members: [{ dislikes: ['mushrooms'] }],
    });
    expect(profile.topCuisines).toContain('Indian');
    expect(profile.learnedFromCooking).toBe(1);
    expect(profile.dislikes).toEqual(['mushrooms']);
  });

  it('can replan to recipes covered by the recorded pantry', () => {
    const pantry = curry.ingredients.map((ingredient) => ({ name: ingredient.name, qty: ingredient.qty }));
    expect(pantryCoverage(curry, pantry).pct).toBe(100);
    const result = buildPlan({
      scope: '1 meal', budget: 4, recipes: [curry], pantry: pantry.map((item) => item.name),
      pantryItems: pantry, availableOnly: true,
    }, 9);
    expect(result.meals[0].id).toBe(curry.id);
  });
});
