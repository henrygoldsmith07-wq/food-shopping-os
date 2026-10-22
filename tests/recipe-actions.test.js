import { describe, it, expect } from 'vitest';
import { recipeActions } from '../src/lib/recipe-actions.js';

// Minimal store: set() accepts a patch or an updater, like zustand.
const makeStore = (init = {}) => {
  let state = {
    day: '2026-10-21', myRecipes: [], favourites: [], recipeFolders: [], recipeCollections: [],
    recipeRatings: {}, tasteRatings: {}, members: [], activeMemberId: null, ...init,
  };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { actions: recipeActions(set), get: () => state };
};

describe('recipe book actions', () => {
  it('gives a re-saved recipe a fresh unique id, even after removals', () => {
    const { actions, get } = makeStore();
    actions.saveRecipe({ id: 'soup', name: 'Soup' });
    actions.saveRecipe({ id: 'soup', name: 'Soup' });
    actions.saveRecipe({ id: 'soup', name: 'Soup' });
    actions.removeRecipe('soup');
    actions.saveRecipe({ id: 'soup', name: 'Soup' });
    const ids = get().myRecipes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
  });

  it('removing a recipe clears favourites, collections and ratings', () => {
    const { actions, get } = makeStore({
      myRecipes: [{ id: 'a' }], favourites: ['a', 'b'],
      recipeCollections: [{ id: 'c', name: 'Quick', recipeIds: ['a', 'b'] }],
      recipeRatings: { a: 4, b: 5 }, tasteRatings: { a: 'love' },
    });
    actions.removeRecipe('a');
    const s = get();
    expect(s.myRecipes).toEqual([]);
    expect(s.favourites).toEqual(['b']);
    expect(s.recipeCollections[0].recipeIds).toEqual(['b']);
    expect(s.recipeRatings).toEqual({ b: 5 });
    expect(s.tasteRatings).toEqual({});
  });

  it('rating validates the score and rounds it', () => {
    const { actions, get } = makeStore();
    actions.rateRecipe('a', 0);
    actions.rateRecipe('a', 6);
    actions.rateRecipe('', 3);
    expect(get().recipeRatings).toEqual({});
    actions.rateRecipe('a', 3.6);
    expect(get().recipeRatings).toEqual({ a: 4 });
  });

  it('taste verdicts: like favourites, nope unfavourites, junk is ignored', () => {
    const { actions, get } = makeStore();
    actions.rateRecipeTaste('a', 'love');
    expect(get().favourites).toEqual(['a']);
    actions.rateRecipeTaste('a', 'like');
    expect(get().favourites).toEqual(['a']);
    actions.rateRecipeTaste('a', 'maybe');
    expect(get().tasteRatings.a).toBe('like');
    actions.rateRecipeTaste('a', 'nope');
    expect(get().favourites).toEqual([]);
  });

  it('collections: short names rejected, same name reused case-insensitively', () => {
    const { actions, get } = makeStore();
    actions.createRecipeCollection('x');
    expect(get().recipeCollections).toEqual([]);
    actions.createRecipeCollection('Batch', 'r1');
    actions.createRecipeCollection('batch', 'r2');
    actions.createRecipeCollection('BATCH', 'r2');
    expect(get().recipeCollections).toHaveLength(1);
    expect(get().recipeCollections[0].recipeIds).toEqual(['r1', 'r2']);
    const id = get().recipeCollections[0].id;
    actions.toggleRecipeCollection(id, 'r1');
    expect(get().recipeCollections[0].recipeIds).toEqual(['r2']);
  });

  it('a member without the recipes permission cannot edit the book', () => {
    const { actions, get } = makeStore({
      members: [{ id: 'm', role: 'child', permissions: { recipes: false } }], activeMemberId: 'm',
      myRecipes: [{ id: 'a' }],
    });
    actions.saveRecipe({ id: 'b' });
    actions.removeRecipe('a');
    actions.toggleFavourite('a');
    actions.rateRecipe('a', 5);
    actions.createRecipeCollection('Dinners');
    expect(get().myRecipes).toEqual([{ id: 'a' }]);
    expect(get().favourites).toEqual([]);
    expect(get().recipeRatings).toEqual({});
    expect(get().recipeCollections).toEqual([]);
  });
});
