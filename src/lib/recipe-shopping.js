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

  const rows = itemsFromRecipes([{ ...recipe, ingredients: needs.map((row) => row.ingredient) }], []);
  const evidence = new Map(needs.map((row) => [
    canonicalName(row.ingredient.name, learnedAliases),
    row,
  ]));
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
