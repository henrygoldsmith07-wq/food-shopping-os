import { describe, it, expect } from 'vitest';
import {
  applySwap, dietTagsFor, isVideoLink, macroSplit, makeItFit, missingFrom, parseQty,
  parseShareCode, recipeFromImport, recipeNutrition, scaleQty, scaleRecipe, searchRecipes,
  shareCode, swapsFor, swapsForDiet,
} from '../src/lib/recipe-tools.js';
import { byId, RECIPES } from '../src/data/recipes.js';
import { recipeAllowed } from '../src/lib/goals.js';
import { substitutesFor } from '../src/data/substitutions.js';
import { CATALOGUE } from '../src/data/foods.js';

const traybake = byId('chicken-traybake');
const curry = byId('chickpea-curry');

describe('portion scaling', () => {
  it('reads an amount off a line, however it is written', () => {
    expect(parseQty('150 g')).toEqual({ amount: 150, unit: 'g', spaced: true });
    expect(parseQty('600g')).toEqual({ amount: 600, unit: 'g', spaced: false });
    expect(parseQty('2 tbsp')).toEqual({ amount: 2, unit: 'tbsp', spaced: true });
    expect(parseQty('4')).toEqual({ amount: 4, unit: '', spaced: false });
    expect(parseQty('½ lemon')).toEqual({ amount: 0.5, unit: 'lemon', spaced: true });
    expect(parseQty('to serve')).toBeNull();
  });

  it('scales what it can read and leaves the rest alone', () => {
    expect(scaleQty('150 g', 2)).toBe('300 g');
    expect(scaleQty('600g', 1.5)).toBe('900g'); // the dish's own spacing survives
    expect(scaleQty('1 tbsp', 3)).toBe('3 tbsp');
    expect(scaleQty('½ lemon', 2)).toBe('1 lemon');
    expect(scaleQty('3', 0.5)).toBe('1.5');
    expect(scaleQty('to serve', 4)).toBe('to serve');
    expect(scaleQty('150 g', 1)).toBe('150 g');
  });

  it('scales the dish, not the serving', () => {
    const doubled = scaleRecipe(traybake, traybake.servings * 2);
    expect(doubled.servings).toBe(8);
    expect(doubled.kcal).toBe(traybake.kcal); // a serving is still a serving
    expect(doubled.ingredients.find((i) => i.name === 'New potatoes').qty).toBe('1200g');
    expect(doubled.totalCost).toBeCloseTo(traybake.costPerServing * 8, 2);
    expect(scaleRecipe(traybake, traybake.servings).ingredients).toEqual(traybake.ingredients);
  });
});

describe('diet tags read off ingredients', () => {
  it('does not mistake plant milk for dairy, or peanut butter for butter', () => {
    expect(dietTagsFor([{ name: 'Oat milk' }, { name: 'Porridge oats' }])).toContain('vegan');
    expect(dietTagsFor([{ name: 'Coconut yogurt' }, { name: 'Banana' }])).toContain('vegan');
    expect(dietTagsFor([{ name: 'Peanut butter' }, { name: 'Toast' }])).toContain('vegan');
    expect(dietTagsFor([{ name: 'Semi-skimmed milk' }])).toEqual(['vegetarian']);
    expect(dietTagsFor([{ name: 'Chicken breast' }])).toEqual([]);
  });
});

describe('substitutions', () => {
  it('offers swaps only where it has a real replacement', () => {
    const rows = swapsFor(traybake);
    expect(rows.some((r) => r.ingredient === 'Chicken thighs')).toBe(true);
    expect(rows.every((r) => r.options.length > 0)).toBe(true);
    expect(substitutesFor('Unicorn steak')).toEqual([]);
  });

  it('recomputes the dish when both sides are known ingredients', () => {
    const tofu = substitutesFor('Chicken breast').find((o) => o.name === 'Firm tofu');
    const dish = RECIPES.find((r) => r.ingredients.some((i) => i.name === 'Chicken breast'));
    const swapped = applySwap(dish, 'Chicken breast', tofu);

    expect(swapped.recalculated).toBe(true);
    expect(swapped.ingredients.some((i) => i.name === 'Firm tofu')).toBe(true);
    expect(swapped.ingredients.some((i) => i.name === 'Chicken breast')).toBe(false);
    // Tofu carries less protein than chicken, so the figure must move.
    expect(swapped.protein).toBeLessThan(dish.protein);
    expect(swapped.kcal).not.toBe(dish.kcal);
    // The name can't keep claiming chicken — the diet filters read it.
    expect(swapped.name.toLowerCase()).not.toContain('chicken');
    expect(recipeAllowed(swapped, ['vegetarian'])).toBe(true);
    expect(swapped.tags).toContain('vegetarian');
    expect(swapped.swaps).toEqual([{ from: 'Chicken breast', to: 'Firm tofu', why: expect.any(String) }]);
    expect(swapped.variantOf).toBe(dish.id);
    expect(dish.protein).toBeGreaterThan(0); // the original is untouched
  });

  it('says so when it cannot recompute', () => {
    const odd = { ...curry, ingredients: [{ name: 'Mystery paste', qty: '1 tbsp' }, ...curry.ingredients] };
    const swapped = applySwap(odd, 'Mystery paste', { name: 'Also mysterious', ratio: 1, for: [], why: 'because' });
    expect(swapped.recalculated).toBe(false);
    expect(swapped.kcal).toBe(odd.kcal);
    expect(swapped.ingredients[0]).toEqual({ name: 'Also mysterious', qty: '1 tbsp' });
  });

  it('makes a dish fit a pattern it clashed with', () => {
    const dish = RECIPES.find((r) => r.ingredients.some((i) => i.name === 'Chicken breast') && r.ingredients.some((i) => i.name === 'White rice'));
    expect(recipeAllowed(dish, ['vegan'])).toBe(false);
    const vegan = makeItFit(dish, 'vegan');
    expect(recipeAllowed(vegan, ['vegan'])).toBe(true);
    expect(vegan.swaps.length).toBeGreaterThan(0);
  });

  it('has nothing to change on a dish that already fits', () => {
    expect(swapsForDiet(curry, 'vegan')).toEqual([]);
    expect(makeItFit(curry, 'vegan')).toBe(curry);
  });
});

describe('nutritional breakdown', () => {
  it('splits the calories between the macros', () => {
    const split = macroSplit({ protein: 30, carbs: 50, fat: 20 });
    expect(split.protein + split.carbs + split.fat).toBeGreaterThan(98);
    expect(split.fat).toBeGreaterThan(split.protein); // 9 kcal a gram tells
    expect(macroSplit({ protein: 0, carbs: 0, fat: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });

  it('keeps the dish’s own macros and estimates the rest', () => {
    const { totals, estimated, matched } = recipeNutrition(curry, CATALOGUE);
    expect(totals.kcal).toBe(curry.kcal);
    expect(totals.protein).toBe(curry.protein);
    expect(estimated).toBe(true);
    expect(totals.potassium).toBeGreaterThanOrEqual(0);
    expect(matched).toBeGreaterThan(0);
    expect(matched).toBeLessThanOrEqual(100);
  });
});

describe('searching the library', () => {
  it('filters by ingredient, in and out', () => {
    const withChicken = searchRecipes(RECIPES, { include: ['chicken'] });
    expect(withChicken.length).toBeGreaterThan(5);
    expect(withChicken.every((r) => `${r.name} ${r.ingredients.map((i) => i.name)}`.toLowerCase().includes('chicken'))).toBe(true);

    const noMushrooms = searchRecipes(RECIPES, { exclude: ['mushroom'] });
    expect(noMushrooms.some((r) => r.ingredients.some((i) => /mushroom/i.test(i.name)))).toBe(false);

    const both = searchRecipes(RECIPES, { include: ['rice'], exclude: ['chicken'] });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((r) => !/chicken/i.test(r.name))).toBe(true);
  });

  it('filters by time and by diet', () => {
    expect(searchRecipes(RECIPES, { maxTime: 20 }).every((r) => r.time <= 20)).toBe(true);
    const vegan = searchRecipes(RECIPES, { diets: ['vegan'] });
    expect(vegan.length).toBeGreaterThan(20);
    expect(vegan.every((r) => recipeAllowed(r, ['vegan']))).toBe(true);
  });

  it('filters by how much shopping you would have to do', () => {
    const have = curry.ingredients.map((i) => i.name);
    expect(missingFrom(curry, have)).toEqual([]);
    expect(missingFrom(curry, []).length).toBe(curry.ingredients.length);

    const canCook = searchRecipes(RECIPES, { have, maxMissing: 0 });
    expect(canCook.map((r) => r.id)).toContain(curry.id);
    expect(searchRecipes(RECIPES, { have: [], maxMissing: 0 })).toEqual([]);
  });

  it('combines with free text', () => {
    const out = searchRecipes(RECIPES, { query: 'curry', maxTime: 40 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.time <= 40)).toBe(true);
  });
});

describe('sharing a recipe', () => {
  it('survives the round trip, with who sent it', () => {
    const code = shareCode(curry, 'Sam');
    expect(code.startsWith('FORQ1:')).toBe(true);
    const { recipe, error } = parseShareCode(code);
    expect(error).toBeNull();
    expect(recipe.name).toBe(curry.name);
    expect(recipe.ingredients).toEqual(curry.ingredients);
    expect(recipe.steps.map((s) => s.text)).toEqual(curry.steps.map((s) => s.text));
    expect(recipe.sharedBy).toBe('Sam');
    expect(recipe.shared).toBe(true);
    expect(recipe.id).not.toBe(curry.id); // it becomes a recipe of yours
  });

  it('refuses anything that is not a recipe', () => {
    expect(parseShareCode('hello').recipe).toBeNull();
    expect(parseShareCode('FORQ1:not-base64!!').recipe).toBeNull();
    expect(parseShareCode(`FORQ1:${btoa('{"v":1,"r":{"name":"Nothing"}}')}`).error).toMatch(/full recipe/i);
    expect(parseShareCode('').error).toMatch(/doesn’t look like/i);
  });

  it('bounds what a code can bring in', () => {
    const nasty = shareCode({
      ...curry,
      name: 'x'.repeat(200),
      servings: -4,
      ingredients: Array.from({ length: 90 }, () => ({ name: 'y'.repeat(200), qty: '1' })),
      steps: Array.from({ length: 90 }, () => ({ text: 'z'.repeat(900) })),
    }, 'a'.repeat(100));
    const { recipe } = parseShareCode(nasty);
    expect(recipe.name.length).toBe(80);
    expect(recipe.servings).toBe(1);
    expect(recipe.ingredients.length).toBe(40);
    expect(recipe.ingredients[0].name.length).toBe(60);
    expect(recipe.steps.length).toBe(30);
    expect(recipe.steps[0].text.length).toBe(400);
    expect(recipe.sharedBy.length).toBe(40);
  });
});

describe('keeping an imported recipe', () => {
  const parsed = {
    title: 'Peanut butter overnight oats',
    servings: 2,
    perServing: { kcal: 420, protein: 15, carbs: 52, fat: 16, fibre: 7 },
    ingredients: [
      { line: '80g porridge oats', name: 'oats', grams: 80, food: { name: 'Porridge oats' } },
      { line: '2 tbsp peanut butter', name: 'peanut butter', grams: 32, food: { name: 'Peanut butter' } },
    ],
  };

  it('keeps the method you pasted, and admits when there wasn’t one', () => {
    const text = `${parsed.title}\nServes 2\n80g porridge oats\n2 tbsp peanut butter\nStir everything together in a jar and leave it in the fridge overnight.`;
    const kept = recipeFromImport(parsed, { text });
    expect(kept.steps).toHaveLength(1);
    expect(kept.steps[0].text).toMatch(/leave it in the fridge/);
    expect(kept.kcal).toBe(420);
    expect(kept.servings).toBe(2);
    expect(kept.ingredients[0]).toEqual({ name: 'Porridge oats', qty: '160 g' });
    expect(kept.imported).toBe(true);

    const bare = recipeFromImport(parsed, { text: '80g porridge oats' });
    expect(bare.steps[0].text).toMatch(/no method came with this import/i);
  });

  it('keeps the original line for unmatched ingredients instead of inventing grams', () => {
    const kept = recipeFromImport({
      ...parsed,
      ingredients: [{ line: '1 unobtainium', name: 'unobtainium', grams: 100, food: null }],
    });
    expect(kept.ingredients[0]).toEqual({ name: 'unobtainium', qty: '1 unobtainium' });
  });

  it('recognises a video link for what it is', () => {
    expect(isVideoLink('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isVideoLink('https://youtu.be/abc')).toBe(true);
    expect(isVideoLink('https://bbcgoodfood.com/recipes/x')).toBe(false);
    expect(recipeFromImport(parsed, { url: 'https://youtu.be/abc' }).video).toBe('https://youtu.be/abc');
    expect(recipeFromImport(parsed, { url: 'https://bbcgoodfood.com/x' }).video).toBeUndefined();
    expect(recipeFromImport(parsed, { url: 'https://bbcgoodfood.com/x' }).source).toBe('https://bbcgoodfood.com/x');
  });

  it('does not persist executable or non-web source URLs', () => {
    expect(recipeFromImport(parsed, { url: 'javascript:alert(1)' }).source).toBeNull();
    expect(recipeFromImport(parsed, { url: 'data:text/html,<script>alert(1)</script>' }).source).toBeNull();
  });

  it('sanitises source links received in share codes', () => {
    const code = shareCode({ ...curry, source: 'javascript:alert(1)', video: 'data:text/html,bad' });
    const { recipe } = parseShareCode(code);
    expect(recipe.source).toBeNull();
    expect(recipe.video).toBeUndefined();
  });
});
