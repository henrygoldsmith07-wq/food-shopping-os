import { describe, expect, it } from 'vitest';
import { groupMealScore, memberPreferenceProfiles, rankGroupMeals } from '../src/lib/member-preferences.js';

const recipes = [
  { id: 'curry', name: 'Curry', cuisine: 'Indian' },
  { id: 'fish', name: 'Fish', cuisine: 'British' },
  { id: 'pasta', name: 'Pasta', cuisine: 'Italian' },
];
const members = [
  { id: 'a', name: 'A', recipeRatings: { curry: 5, fish: 2, pasta: 4 } },
  { id: 'b', name: 'B', recipeRatings: { curry: 4, fish: 5, pasta: 4 } },
  { id: 'c', name: 'C', recipeRatings: { curry: 2, fish: 3, pasta: 5 } },
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
    expect(curry.average).toBeGreaterThan(pasta.average);
    expect(curry.minimum).toBeLessThan(pasta.minimum);
    expect(rankGroupMeals(recipes, profiles)[0].recipe.id).toBe('pasta');
    expect(curry.explanation).toMatch(/less enthusiastic/i);
  });
});
