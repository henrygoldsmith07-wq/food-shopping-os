import { describe, expect, it } from 'vitest';
import {
  ALL_RECIPES, cleanFolderName, createFolder, deleteFolder, folderForRecipe, folderNameAvailable,
  folderTabs, FOLDER_LIMIT, forgetRecipe, moveRecipeToFolder, recipesInFolder, renameFolder,
} from '../src/lib/recipe-folders.js';

const recipes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const withFolders = () => {
  let folders = createFolder([], 'Weeknights', { id: 'f1' });
  folders = createFolder(folders, 'Sunday cooking', { id: 'f2' });
  return moveRecipeToFolder(folders, 'a', 'f1');
};

describe('naming a folder', () => {
  it('tidies the whitespace and caps the length', () => {
    expect(cleanFolderName('  Batch   cooking  ')).toBe('Batch cooking');
    expect(cleanFolderName('x'.repeat(60))).toHaveLength(40);
    expect(cleanFolderName(null)).toBe('');
  });

  it('turns a name that is too short, or already taken, down', () => {
    const folders = createFolder([], 'Weeknights', { id: 'f1' });
    expect(folderNameAvailable(folders, 'a')).toBe(false);
    expect(folderNameAvailable(folders, 'weeknights')).toBe(false);
    expect(folderNameAvailable(folders, 'Weekends')).toBe(true);
    // Renaming a folder to what it is already called is allowed.
    expect(folderNameAvailable(folders, 'Weeknights', 'f1')).toBe(true);
  });

  it('treats a duplicate as the folder you already have, not a second one', () => {
    const folders = createFolder([], 'Weeknights', { id: 'f1' });
    expect(createFolder(folders, 'weeknights ', { id: 'f2' })).toBe(folders);
    expect(folders).toHaveLength(1);
  });

  it('stops adding folders past the point the bar can show them', () => {
    let folders = [];
    for (let i = 0; i < FOLDER_LIMIT + 5; i += 1) {
      folders = createFolder(folders, `Folder ${i}`, { id: `f${i}` });
    }
    expect(folders).toHaveLength(FOLDER_LIMIT);
  });
});

describe('renaming and deleting', () => {
  it('renames in place, keeping what is filed there', () => {
    const renamed = renameFolder(withFolders(), 'f1', 'Fast dinners');
    expect(renamed.find((f) => f.id === 'f1').name).toBe('Fast dinners');
    expect(renamed.find((f) => f.id === 'f1').recipeIds).toEqual(['a']);
  });

  it('refuses a rename that collides with another folder', () => {
    const folders = withFolders();
    expect(renameFolder(folders, 'f1', 'Sunday cooking')).toBe(folders);
  });

  it('deletes the folder without deleting the recipes in it', () => {
    const left = deleteFolder(withFolders(), 'f1');
    expect(left.map((f) => f.id)).toEqual(['f2']);
    expect(recipesInFolder(recipes, left, ALL_RECIPES)).toHaveLength(3);
    expect(folderForRecipe(left, 'a')).toBeNull();
  });
});

describe('a recipe lives in one folder', () => {
  it('moves rather than copies', () => {
    const moved = moveRecipeToFolder(withFolders(), 'a', 'f2');
    expect(moved.find((f) => f.id === 'f1').recipeIds).toEqual([]);
    expect(moved.find((f) => f.id === 'f2').recipeIds).toEqual(['a']);
    expect(folderForRecipe(moved, 'a').id).toBe('f2');
  });

  it('unfiles on a null target, and ignores a folder that is not there', () => {
    const unfiled = moveRecipeToFolder(withFolders(), 'a', null);
    expect(folderForRecipe(unfiled, 'a')).toBeNull();
    const folders = withFolders();
    expect(moveRecipeToFolder(folders, 'a', 'nope')).toBe(folders);
    expect(moveRecipeToFolder(folders, '', 'f1')).toBe(folders);
  });

  it('is a no-op when the recipe is already where it is being put', () => {
    const folders = withFolders();
    expect(moveRecipeToFolder(folders, 'a', 'f1')).toBe(folders);
  });

  it('forgets a deleted recipe everywhere', () => {
    const folders = forgetRecipe(withFolders(), 'a');
    expect(folders.every((f) => !f.recipeIds.includes('a'))).toBe(true);
  });
});

describe('filtering the list', () => {
  it('shows everything for "all recipes"', () => {
    expect(recipesInFolder(recipes, withFolders(), ALL_RECIPES)).toHaveLength(3);
  });

  it('shows only what is filed in the chosen folder', () => {
    expect(recipesInFolder(recipes, withFolders(), 'f1').map((r) => r.id)).toEqual(['a']);
    expect(recipesInFolder(recipes, withFolders(), 'f2')).toEqual([]);
  });

  it('gathers what has never been filed under "unfiled"', () => {
    expect(recipesInFolder(recipes, withFolders(), 'unfiled').map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('counts only recipes that still exist', () => {
    const folders = moveRecipeToFolder(withFolders(), 'deleted-recipe', 'f2');
    const tabs = folderTabs(recipes, folders);
    expect(tabs[0]).toMatchObject({ id: ALL_RECIPES, name: 'All recipes', count: 3 });
    expect(tabs.find((t) => t.id === 'f2').count).toBe(0);
    expect(tabs.find((t) => t.id === 'unfiled').count).toBe(2);
  });

  it('leaves "unfiled" out until there are folders and something outside them', () => {
    expect(folderTabs(recipes, []).map((t) => t.id)).toEqual([ALL_RECIPES]);
    const everythingFiled = ['a', 'b', 'c'].reduce(
      (folders, id) => moveRecipeToFolder(folders, id, 'f1'),
      createFolder([], 'Weeknights', { id: 'f1' }),
    );
    expect(folderTabs(recipes, everythingFiled).map((t) => t.id)).toEqual([ALL_RECIPES, 'f1']);
  });
});
