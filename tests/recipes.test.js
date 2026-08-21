import { describe, it, expect } from 'vitest';
import { RECIPES, byId, forMeal, filterRecipes, DISCOVER_FILTERS } from '../src/data/recipes.js';
import { compose, generateRecipes, PER_MEAL, TEMPLATES } from '../src/data/recipe-gen.js';
import { CUISINES } from '../src/data/preferences.js';
import { PROTEINS, BASES, VEG } from '../src/data/recipe-parts.js';
import { recipeAllowed } from '../src/lib/goals.js';
import { estimateRecipeMicros } from '../src/lib/foodlog.js';

describe('the recipe book', () => {
  it('carries a full quota of dishes for each meal of the day', () => {
    const generated = generateRecipes();
    expect(PER_MEAL).toBe(400);
    expect(generated.filter((r) => r.meal === 'breakfast')).toHaveLength(PER_MEAL);
    expect(generated.filter((r) => r.meal === 'lunch')).toHaveLength(PER_MEAL);
    expect(generated.filter((r) => r.meal === 'dinner')).toHaveLength(PER_MEAL);
    expect(RECIPES.length).toBeGreaterThanOrEqual(1200);
  });

  it('has the combinations to fill that quota, rather than repeating to reach it', () => {
    // The quota is only honest if the templates can actually supply it: asking
    // for one more than exists would just walk further down the same diagonals.
    const capacity = {};
    for (const t of TEMPLATES) {
      capacity[t.meal] = (capacity[t.meal] || 0) + t.axes.reduce((n, axis) => n * axis.length, 1);
    }
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      expect(capacity[meal]).toBeGreaterThan(PER_MEAL);
    }
  });

  it('every template points at components that exist', () => {
    for (const template of TEMPLATES) {
      for (const axis of template.axes) {
        expect(axis.length).toBeGreaterThan(0);
        for (const part of axis) expect(part?.name).toBeTruthy();
      }
    }
  });

  it('can cook something from every cuisine the preferences offer', () => {
    const inBook = new Set(RECIPES.map((r) => r.cuisine));
    // Offering "Thai" as a favourite when the book has no Thai dish would make
    // the preference a decoration.
    for (const cuisine of CUISINES) expect(inBook.has(cuisine)).toBe(true);
  });

  it('gives every dish a unique id and a meal', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(RECIPES.every((r) => ['breakfast', 'lunch', 'dinner'].includes(r.meal))).toBe(true);
    expect(forMeal('breakfast').every((r) => r.meal === 'breakfast')).toBe(true);
    expect(forMeal().length).toBe(RECIPES.length);
  });

  it('has no invented ratings — dishes are judged on real attributes', () => {
    expect(RECIPES.some((r) => 'rating' in r)).toBe(false);
    expect(RECIPES.every((r) => r.healthScore > 0 && r.proteinScore > 0 && r.envScore > 0)).toBe(true);
  });

  it('keeps every dish plausible', () => {
    for (const r of RECIPES) {
      expect(r.kcal, r.name).toBeGreaterThan(100);
      expect(r.kcal, r.name).toBeLessThan(1200);
      expect(r.protein, r.name).toBeGreaterThan(0);
      expect(r.costPerServing, r.name).toBeGreaterThan(0.3);
      expect(r.costPerServing, r.name).toBeLessThan(8);
      expect(r.ingredients.length, r.name).toBeGreaterThan(1);
      expect(r.steps.length, r.name).toBeGreaterThan(1);
      expect(r.name, r.name).toMatch(/^[A-Z]/);
    }
  });

  it('computes nutrition from what is actually in the dish', () => {
    // 150 g chicken (165/100g) + 180 g rice (130/100g) = 248 + 234
    const n = compose([PROTEINS.chicken, BASES.rice]);
    expect(n.kcal).toBe(Math.round(165 * 1.5 + 130 * 1.8));
    expect(n.protein).toBe(Math.round(31 * 1.5 + 2.7 * 1.8));
    expect(n.ingredients.map((i) => i.name)).toEqual(['Chicken breast', 'White rice']);

    // Doubling a component doubles its contribution (± the rounding of a half).
    const twice = compose([{ ...PROTEINS.chicken, grams: 300 }]);
    const once = compose([PROTEINS.chicken]);
    expect(Math.abs(twice.kcal - once.kcal * 2)).toBeLessThanOrEqual(1);
  });

  it('costs a dish from its ingredients', () => {
    const n = compose([PROTEINS.chicken, BASES.rice, VEG.broccoli]);
    const expected = 0.75 * 1.5 + 0.12 * 1.8 + 0.28 * 0.9;
    expect(n.costPerServing).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });
});

describe('diet tags are read off the ingredients', () => {
  it('marks a dish vegan only when nothing in it comes from an animal', () => {
    const vegan = RECIPES.filter((r) => r.tags.includes('vegan'));
    expect(vegan.length).toBeGreaterThan(50);
    for (const r of vegan) {
      const text = r.ingredients.map((i) => i.name).join(' ').replace(/(coconut|oat) (milk|yogurt)/gi, '');
      expect(text, r.name).not.toMatch(/chicken|beef|lamb|pork|salmon|cod|prawn|tuna|egg|yogurt|halloumi|feta|paneer|parmesan|milk|honey/i);
    }
  });

  it('never marks a meat dish vegetarian', () => {
    const veggie = RECIPES.filter((r) => r.tags.includes('vegetarian'));
    for (const r of veggie) {
      const text = r.ingredients.map((i) => i.name).join(' ');
      expect(text, r.name).not.toMatch(/chicken|beef|lamb|pork|turkey|salmon|cod|prawn|tuna/i);
    }
  });

  it('leaves enough for a vegan or pescatarian to plan a week', () => {
    for (const diet of ['vegan', 'vegetarian', 'pescatarian', 'gluten-free', 'dairy-free']) {
      for (const meal of ['breakfast', 'lunch', 'dinner']) {
        const fits = forMeal(meal).filter((r) => recipeAllowed(r, [diet]));
        expect(fits.length, `${diet}/${meal}`).toBeGreaterThan(7);
      }
    }
  });
});

describe('discovery filters', () => {
  it('every filter returns something', () => {
    for (const f of DISCOVER_FILTERS) {
      expect(filterRecipes(f).length, f).toBeGreaterThan(0);
    }
  });

  it('filters mean what they say', () => {
    expect(filterRecipes('Quick').every((r) => r.time <= 25)).toBe(true);
    expect(filterRecipes('Budget').every((r) => r.costPerServing <= 1.5)).toBe(true);
    expect(filterRecipes('Light').every((r) => r.kcal <= 450)).toBe(true);
    expect(filterRecipes('Breakfast').every((r) => r.meal === 'breakfast')).toBe(true);
    expect(filterRecipes('Italian').every((r) => r.cuisine === 'Italian')).toBe(true);
  });
});

describe('the rest of the app can use them', () => {
  it('looks a dish up by id', () => {
    const first = RECIPES[20];
    expect(byId(first.id)).toBe(first);
    expect(byId('nope')).toBeUndefined();
  });

  it('estimates micronutrients for a generated dish', () => {
    const dish = forMeal('dinner').find((r) => !r.signature);
    const micros = estimateRecipeMicros(dish);
    expect(micros).not.toBeNull();
    expect(micros.potassium).toBeGreaterThanOrEqual(0);
  });

  it('keeps the signature recipes, marked as such', () => {
    const signature = RECIPES.filter((r) => r.signature);
    expect(signature.length).toBe(13);
    expect(byId('chickpea-curry').signature).toBe(true);
  });
});
