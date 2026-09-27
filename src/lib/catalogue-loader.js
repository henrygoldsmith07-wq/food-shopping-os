/**
 * The catalogue loader — the recipe shelves that don't ship in the first paint.
 *
 * The book is two tiers, but they are not symmetrical, and the difference is
 * the product hierarchy:
 *
 *   - `data/foods.js` ships whole. Matching a spoken sentence, reading a
 *     photographed plate, scanning a barcode and searching the catalogue are
 *     all core-loop actions, so every food has to be answerable from the
 *     first second, offline, with no fetch in between.
 *   - `data/recipes.js` ships the signature dishes and the whole generated
 *     book — the pool planning draws from, so generating a plan, shopping it
 *     and cooking it never wait on anything. The hand-written expansion
 *     shelves are browse-time depth and load separately.
 *
 * `recipes-full.js` appends onto the same live `RECIPES` array the eager tier
 * uses, so after a load every browse, search and planner sees one seamless
 * library with no changes at the call sites. Before it, they see the core —
 * never a hole. It is a local module fetch, not a network service, so the
 * app never loses data when a device is offline.
 *
 * A failed load must not look like a complete book and must not break the
 * app: the promise resets so a later call retries, and the core book stands.
 */

let loadPromise = null;

/**
 * Load the long tail of the recipe book once. Resolves with how many dishes it
 * added; every later call returns the same promise.
 */
export const ensureFullCatalogue = () => {
  if (!loadPromise) {
    loadPromise = import('../data/recipes-full.js')
      .then((recipesFull) => ({ recipes: recipesFull.FULL_RECIPES.length }))
      .catch((error) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
};

/** True once the long tail has landed, false while it is loading or failed. */
export const fullCatalogueReady = async () => {
  if (!loadPromise) return false;
  try {
    await loadPromise;
    return true;
  } catch {
    return false;
  }
};
