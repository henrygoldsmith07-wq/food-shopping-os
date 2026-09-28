/**
 * Caching the two arrays every derived number is read from.
 *
 * `deriveApp` runs on every state change and rebuilds its two reference lists:
 * the food catalogue plus the household's own foods, and the recipe book plus
 * the household's own recipes. Those are 3,800 and 2,200 rows — about six
 * thousand elements copied on every keystroke that changes state, only for the
 * result to be read by a dozen functions that each then walk it.
 *
 * The lists only change when the household adds something, or when a lazily
 * loaded shelf lands and the shared array grows. Both are observable without
 * deep comparison: the household arrays are replaced on every write, and the
 * shared ones only ever grow. So a cache keyed on both identities is exact, and
 * a run where nothing changed does no copying at all.
 *
 * This is a cache, not a source of truth: the first call in a run builds the
 * list, and the list is the same one the previous code produced. Dropping this
 * would change no result, only how much work producing one costs.
 */

/** Cached list per (shared, own) identity pair. One entry is enough in practice. */
const cache = new Map();

const keyOf = (shared, own) => `${shared.length}:${shared.length > 0 ? shared[0] : ''}:${own.length}`;

/**
 * `shared` concatenated with `own`, rebuilt only when either changes.
 *
 * The length is part of the key because the shared arrays are live: a lazily
 * loaded shelf appends to them in place, so a new row is a new length with the
 * same identity. That is the one case a naive identity cache would miss, and
 * missing it would quietly hide half the recipe book.
 */
export const combinedCatalogue = (shared, own) => {
  const key = keyOf(shared, own);
  const hit = cache.get('catalogue');
  if (hit && hit.key === key && hit.shared === shared && hit.own === own) return hit.value;
  const value = own.length ? [...shared, ...own] : shared;
  cache.set('catalogue', { key, shared, own, value });
  return value;
};

/** The same, for the recipe book. */
export const combinedRecipes = (shared, own) => {
  const key = keyOf(shared, own);
  const hit = cache.get('recipes');
  if (hit && hit.key === key && hit.shared === shared && hit.own === own) return hit.value;
  const value = own.length ? [...shared, ...own] : shared;
  cache.set('recipes', { key, shared, own, value });
  return value;
};

/** Drop the cache. Only a test needs this; nothing in the app invalidates it. */
export const clearReferenceCaches = () => cache.clear();
