import { describe, expect, it } from 'vitest';
import { evaluateWeek, optimiseWeek, scoreRecipeForWeek } from '../src/lib/week-optimizer.js';

const curry = { id: 'curry', name: 'Curry', costPerServing: 1.2, time: 25, servings: 4, tags: ['one-pot'], ingredients: [{ name: 'Spinach', qty: '150g' }, { name: 'Rice', qty: '300g' }] };
const pasta = { id: 'pasta', name: 'Mushroom pasta', costPerServing: 1.8, time: 22, servings: 4, tags: [], ingredients: [{ name: 'Mushrooms', qty: '300g' }, { name: 'Spinach', qty: '150g' }] };
const fish = { id: 'fish', name: 'Fish', costPerServing: 4, time: 45, servings: 2, tags: [], ingredients: [{ name: 'Fish', qty: '2' }] };

describe('constraint-based week planning', () => {
  it('explains pantry compatibility and expiry use for a recipe', () => {
    const result = scoreRecipeForWeek(pasta, {
      pantry: [{ name: 'Mushrooms', qty: '300g', expiry: '2026-08-28' }],
      today: '2026-08-27', people: 2, budget: 5,
    });
    expect(result.compatibility).toBe(50);
    expect(result.expiringIngredients).toEqual(['Mushrooms']);
    expect(result.estimatedCost).toBe(3.6);
  });

  it('rejects meals that violate the available-time constraint', () => {
    expect(scoreRecipeForWeek(fish, { availableTime: 30 }).hardViolations).toContain('time');
  });

  it('penalises a week that strands an expiring pantry item', () => {
    const result = evaluateWeek([fish, fish], {
      today: '2026-08-27', dates: ['2026-08-27', '2026-08-28'],
      pantry: [{ name: 'Spinach', qty: '300g', expiry: '2026-08-28' }],
    });
    expect(result.wasteRisk).toBeGreaterThan(0);
    expect(result.explanations.join(' ')).toMatch(/waste/i);
  });

  it('optimises a week from eligible recipes rather than selecting a generic favourite', () => {
    const result = optimiseWeek([curry, pasta, fish], {
      count: 2, dates: ['2026-08-27', '2026-08-28'],
      pantry: [{ name: 'Spinach', qty: '300g', expiry: '2026-08-28' }],
      today: '2026-08-27', people: 2, budget: 10, allowRepeats: false,
    });
    expect(result.meals.map((meal) => meal.id)).toEqual(expect.arrayContaining(['curry', 'pasta']));
    expect(result.pantryCompatibility).toBeGreaterThan(0);
  });
});
