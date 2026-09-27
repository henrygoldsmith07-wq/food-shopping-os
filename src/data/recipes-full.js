/**
 * The lazily loaded recipe shelves — the hand-written expansion shelves.
 *
 * `recipes.js` ships the signature dishes and the whole generated book in the
 * first paint, because that is the pool planning draws from. This module holds
 * the hand-written shelves and appends them onto the SAME live `RECIPES` array,
 * so once it has loaded every browse, search and planner sees the complete
 * library exactly as before the split, with no changes at the call sites. First
 * registration wins, so ids stay unique.
 */

import { registerRecipes } from './recipes.js';

import { RECIPES_DOUBLE } from './recipes-double.js';
import { MASTER_RECIPE_EXPANSION } from './master-recipe-expansion.js';
import { MORE_RECIPES } from './more-recipes.js';
import { MORE_RECIPES_TWO } from './more-recipes-two.js';
import { MORE_RECIPES_THREE } from './more-recipes-three.js';

const SHELVES = [
  RECIPES_DOUBLE,
  MASTER_RECIPE_EXPANSION,
  MORE_RECIPES,
  MORE_RECIPES_TWO,
  MORE_RECIPES_THREE,
];

/** The dishes this module adds to the book. Loading is a side effect of import. */
export const FULL_RECIPES = SHELVES.flatMap((shelf) => registerRecipes(shelf));
