import { describe, expect, it } from 'vitest';
import { decideTonight, rankMealsForTonight } from '../src/lib/meal-decision.js';

const recipes = [
  {
    id: 'quick-curry', name: 'Quick curry', meal: 'dinner', cuisine: 'indian', tags: ['vegan'],
    time: 20, servings: 4, costPerServing: 1.5, kcal: 500,
    ingredients: [{ name: 'Chickpeas' }, { name: 'Rice' }],
  },
  {
    id: 'slow-roast', name: 'Slow roast', meal: 'dinner', cuisine: 'british', tags: ['meat'],
    time: 120, servings: 2, costPerServing: 6, kcal: 900,
    ingredients: [{ name: 'Beef' }, { name: 'Potatoes' }, { name: 'Red wine' }],
  },
  {
    id: 'peanut-noodles', name: 'Peanut noodles', meal: 'dinner', cuisine: 'chinese', tags: [],
    time: 15, servings: 2, costPerServing: 2, kcal: 600,
    ingredients: [{ name: 'Noodles' }, { name: 'Peanuts' }],
  },
];

const pantry = [
  { id: 'p1', name: 'Chickpeas', expiry: '2026-09-02' },
  { id: 'p2', name: 'Rice', expiry: null },
];

describe('meal decision engine', () => {
  it('picks the pantry-covering, expiring-first meal', () => {
    const { pick } = decideTonight({
      recipes, pantry, today: '2026-09-01', date: '2026-09-01', people: 2, budgetPerServing: 4,
    });
    expect(pick.recipe.id).toBe('quick-curry');
    expect(pick.reasons.join(' ')).toMatch(/kitchen|goes off/i);
  });

  it('blocks allergens and counts them', () => {
    const { pick, blockedCount, ranked } = decideTonight({
      recipes, pantry, allergies: ['peanuts'], today: '2026-09-01', date: '2026-09-01',
    });
    expect(blockedCount).toBe(1);
    expect(ranked.find((r) => r.recipe.id === 'peanut-noodles').blocked).toBe(true);
    expect(pick.recipe.id).not.toBe('peanut-noodles');
  });

  it('penalises repetition and over-long, over-budget cooking', () => {
    const ranked = rankMealsForTonight({
      recipes, pantry,
      cooked: [{ recipeId: 'quick-curry', date: '2026-08-31' }],
      availableMinutes: 25, budgetPerServing: 2,
      today: '2026-09-01', date: '2026-09-01',
    });
    const roast = ranked.find((r) => r.recipe.id === 'slow-roast');
    expect(roast.score).toBeLessThan(ranked.find((r) => r.recipe.id === 'quick-curry').score);
    expect(roast.reasons.join(' ')).toMatch(/longer than|serving/i);
  });

  it('every pick explains itself with a confidence', () => {
    const { pick, confidence, reasons } = decideTonight({ recipes, pantry, today: '2026-09-01' });
    expect(['high', 'medium', 'low']).toContain(pick.confidence);
    expect(['high', 'medium', 'low', 'none']).toContain(confidence);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('returns null honestly when the book is empty', () => {
    const { pick, reasons } = decideTonight({ recipes: [], pantry, today: '2026-09-01' });
    expect(pick).toBeNull();
    expect(reasons.join(' ')).toMatch(/empty/i);
  });
});
