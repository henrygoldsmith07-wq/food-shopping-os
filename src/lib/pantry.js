/**
 * Pantry quantity maths: parsing, package-size normalisation, summing and
 * comparison.
 *
 * The pantry stores quantities as free text ("2 tins", "400 g", "3 x 200g",
 * "½ lemon"). That is right for display, but the app can only be honest about
 * "do I have enough" when it can put two quantities on the same scale.
 *
 * The reading itself now lives in `measure.js`, which is the one parser the
 * whole app shares — this module is the pantry's view of it: the same
 * questions it always answered, with the answers no longer coming from a
 * private regex that disagreed with the rest of the app. Pass `ingredient` (a
 * canonical name) wherever you have one: it is what lets "1 tin" of coconut
 * milk read as 400 ml instead of a generic 400 g, and stops a volume being
 * compared against a mass.
 */

import {
  addQuantities, formatQuantity, parseQuantity, sufficientFor,
} from './measure.js';
import { GENERIC_PACKAGES, INGREDIENT_PACKAGES, packageSize } from '../data/package-sizes.js';

const clean = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Everyday package sizes, in grams — kept as a flat table for the callers and
 * tests that ask "how big is a tin?". The full picture, including packages
 * measured in millilitres or in items, is in `data/package-sizes.js`.
 */
export const PACKAGE_GRAMS = Object.fromEntries(
  Object.entries(GENERIC_PACKAGES)
    .filter(([, size]) => size.dim === 'mass')
    .flatMap(([unit, size]) => [[unit, size.amount], [`${unit}s`, size.amount]]),
);

export { INGREDIENT_PACKAGES, packageSize };

/** The parsed quantity in the shape the pantry has always used. */
const toLegacy = (parsed) => {
  if (!parsed) return null;
  const base = { amount: parsed.amount, unit: parsed.dim === 'count' ? 'count' : parsed.unit, raw: parsed.raw };
  if (parsed.dim === 'count') return { ...base, countUnit: parsed.unit };
  if (parsed.pack) {
    return { ...base, packed: { count: parsed.pack.count, amount: parsed.pack.size, unit: parsed.pack.unit } };
  }
  if (parsed.count) {
    return { ...base, count: { amount: parsed.count.amount, unit: parsed.count.unit, grams: parsed.count.size } };
  }
  return base;
};

/**
 * One quantity → a comparable shape.
 * Returns { amount, unit: 'g'|'ml'|'count', countUnit?, raw } or null when the
 * text cannot be trusted on a scale.
 */
export const parseQtyAmount = (qty, options = {}) => toLegacy(parseQuantity(qty, options));

/** The richer reading, with dimension and confidence, for code that wants it. */
export const readQty = (qty, options = {}) => parseQuantity(qty, options);

/**
 * Merge two quantity strings ("600 g" + "400 g" → "1 kg"; "2 tins" + "1 pack"
 * of tomatoes → "1.2 kg"). Anything it can't put on the same scale is kept as
 * "a + b" rather than silently dropped.
 */
export const mergeQtys = (qtyA, qtyB, options = {}) => {
  const a = clean(qtyA);
  const b = clean(qtyB);
  if (!a) return qtyB || '';
  if (!b) return qtyA || '';
  const summed = addQuantities(a, b, options);
  if (!summed) return `${a} + ${b}`;
  return formatQuantity(summed);
};

/**
 * Does `have` cover `need`? Both must parse onto the same scale; otherwise the
 * answer is null ("can't tell") — never a confident guess.
 */
export const qtySuffices = (have, need, options = {}) => sufficientFor(have, need, options);

/**
 * A short, honest label for what the app knows about a quantity:
 * 'exact' for a stated measurement or a package size we are sure of,
 * 'approximate' for a hedge, a range or a generic package average,
 * 'unknown' when there is no readable quantity at all.
 */
export const qtyConfidence = (qty, options = {}) => {
  const parsed = parseQuantity(qty, options);
  if (!parsed) return 'unknown';
  return parsed.confidence;
};
