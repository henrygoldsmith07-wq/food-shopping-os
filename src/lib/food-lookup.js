/**
 * Looking things up in the food book.
 *
 * Two responsibilities, both of which used to sit in `state.js` and drag the
 * whole catalogue into the app's first paint:
 *
 *  1. The two derived helpers that need the book — an emoji for a typed-in
 *     item, and the recently-logged foods for quick add.
 *  2. Id lookup. `find` over 3,800 rows is cheap once and ruinous in a render
 *     loop: the diary resolves entries, the planner resolves slots, and each
 *     was scanning the entire book every time. A Map built once per catalogue
 *     version answers the same question in constant time.
 *
 * The index is rebuilt when the catalogue *length* changes — the one moment a
 * new wave has landed — rather than on a timer, so it can never go stale
 * against a book that hasn't moved. Callers keep passing arrays in; the index
 * is transparent.
 */

import { CATALOGUE } from '../data/foods.js';
import { searchFoods } from './foodlog.js';
import { foodFromEntry } from './state.js';

/* ---------- Id indexes -------------------------------------------------- */

const indexes = new Map();

/**
 * A Map of id → row for `catalogue`, cached per array identity. Rebuilt when
 * the array has grown (a lazily loaded wave arrived), because that is the only
 * way the live book changes.
 */
const indexFor = (catalogue) => {
  const cached = indexes.get(catalogue);
  if (cached && cached.size === catalogue.length) return cached.map;
  const map = new Map();
  for (const food of catalogue) {
    if (food?.id && !map.has(food.id)) map.set(food.id, food);
  }
  indexes.set(catalogue, { size: catalogue.length, map });
  return map;
};

/** The catalogue row with this id, or null. O(1) after the first call. */
export const foodById = (id, catalogue = CATALOGUE) =>
  (id ? indexFor(catalogue).get(id) ?? null : null);

/** A logged entry re-read as a food, preferring the catalogue's own row. */
export const foodForEntry = (entry, catalogue = CATALOGUE) =>
  foodById(entry?.foodId, catalogue) || (entry?.per100 ? foodFromEntry(entry) : null);

/* ---------- Derived helpers --------------------------------------------- */

/**
 * Most recently logged foods, newest first, one row per food. A logged row
 * whose food is no longer in the book still appears, rebuilt from the entry —
 * recents must survive a catalogue edit.
 */
export const recentFoodsFrom = (log = {}, catalogue = CATALOGUE, limit = 24) => {
  const byId = indexFor(catalogue);
  const days = Object.keys(log).sort().reverse();
  const seen = new Set();
  const out = [];
  for (const day of days) {
    for (const e of [...(log[day] || [])].reverse()) {
      if (!e.foodId || seen.has(e.foodId)) continue;
      seen.add(e.foodId);
      const food = byId.get(e.foodId) || (e.per100 ? foodFromEntry(e) : null);
      if (food) out.push(food);
      if (out.length >= limit) return out;
    }
  }
  return out;
};

/**
 * An emoji for a typed-in item, borrowed from the food catalogue when it
 * matches. The catalogue is a nicety here, not a dependency: a miss falls back
 * to the plate, so this stays correct with any catalogue at all.
 */
export const emojiFor = (name) => searchFoods(name, CATALOGUE, 1)[0]?.emoji || '🍽️';
