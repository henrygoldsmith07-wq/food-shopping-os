import { describe, it, expect } from 'vitest';
import { buildPlan, hardFilter, pantryHits, scopeCount } from '../src/lib/planner.js';
import { RECIPES, byId } from '../src/data/recipes.js';
import { seasonScore } from '../src/data/seasons.js';
import { itemsFromRecipes } from '../src/data/stores.js';
import { deriveApp } from '../src/lib/derive.js';
import { EMPTY_STATE } from '../src/lib/state.js';

const OWN_RECIPE = {
  id: 'mine-tomato-pasta',
  name: 'Tomato Pasta',
  emoji: '🍝',
  meal: 'dinner',
  cuisine: 'Yours',
  tags: ['vegetarian'],
  time: 20,
  prep: 5,
  difficulty: 'Easy',
  servings: 2,
  kcal: 480,
  protein: 18,
  carbs: 72,
  fat: 12,
  fibre: 8,
  costPerServing: 1.2,
  ingredients: [{ name: 'Pasta', qty: '200 g' }, { name: 'Tomatoes', qty: '200 g' }],
  steps: [{ text: 'Cook the pasta and stir through the tomatoes.' }],
};

describe('hardFilter', () => {
  it('vegan keeps only vegan recipes', () => {
    const out = hardFilter(RECIPES, { diets: ['vegan'] });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.tags.includes('vegan'))).toBe(true);
  });
  it('budget caps cost per serving', () => {
    const out = hardFilter(RECIPES, { budget: 1.2 });
    expect(out.every((r) => r.costPerServing <= 1.2)).toBe(true);
  });
  it('dairy-free excludes recipes with dairy ingredients', () => {
    const out = hardFilter(RECIPES, { diets: ['dairy-free'] });
    expect(out.some((r) => r.id === 'halloumi-grain')).toBe(false);
    expect(out.some((r) => r.id === 'chickpea-curry')).toBe(true);
  });
});

describe('buildPlan', () => {
  it('includes saved recipes in the AI planning pool', () => {
    const app = deriveApp({ ...EMPTY_STATE, myRecipes: [OWN_RECIPE] });
    expect(app.safeRecipes).toContainEqual(OWN_RECIPE);

    const { meals } = buildPlan(
      { scope: 'A week', budget: 4, recipes: app.safeRecipes.filter((recipe) => recipe.id === OWN_RECIPE.id) },
      42,
    );
    expect(meals).toHaveLength(7);
    expect(meals.every((recipe) => recipe.id === OWN_RECIPE.id)).toBe(true);
  });

  it('fills a week of dinners from the vegan pool without repeating', () => {
    const { meals, note } = buildPlan(
      { scope: 'A week', diets: ['vegan'], budget: 4, maxTime: 30 },
      42
    );
    expect(meals).toHaveLength(scopeCount('A week'));
    expect(meals.every(Boolean)).toBe(true);
    expect(meals.every((r) => r.meal === 'dinner')).toBe(true);
    expect(new Set(meals.map((r) => r.id)).size).toBe(meals.length);
    expect(note).toBeNull();
  });

  it('repeats, with a note, when the pool really is tiny', () => {
    const { meals, note } = buildPlan(
      { scope: 'A week', diets: ['vegan', 'keto'], budget: 1, maxTime: 20 },
      11
    );
    expect(meals).toHaveLength(7);
    expect(note === null || /repeat|closest/i.test(note)).toBe(true);
  });

  it('plans a day as breakfast, lunch and dinner', () => {
    const { meals } = buildPlan({ scope: 'A day', budget: 4 }, 3);
    expect(meals.map((r) => r.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
  });
  it('falls back with a note when nothing matches', () => {
    const { meals, note } = buildPlan({ scope: 'A day', diets: ['vegan'], budget: 0.1 }, 7);
    expect(meals).toHaveLength(3);
    expect(note).toMatch(/closest fits/i);
  });
  it('is deterministic for the same seed and options', () => {
    const a = buildPlan({ scope: 'A week', budget: 3 }, 99).meals.map((r) => r.id);
    const b = buildPlan({ scope: 'A week', budget: 3 }, 99).meals.map((r) => r.id);
    expect(a).toEqual(b);
  });
  it('honours date night as a soft preference', () => {
    const { meals } = buildPlan({ scope: '1 meal', occasion: 'Date night', budget: 4 }, 5);
    expect(meals[0].tags).toContain('date-night');
  });
});

describe('planning around what you have and what month it is', () => {
  it('counts the ingredients your pantry already covers', () => {
    const salmon = byId('salmon-teriyaki');
    expect(pantryHits(salmon, ['Sushi rice', 'Soy sauce', 'Ketchup'])).toBe(2);
    expect(pantryHits(salmon, [])).toBe(0);
  });

  it('leans towards dishes that use the pantry, without ever emptying the pool', () => {
    const pantry = ['Chickpeas', 'Coconut milk', 'Chopped tomatoes', 'Onion', 'Rice', 'Spinach'];
    const { meals } = buildPlan({ scope: 'A week', budget: 4, pantry }, 21);
    expect(meals).toHaveLength(7);
    const usingPantry = meals.filter((r) => pantryHits(r, pantry) >= 2).length;
    expect(usingPantry).toBeGreaterThan(3);

    // A pantry nothing matches must not leave the week empty.
    const odd = buildPlan({ scope: 'A week', budget: 4, pantry: ['Marmite'] }, 21);
    expect(odd.meals).toHaveLength(7);
    expect(odd.meals.every(Boolean)).toBe(true);
  });

  it('favours dishes with something in season', () => {
    const { meals } = buildPlan({ scope: 'A week', budget: 4, month: 7 }, 33);
    expect(meals).toHaveLength(7);
    expect(meals.filter((r) => seasonScore(r, 7) > 0).length).toBeGreaterThan(4);
  });

  it('plans a whole month when asked for one', () => {
    expect(scopeCount('A month')).toBe(28);
    const { meals } = buildPlan({ scope: 'A month', budget: 4, days: 31 }, 8);
    expect(meals).toHaveLength(31);
    expect(meals.every((r) => r.meal === 'dinner')).toBe(true);
  });
});

describe('batch cooking plans', () => {
  it('repeats a few dishes on purpose, in blocks, and says so', () => {
    const { meals, note } = buildPlan({ scope: 'A week', budget: 4, batch: true }, 12);
    expect(meals).toHaveLength(7);
    const distinct = new Set(meals.map((r) => r.id));
    expect(distinct.size).toBeLessThan(4);
    expect(note).toMatch(/batch plan/i);
    // Each dish covers consecutive days, so you cook once and reheat.
    const blocks = meals.filter((r, i) => i === 0 || r.id !== meals[i - 1].id).length;
    expect(blocks).toBe(distinct.size);
  });

  it('picks dishes that are actually worth batching', () => {
    const { meals } = buildPlan({ scope: 'A week', budget: 4, batch: true }, 5);
    expect(meals.every((r) => r.servings >= 4 || r.tags.some((t) => ['batch', 'freezer', 'one-pot', 'meal-prep'].includes(t)))).toBe(true);
  });

  it('leaves a single meal alone', () => {
    const { meals } = buildPlan({ scope: '1 meal', budget: 4, batch: true }, 5);
    expect(meals).toHaveLength(1);
  });
});

describe('itemsFromRecipes', () => {
  it('returns every ingredient once, minus what your pantry already has', () => {
    const recipe = RECIPES.find((r) => r.id === 'salmon-teriyaki');
    const items = itemsFromRecipes([recipe, recipe]);
    expect(items).toHaveLength(recipe.ingredients.length);
    // Prices start blank — they are whatever you end up paying.
    expect(items.every((i) => i.price === 0)).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);

    const withPantry = itemsFromRecipes([recipe], ['Sushi rice', 'Soy sauce']);
    expect(withPantry).toHaveLength(recipe.ingredients.length - 2);
  });
});
