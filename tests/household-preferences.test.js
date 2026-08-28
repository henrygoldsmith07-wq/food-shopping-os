import { describe, expect, it } from 'vitest';
import { cookingFitFor, learnHouseholdPreferences, preferenceSummary } from '../src/lib/household-preferences.js';

const recipes = [
  { id: 'lasagne', name: 'Lasagne', cuisine: 'Italian', time: 90, ingredients: [{ name: 'Pasta' }] },
  { id: 'stir-fry', name: 'Stir fry', cuisine: 'Chinese', time: 20, ingredients: [{ name: 'Noodles' }] },
];

describe('household preference learning', () => {
  it('keeps eating enjoyment separate from cooking practicality', () => {
    const profile = learnHouseholdPreferences({ recipes, cooked: [
      { recipeId: 'lasagne', date: '2026-08-10', rating: 'love', actualMins: 100, estimatedMins: 90 },
      { recipeId: 'lasagne', date: '2026-08-11', rating: 'love', actualMins: 110, estimatedMins: 90, cookingRating: 'nope' },
    ] });
    const fit = cookingFitFor(recipes[0], profile, { weekday: true });
    expect(fit.eatingScore).toBe(1);
    expect(fit.cookingScore).toBeLessThan(0);
    expect(fit.explanation).toMatch(/loved eating/i);
  });

  it('learns cuisines, weekday/weekend behavior, portions and leftovers', () => {
    const profile = learnHouseholdPreferences({ recipes, cooked: [
      { recipeId: 'stir-fry', date: '2026-08-10', rating: 'like', portionsEaten: 2, leftoverOffered: true, leftoverAccepted: true, leftoverEaten: true },
      { recipeId: 'stir-fry', date: '2026-08-15', rating: 'love', portionsEaten: 3, leftoverOffered: true, leftoverAccepted: true },
    ] });
    expect(profile.cuisines[0].key).toBe('chinese');
    expect(profile.weekday.observations).toBe(1);
    expect(profile.weekend.observations).toBe(1);
    expect(profile.portions.typical).toBe(2.5);
    expect(profile.leftovers.acceptanceRate).toBe(100);
  });

  it('does not invent a preference summary before evidence exists', () => {
    const profile = learnHouseholdPreferences({ recipes: [] });
    expect(preferenceSummary(profile).headline).toMatch(/learning/i);
    expect(profile.cookingTime.preferredMinutes).toBeNull();
  });
});
