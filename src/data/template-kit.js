/**
 * The small vocabulary every template file is written in.
 *
 * Kept apart from the templates themselves so the three meal files can share
 * it without importing each other.
 */

export const low = (s) => s.toLowerCase();

/** Named components from a group, in the order given. */
export const pick = (obj, keys) => keys.map((k) => obj[k]);

/** Every component in a group. */
export const all = (obj) => Object.values(obj);

/** Identity, but it names what the object is and keeps the arrays readable. */
export const T = (config) => config;
