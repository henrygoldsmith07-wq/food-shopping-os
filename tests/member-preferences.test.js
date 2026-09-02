import { describe, expect, it } from 'vitest';
import { groupMealScore, memberPreferenceProfiles, rankGroupMeals } from '../src/lib/member-preferences.js';

const recipes = [
  { id: 'curry', name: 'Curry', cuisine: 'Indian' },
  { id: 'fish', name: 'Fish', cuisine: 'British' },
  { id: 'pasta', name: 'Pasta', cuisine: 'Italian' },
];
/*
 * Ratings chosen so the fairness signal has something to do.
 *
 * Curry is the crowd-pleaser on paper — two fives — and the dish one member
 * cannot stand. Pasta is nobody's favourite and nobody's problem. That is the
 * only shape in which "average" and "fair" disagree, and it is the shape the
 * test below is about: curry wins the mean, pasta wins the household.
 *
 * The previous ratings gave pasta both the higher average and the higher
 * minimum, so it won on every measure and the fairness weighting was never
 * exercised — which is why the assertion that curry averages higher was
 * simply false.
 */
const members = [
  { id: 'a', name: 'A', recipeRatings: { curry: 5, fish: 2, pasta: 4 } },
  { id: 'b', name: 'B', recipeRatings: { curry: 5, fish: 5, pasta: 3 } },
  { id: 'c', name: 'C', recipeRatings: { curry: 2, fish: 3, pasta: 4 } },
];

describe('per-member household preferences', () => {
  it('keeps each member profile independent', () => {
    const profiles = memberPreferenceProfiles({ members, recipes });
    expect(profiles).toHaveLength(3);
    expect(profiles[0].recipes.find((row) => row.recipeId === 'curry').score).toBe(5);
    expect(profiles[2].recipes.find((row) => row.recipeId === 'curry').score).toBe(2);
  });

  it('optimizes group satisfaction with a lowest-member fairness signal', () => {
    const profiles = memberPreferenceProfiles({ members, recipes });
    const curry = groupMealScore(recipes[0], profiles);
    const pasta = groupMealScore(recipes[2], profiles);
    // Curry averages higher and is still the wrong answer, because one member
    // rates it 2. The blend is average * 0.65 + minimum * 0.35, so pasta's
    // 3.67/3 beats curry's 4.0/2.
    expect(curry.average).toBeGreaterThan(pasta.average);
    expect(curry.minimum).toBeLessThan(pasta.minimum);
    expect(rankGroupMeals(recipes, profiles)[0].recipe.id).toBe('pasta');
    expect(curry.explanation).toMatch(/less enthusiastic/i);
  });
});
