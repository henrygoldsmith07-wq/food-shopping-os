import { describe, it, expect } from 'vitest';
import { generatorInputs, inventRecipe, partsYouHave } from '../src/lib/recipe-ai.js';
import { recipeAllowed } from '../src/lib/goals.js';
import { seasonScore } from '../src/data/seasons.js';

const KITCHEN = ['Chicken breast', 'White rice', 'Broccoli', 'Teriyaki glaze', 'Onion', 'Garlic'];
const VEGGIE_KITCHEN = ['Firm tofu', 'Rice noodles', 'Peppers', 'Soy & ginger'];

describe('reading your kitchen', () => {
  it('matches pantry names to real components', () => {
    const parts = partsYouHave(['chicken breast', 'brown rice']);
    expect(parts.map((p) => p.name)).toEqual(expect.arrayContaining(['Chicken breast', 'Brown rice']));
    expect(partsYouHave([])).toEqual([]);
    expect(partsYouHave(['unicorn'])).toEqual([]);
  });

  it('says which parts of a dish your kitchen can cover', () => {
    const inputs = generatorInputs(KITCHEN);
    expect(inputs.map((a) => a.key)).toEqual(['protein', 'base', 'veg', 'sauce']);
    expect(inputs.every((a) => a.options.length > 0)).toBe(true);

    const thin = generatorInputs(['White rice']);
    expect(thin.find((a) => a.key === 'base').options).toHaveLength(1);
    expect(thin.find((a) => a.key === 'protein').options).toHaveLength(0);
  });
});

describe('inventing a recipe', () => {
  it('builds a dish from what you have, and computes it', () => {
    const r = inventRecipe({ have: KITCHEN, seed: 12 });
    expect(r.name.length).toBeGreaterThan(8);
    expect(r.ingredients.length).toBeGreaterThanOrEqual(5);
    expect(r.steps.length).toBeGreaterThan(2);
    expect(r.kcal).toBeGreaterThan(200);
    expect(r.kcal).toBeLessThan(1400);
    expect(r.protein).toBeGreaterThan(0);
    expect(r.costPerServing).toBeGreaterThan(0.3);
    expect(r.healthScore).toBeGreaterThan(0);
    expect(r.generated).toBe(true);
    expect(r.bought).toEqual([]); // the kitchen covered every part
    expect(r.fromPantry.length).toBeGreaterThanOrEqual(4);
  });

  it('is the same dish for the same request', () => {
    const a = inventRecipe({ have: KITCHEN, seed: 5 });
    const b = inventRecipe({ have: KITCHEN, seed: 5 });
    expect(a.id).toBe(b.id);
    expect(a.ingredients).toEqual(b.ingredients);
    expect(inventRecipe({ have: KITCHEN, seed: 6 }).id).not.toBe(a.id);
  });

  it('says what it had to assume you would buy', () => {
    const r = inventRecipe({ have: ['White rice'], seed: 3 });
    expect(r.bought.length).toBeGreaterThan(0);
    expect(r.fromPantry).toEqual(['White rice']);
    expect(inventRecipe({ have: [], seed: 3 }).bought.length).toBe(4);
  });

  it('respects the dietary patterns it is given', () => {
    const r = inventRecipe({ have: [...KITCHEN, ...VEGGIE_KITCHEN], diets: ['vegan'], seed: 9 });
    expect(recipeAllowed(r, ['vegan'])).toBe(true);
    expect(r.tags).toContain('vegan');
  });

  it('keeps inside a time limit and scales to a household', () => {
    const quick = inventRecipe({ have: KITCHEN, maxTime: 20, seed: 4 });
    expect(quick.time).toBeLessThanOrEqual(20);

    const four = inventRecipe({ have: KITCHEN, servings: 4, seed: 4 });
    const one = inventRecipe({ have: KITCHEN, servings: 1, seed: 4 });
    expect(four.servings).toBe(4);
    expect(four.kcal).toBe(one.kcal); // a serving is a serving
    expect(four.ingredients[0].qty).not.toBe(one.ingredients[0].qty);
  });

  it('leans on what is in season when asked', () => {
    const summer = inventRecipe({ have: ['Chicken breast', 'White rice', 'Tomato & basil sauce', 'Courgette', 'Kale', 'Cherry tomatoes'], month: 7, seed: 2 });
    expect(seasonScore(summer, 7)).toBeGreaterThan(0);
  });
});
