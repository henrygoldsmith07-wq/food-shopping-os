/**
 * The reference-list cache, on the promise that it is only a cache.
 *
 * `deriveApp` reads two six-thousand-row lists on every state change. The
 * cache exists so it stops copying them. What matters is that the copy it
 * returns is *the same list*, including in the two cases a naive cache gets
 * wrong:
 *
 *   - the shared arrays are live, so a lazily loaded shelf appends to them in
 *     place — same identity, new length, and the new rows must appear;
 *   - the household's own foods and recipes are replaced on every write, so a
 *     new one must appear immediately.
 *
 * If any of those regressed the app would quietly show a half-loaded recipe
 * book or forget a custom food, which is exactly the kind of bug that only
 * shows up in someone's kitchen weeks later.
 */

import { describe, expect, it } from 'vitest';
import {
  clearReferenceCaches, combinedCatalogue, combinedRecipes,
} from '../src/lib/reference-data.js';

const shared = [{ id: 'a' }, { id: 'b' }];

describe('the reference-list cache', () => {
  it('produces exactly what a plain concatenation would', () => {
    clearReferenceCaches();
    const own = [{ id: 'mine' }];
    expect(combinedCatalogue(shared, own)).toEqual([...shared, ...own]);
    expect(combinedRecipes(shared, own)).toEqual([...shared, ...own]);
  });

  it('returns the same list when nothing changed', () => {
    clearReferenceCaches();
    const own = [{ id: 'mine' }];
    const first = combinedCatalogue(shared, own);
    // Identity, not equality: the point is that nothing was rebuilt.
    expect(combinedCatalogue(shared, own)).toBe(first);
  });

  it('returns the shared array itself when the household has added nothing', () => {
    clearReferenceCaches();
    // No copy at all in the common case — the shared array is already correct.
    expect(combinedCatalogue(shared, [])).toBe(shared);
    expect(combinedRecipes(shared, [])).toBe(shared);
  });

  it('picks up a household food added after the first call', () => {
    clearReferenceCaches();
    const first = [{ id: 'mine-1' }];
    const before = combinedCatalogue(shared, first);
    expect(before.map((row) => row.id)).toEqual(['a', 'b', 'mine-1']);
    // A new write replaces the array; the cache must not keep the old one.
    const after = combinedCatalogue(shared, [...first, { id: 'mine-2' }]);
    expect(after.map((row) => row.id)).toEqual(['a', 'b', 'mine-1', 'mine-2']);
  });

  it('picks up a lazily loaded shelf appended in place', () => {
    clearReferenceCaches();
    // The live book grows in place: same array identity, new length. This is
    // the case an identity-only cache would miss, hiding the long tail.
    const before = combinedRecipes(shared, []);
    expect(before).toHaveLength(2);
    shared.push({ id: 'c' });
    const after = combinedRecipes(shared, []);
    expect(after).toHaveLength(3);
    expect(after.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    // Restore, so the next test starts from the documented starting point.
    shared.pop();
  });

  it('keeps the catalogue and the recipe book apart', () => {
    clearReferenceCaches();
    const catalogue = combinedCatalogue(shared, [{ id: 'a-food' }]);
    const recipes = combinedRecipes(shared, [{ id: 'a-recipe' }]);
    expect(catalogue).not.toBe(recipes);
    expect(catalogue.at(-1).id).toBe('a-food');
    expect(recipes.at(-1).id).toBe('a-recipe');
  });
});
