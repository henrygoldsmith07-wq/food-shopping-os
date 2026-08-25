/**
 * Recipe folders: one shelf per recipe.
 *
 * Collections already let a recipe belong to several lists at once, which is
 * what tagging is for. Folders are the other thing people ask for — a place a
 * recipe *lives*. So a recipe is in at most one folder, moving it out of one
 * puts it in another, and "All recipes" is not a folder but the absence of a
 * filter.
 *
 * The assignments live inside the folders themselves (`recipeIds`) rather than
 * in a second map, so there is one place to read from and one place to write
 * to, and a folder can never disagree with an index about what it contains.
 *
 * Everything here is pure: it takes the folder list and returns a new one.
 */

export const FOLDER_NAME_MAX = 40;
export const FOLDER_NAME_MIN = 2;
/** More than this and the folder bar stops being a way to find anything. */
export const FOLDER_LIMIT = 40;

/** The pseudo-folder the recipe list starts on. Never stored. */
export const ALL_RECIPES = '';

export const cleanFolderName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, FOLDER_NAME_MAX);

const sameName = (a, b) => a.toLowerCase() === String(b || '').toLowerCase();

/** A name that is long enough, and not already taken by another folder. */
export const folderNameAvailable = (folders = [], name, exceptId = null) => {
  const clean = cleanFolderName(name);
  if (clean.length < FOLDER_NAME_MIN) return false;
  return !folders.some((folder) => folder.id !== exceptId && sameName(clean, folder.name));
};

export const folderById = (folders = [], id) => folders.find((folder) => folder.id === id) || null;

/** The folder a recipe lives in, or null for one that has never been filed. */
export const folderForRecipe = (folders = [], recipeId) =>
  folders.find((folder) => folder.recipeIds.includes(recipeId)) || null;

/**
 * Add a folder. A duplicate name is not an error and not a second folder —
 * it is the folder you already have, returned unchanged.
 */
export const createFolder = (folders = [], name, { id, createdAt = '' } = {}) => {
  const clean = cleanFolderName(name);
  if (clean.length < FOLDER_NAME_MIN) return folders;
  if (folders.length >= FOLDER_LIMIT) return folders;
  if (folders.some((folder) => sameName(clean, folder.name))) return folders;
  return [...folders, { id: id || `rf-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: clean, recipeIds: [], createdAt }];
};

export const renameFolder = (folders = [], id, name) => {
  if (!folderNameAvailable(folders, name, id)) return folders;
  const clean = cleanFolderName(name);
  return folders.map((folder) => (folder.id === id ? { ...folder, name: clean } : folder));
};

/**
 * Delete a folder. The recipes in it are not deleted with it — they go back to
 * being unfiled, which is where they were before the folder existed.
 */
export const deleteFolder = (folders = [], id) => folders.filter((folder) => folder.id !== id);

/**
 * Put a recipe in a folder, taking it out of whichever one it was in.
 * A null or unknown target folder unfiles it.
 */
export const moveRecipeToFolder = (folders = [], recipeId, folderId) => {
  if (!recipeId) return folders;
  const target = folderId ? folderById(folders, folderId) : null;
  if (folderId && !target) return folders;
  const current = folderForRecipe(folders, recipeId);
  if (current?.id === folderId) return folders;
  return folders.map((folder) => {
    if (folder.id === folderId) return { ...folder, recipeIds: [...folder.recipeIds, recipeId] };
    if (!folder.recipeIds.includes(recipeId)) return folder;
    return { ...folder, recipeIds: folder.recipeIds.filter((id) => id !== recipeId) };
  });
};

/** Drop a recipe from every folder — for when the recipe itself is deleted. */
export const forgetRecipe = (folders = [], recipeId) =>
  folders.map((folder) => (folder.recipeIds.includes(recipeId)
    ? { ...folder, recipeIds: folder.recipeIds.filter((id) => id !== recipeId) }
    : folder));

/**
 * The recipes to show for a folder selection.
 *
 * `ALL_RECIPES` shows everything, which is why it is the empty string rather
 * than an id: no folder selected, no filter applied.
 */
export const recipesInFolder = (recipes = [], folders = [], folderId = ALL_RECIPES) => {
  if (!folderId) return recipes;
  if (folderId === 'unfiled') {
    const filed = new Set(folders.flatMap((folder) => folder.recipeIds));
    return recipes.filter((recipe) => !filed.has(recipe.id));
  }
  const folder = folderById(folders, folderId);
  if (!folder) return recipes;
  const ids = new Set(folder.recipeIds);
  return recipes.filter((recipe) => ids.has(recipe.id));
};

/**
 * Folders with a live count of the recipes actually present, plus the two
 * standing entries the bar always shows: everything, and what is unfiled.
 *
 * The count is of recipes that still exist, so a folder holding ids for
 * deleted recipes reads as empty rather than as full of ghosts.
 */
export const folderTabs = (recipes = [], folders = []) => {
  const present = new Set(recipes.map((recipe) => recipe.id));
  const filed = new Set(folders.flatMap((folder) => folder.recipeIds.filter((id) => present.has(id))));
  return [
    { id: ALL_RECIPES, name: 'All recipes', count: recipes.length, standing: true },
    ...folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      count: folder.recipeIds.filter((id) => present.has(id)).length,
      standing: false,
    })),
    ...(filed.size < recipes.length && folders.length
      ? [{ id: 'unfiled', name: 'Unfiled', count: recipes.length - filed.size, standing: true }]
      : []),
  ];
};
