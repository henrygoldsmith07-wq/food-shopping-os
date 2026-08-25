/**
 * Everything the app does to the recipe book: saving, favouriting, rating, and
 * the two ways of organising a growing library.
 *
 * Collections and folders answer different questions and are kept apart on
 * purpose. A collection is a tag — "batch cooking", "things Ana likes" — and a
 * recipe can be in several. A folder is where a recipe lives, so it is in at
 * most one, and moving it is a move rather than a second membership.
 *
 * Every write goes through the household recipe permission first: a member
 * without it can browse and cook, but the book is not theirs to edit.
 */

import { householdPermission } from './household.js';
import {
  createFolder, deleteFolder, forgetRecipe, moveRecipeToFolder, renameFolder,
} from './recipe-folders.js';
import { uid } from './state.js';

export const recipeActions = (set) => ({
  saveRecipe: (recipe) =>
    set((s) => {
      if (!householdPermission(s, 'recipes')) return {};
      const id = s.myRecipes.some((r) => r.id === recipe.id) ? `${recipe.id}-${s.myRecipes.length + 1}` : recipe.id;
      return { myRecipes: [...s.myRecipes, { ...recipe, id, savedAt: s.day }] };
    }),
  removeRecipe: (id) =>
    set((s) => (householdPermission(s, 'recipes') ? {
      myRecipes: s.myRecipes.filter((r) => r.id !== id),
      favourites: s.favourites.filter((f) => f !== id),
      recipeFolders: forgetRecipe(s.recipeFolders, id),
      recipeCollections: s.recipeCollections.map((collection) => ({
        ...collection,
        recipeIds: collection.recipeIds.filter((recipeId) => recipeId !== id),
      })),
      recipeRatings: Object.fromEntries(Object.entries(s.recipeRatings).filter(([recipeId]) => recipeId !== id)),
      tasteRatings: Object.fromEntries(Object.entries(s.tasteRatings).filter(([recipeId]) => recipeId !== id)),
    } : {})),
  toggleFavourite: (id) =>
    set((s) => (householdPermission(s, 'recipes') ? {
      favourites: s.favourites.includes(id)
        ? s.favourites.filter((x) => x !== id)
        : [...s.favourites, id],
    } : {})),
  rateRecipeTaste: (id, verdict) =>
    set((s) => {
      if (!householdPermission(s, 'recipes') || !id || !['nope', 'like', 'love'].includes(verdict)) return {};
      const liked = verdict === 'like' || verdict === 'love';
      return {
        tasteRatings: { ...s.tasteRatings, [id]: verdict },
        favourites: liked
          ? [...new Set([...s.favourites, id])]
          : s.favourites.filter((recipeId) => recipeId !== id),
      };
    }),
  resetRecipeTaste: () => set({ tasteRatings: {} }),
  createRecipeCollection: (name, recipeId = null) =>
    set((s) => {
      if (!householdPermission(s, 'recipes')) return {};
      const clean = String(name || '').trim().slice(0, 40);
      if (clean.length < 2) return {};
      const existing = s.recipeCollections.find((collection) => collection.name.toLowerCase() === clean.toLowerCase());
      if (existing) {
        if (!recipeId || existing.recipeIds.includes(recipeId)) return {};
        return {
          recipeCollections: s.recipeCollections.map((collection) => (
            collection.id === existing.id
              ? { ...collection, recipeIds: [...collection.recipeIds, recipeId] }
              : collection
          )),
        };
      }
      return {
        recipeCollections: [...s.recipeCollections, {
          id: uid('rc'),
          name: clean,
          recipeIds: recipeId ? [recipeId] : [],
          createdAt: s.day,
        }],
      };
    }),
  removeRecipeCollection: (id) =>
    set((s) => (householdPermission(s, 'recipes')
      ? { recipeCollections: s.recipeCollections.filter((collection) => collection.id !== id) }
      : {})),
  toggleRecipeCollection: (collectionId, recipeId) =>
    set((s) => {
      if (!householdPermission(s, 'recipes') || !recipeId) return {};
      return {
        recipeCollections: s.recipeCollections.map((collection) => {
          if (collection.id !== collectionId) return collection;
          return {
            ...collection,
            recipeIds: collection.recipeIds.includes(recipeId)
              ? collection.recipeIds.filter((id) => id !== recipeId)
              : [...collection.recipeIds, recipeId],
          };
        }),
      };
    }),
  /* ---------- Folders: one shelf per recipe ---------- */
  createRecipeFolder: (name, recipeId = null) =>
    set((s) => {
      if (!householdPermission(s, 'recipes')) return {};
      const folders = createFolder(s.recipeFolders, name, { id: uid('rf'), createdAt: s.day });
      if (folders === s.recipeFolders) return {};
      const created = folders.at(-1);
      return {
        recipeFolders: recipeId
          ? moveRecipeToFolder(folders, recipeId, created.id)
          : folders,
      };
    }),
  renameRecipeFolder: (id, name) =>
    set((s) => {
      if (!householdPermission(s, 'recipes')) return {};
      const folders = renameFolder(s.recipeFolders, id, name);
      return folders === s.recipeFolders ? {} : { recipeFolders: folders };
    }),
  // Deleting a folder unfiles what was in it; the recipes themselves stay.
  removeRecipeFolder: (id) =>
    set((s) => (householdPermission(s, 'recipes')
      ? { recipeFolders: deleteFolder(s.recipeFolders, id) }
      : {})),
  moveRecipeToFolder: (recipeId, folderId) =>
    set((s) => {
      if (!householdPermission(s, 'recipes')) return {};
      const folders = moveRecipeToFolder(s.recipeFolders, recipeId, folderId || null);
      return folders === s.recipeFolders ? {} : { recipeFolders: folders };
    }),
  rateRecipe: (id, rating) =>
    set((s) => {
      if (!householdPermission(s, 'recipes')) return {};
      const score = Math.round(Number(rating));
      if (!id || score < 1 || score > 5) return {};
      return { recipeRatings: { ...s.recipeRatings, [id]: score } };
    }),
});
