/**
 * One recipe → the shopping rows still needed after trustworthy pantry stock.
 *
 * Recipe detail, imports and other one-off recipe actions should not each make
 * their own decision about aliases, confidence or partial quantities. This
 * helper keeps the button hand-off aligned with the shortfall shown on screen.
 */

import { itemsFromRecipes } from '../data/stores.js';
import { canonicalName, sameIngredient } from './aliases.js';
import { pantryAvailability } from './kitchen.js';
import { mergeQtys } from './pantry.js';
import { shortfallQuantity } from './pantry-intelligence.js';

const reliablePantryRow = (item, today) =>
  ['confirmed_sufficient', 'probably_available'].includes(pantryAvailability(item, today));

/** Read one recipe ingredient against pantry evidence we can actually rely on. */
export const pantryReadForRecipeIngredient = (
  ingredient,
  pantry = [],
  { today = '', learnedAliases = {} } = {},
) => {
  const matches = (Array.isArray(pantry) ? pantry : [])
    .filter((item) => sameIngredient(item?.name, ingredient?.name, learnedAliases));
  const usable = matches.filter((item) => reliablePantryRow(item, today));
  const availableQty = usable.reduce(
    (total, item) => mergeQtys(total, item.qty || '', { ingredient: ingredient?.name || '' }),
    '',
  );
  const shortfallQty = shortfallQuantity(availableQty, ingredient?.qty, { ingredient: ingredient?.name || '' });
  return {
    matches,
    usable,
    availableQty,
    shortfallQty,
    sufficient: usable.length > 0 && !shortfallQty,
  };
};

/**
 * Shopping rows for a single recipe, with the displayed quantity equal to the
 * actual shortfall where the pantry amount can be measured.
 */
export const shoppingItemsForRecipe = (
  recipe,
  pantry = [],
  { today = '', learnedAliases = {} } = {},
) => {
  if (!recipe?.ingredients?.length) return [];
  const needs = [];
  for (const ingredient of recipe.ingredients) {
    const read = pantryReadForRecipeIngredient(ingredient, pantry, { today, learnedAliases });
    if (read.sufficient) continue;
    needs.push({
      ingredient: { ...ingredient, qty: read.shortfallQty || ingredient.qty },
      requiredQty: ingredient.qty,
      pantryQty: read.availableQty,
      shortfallQty: read.shortfallQty,
      pantryTruth: read.usable.length ? 'confirmed_insufficient' : 'unknown',
    });
  }
  if (!needs.length) return [];

  // Same alias awareness as every other Plan → List path: a taught alias
  // must merge rows here exactly as it does on the week list, and the
  // evidence lookup below keys on the learned-aware canonical name.
  const rows = itemsFromRecipes([{ ...recipe, ingredients: needs.map((row) => row.ingredient) }], [], { learnedAliases });
  // Two alias-equivalent spellings collapse into one row, so their evidence
  // must collapse with it: keep one record per canonical ingredient with the
  // quantities merged and both shortfall paths visible.
  const evidence = new Map();
  for (const row of needs) {
    const key = canonicalName(row.ingredient.name, learnedAliases);
    const known = evidence.get(key);
    if (!known) {
      evidence.set(key, row);
      continue;
    }
    evidence.set(key, {
      ...known,
      ingredient: { ...known.ingredient, qty: mergeQtys(known.ingredient.qty, row.ingredient.qty) },
      requiredQty: mergeQtys(known.requiredQty, row.requiredQty),
      pantryQty: known.pantryQty || row.pantryQty,
      shortfallQty: mergeQtys(known.shortfallQty, row.shortfallQty),
      pantryTruth: known.pantryTruth === 'confirmed_insufficient' || row.pantryTruth === 'confirmed_insufficient'
        ? 'confirmed_insufficient'
        : (known.pantryTruth || row.pantryTruth || 'unknown'),
    });
  }
  return rows.map((row) => {
    const proof = evidence.get(canonicalName(row.name, learnedAliases));
    return {
      ...row,
      requiredQty: proof?.requiredQty ?? row.qty,
      pantryQty: proof?.pantryQty || '',
      shortfallQty: proof?.shortfallQty || '',
      pantryTruth: proof?.pantryTruth || 'unknown',
      sourceRecipes: recipe.name ? [recipe.name] : [],
    };
  });
};
