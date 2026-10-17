import { partByName } from '../data/recipe-parts.js';

/**
 * How much the app can trust a dish's nutrition. A catalogue or label figure
 * is 'label'; one computed from matched ingredients is 'estimated' with the
 * matched share; a recipe with no ingredient match at all is 'unknown'.
 */
export const nutritionConfidence = (recipe) => {
  if (!recipe) return { kind: 'unknown', label: 'Unknown — no nutrition recorded.' };
  const matched = recipe.ingredients && recipe.ingredients.length
    ? Math.round((recipe.ingredients.filter((i) => partByName(i.name)).length / recipe.ingredients.length) * 100)
    : 0;
  // Ingredients inferred from the name: "100% matched" would overstate it.
  if (recipe.nutritionStatus === 'estimated-from-ingredients') return { kind: 'estimated', label: 'Rough estimate — worked out from typical ingredients for a dish of this name, not a tested recipe.' };
  if (recipe.signature || recipe.per100 || recipe.nutritionSource === 'label') {
    return { kind: 'label', label: 'From the recipe book / label — a stated figure, not an estimate.' };
  }
  if (matched >= 70) {
    return { kind: 'estimated', label: `Estimated from ingredients (${matched}% matched to food tables).` };
  }
  if (matched > 0) {
    return { kind: 'estimated', label: `Roughly estimated — only ${matched}% of ingredients matched food tables.` };
  }
  return { kind: 'unknown', label: 'Unknown — no ingredient nutrition was matched.' };
};
