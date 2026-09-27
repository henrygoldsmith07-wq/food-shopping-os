import { describe, it, expect } from 'vitest';
import { CATALOGUE, FOODS, registerFood } from '../src/data/foods.js';
import { RECIPES, allRecipes, registerRecipes } from '../src/data/recipes.js';
import { ensureFullCatalogue, fullCatalogueReady } from '../src/lib/catalogue-loader.js';

/**
 * The book ships in two tiers, and the split follows the product hierarchy:
 * every food is in the first paint because matching a spoken sentence or
 * scanning a barcode is core-loop work, while the hand-written recipe shelves
 * are browse depth on top of an eager planning pool. These tests pin the two
 * promises that make that safe — the whole book is answerable, and a load
 * happens exactly once with nothing duplicated.
 */
describe('the lazily loaded catalogue', () => {
  it('ships every food eagerly, because matching is core-loop work', () => {
    expect(CATALOGUE).toBe(FOODS); // one live array, so a row is visible everywhere
    const ids = new Set(CATALOGUE.map((food) => food.id));
    // A spoken sentence, a photographed plate and a scan must all resolve
    // without a fetch in between — including foods that only arrive in a
    // later expansion wave.
    for (const id of ['chicken-breast', 'wholemeal-bread', 'semi-skimmed-milk', 'porridge-oats']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(CATALOGUE.length).toBeGreaterThan(2000);
  });

  it('keeps the planning pool eager, so a plan never waits on a chunk', () => {
    expect(RECIPES.length).toBeGreaterThan(1000);
    expect(allRecipes().every((recipe) => recipe.ingredients?.length > 0)).toBe(true);
  });

  it('loads the recipe shelves once, and every dish lands in the book', async () => {
    const before = RECIPES.length;
    const loaded = await ensureFullCatalogue();

    expect(loaded.recipes).toBeGreaterThan(0);
    expect(RECIPES.length).toBe(before + loaded.recipes);
    expect(await fullCatalogueReady()).toBe(true);

    // A second call must not append a second copy of anything.
    expect(await ensureFullCatalogue()).toBe(loaded);
    expect(RECIPES.length).toBe(before + loaded.recipes);
  });

  it('keeps ids unique across both tiers, core first', async () => {
    await ensureFullCatalogue();
    const foodIds = CATALOGUE.map((food) => food.id);
    expect(new Set(foodIds).size).toBe(foodIds.length);
    // The everyday rows keep their place at the front of every search.
    expect(CATALOGUE.slice(0, 50).some((food) => food.id === 'chicken-breast')).toBe(true);

    const recipeIds = RECIPES.map((recipe) => recipe.id);
    expect(new Set(recipeIds).size).toBe(recipeIds.length);
    expect(RECIPES[0].signature).toBe(true);
  });

  it('gives every consumer a fresh array, so a late shelf is never missed', async () => {
    await ensureFullCatalogue();
    const before = allRecipes().length;
    registerRecipes({ id: 'test-late-shelf', name: 'Late shelf dish', ingredients: [{ name: 'Rice', qty: '1' }] });
    // A caller that held the previous array sees the whole book again, not a
    // stale snapshot that quietly lost the dish.
    expect(allRecipes().length).toBe(before + 1);
    expect(allRecipes()).not.toBe(allRecipes());
  });

  it('registers a food the user created at runtime exactly once', () => {
    const custom = { id: 'test-custom-food', name: 'Test food', per100: { kcal: 100 }, servings: [] };
    registerFood(custom);
    registerFood(custom);
    expect(CATALOGUE.filter((food) => food.id === custom.id).length).toBe(1);
  });
});
