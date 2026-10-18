/**
 * What to pick up, as opposed to what the recipe uses.
 *
 * A recipe scaled to the household says "0.7 peppers" or "0.7 tsp smoked
 * paprika"; nobody can buy either. The list keeps the recipe's figure as the
 * row's need ("Need 0.7 tsp") and this turns the amount to buy into something
 * a shop sells: a whole pepper, a jar of paprika, a bulb of garlic. Weights
 * and larger volumes are left alone — "400 g" is already buyable.
 */

import { guessAisle } from '../data/stores.js';

const SPOONS = /^(tsps?|teaspoons?|tbsps?|tablespoons?|pinch(es)?|dash(es)?)$/i;
const MEASURES = /^(g|grams?|kg|ml|millilitres?|l|litres?|oz|lb)$/i;
/** Small volumes are a container's worth of a condiment, not a purchase. */
const SMALL_ML = 150;

/** Count words a shop sells by something bigger. */
const COUNT_PACKAGES = {
  square: 'bar', squares: 'bar',
  clove: 'bulb', cloves: 'bulb',
  thumb: 'piece', thumbs: 'piece',
  sprig: 'bunch', sprigs: 'bunch',
  leaf: 'bunch', leaves: 'bunch',
};

/** Fresh produce measured by the spoon is still bought whole. */
const PRODUCE_UNITS = [
  [/lemon juice/i, 'lemon'],
  [/lime juice/i, 'lime'],
  [/garlic/i, 'bulb'],
  [/ginger/i, 'piece'],
  [/coriander|parsley|basil|mint|dill|chives|thyme|rosemary/i, 'bunch'],
];

/** Singular forms for count words, so a rounded-up 1 reads "1 head". */
const SINGULAR = {
  heads: 'head', fillets: 'fillet', thighs: 'thigh', breasts: 'breast', slices: 'slice',
  sticks: 'stick', stalks: 'stalk', sheets: 'sheet', pieces: 'piece', tins: 'tin', cans: 'can',
  packs: 'pack', bags: 'bag', bunches: 'bunch', balls: 'ball', nests: 'nest',
};

const containerFor = (name) =>
  (/oil|vinegar|sauce|syrup|juice|extract|essence|wine/i.test(name) ? 'bottle' : 'jar');

/**
 * @param {string} qty  the amount the recipe needs, e.g. "0.7 tsp"
 * @param {string} name the ingredient
 * @returns {string} the amount to buy; `qty` unchanged when it is already buyable
 */
export function shoppableQty(qty, name = '') {
  const text = String(qty || '').trim();
  const match = text.match(/^(\d{1,3}(?:,\d{3})+(?!\d)|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return text;
  // "1,500" is fifteen hundred; "1,5" is a European one and a half.
  const amount = Number(/^\d{1,3}(,\d{3})+$/.test(match[1]) ? match[1].replace(/,/g, '') : match[1].replace(',', '.'));
  const unit = match[2].trim();
  if (!Number.isFinite(amount) || amount <= 0) return text;

  const small = SPOONS.test(unit) || (/^(ml|millilitres?)$/i.test(unit) && amount < SMALL_ML);
  if (small) {
    if (guessAisle(name) === 'Fruit & veg') {
      const produce = PRODUCE_UNITS.find(([pattern]) => pattern.test(name));
      return produce ? `1 ${produce[1]}` : '1';
    }
    return `1 ${containerFor(name)}`;
  }
  if (MEASURES.test(unit)) return text;

  const packaged = COUNT_PACKAGES[unit.toLowerCase()];
  if (packaged) return `1 ${packaged}`;
  // A bare count, or a count word ("heads", "fillets"): round up to whole.
  if (Number.isInteger(amount)) return text;
  const whole = Math.ceil(amount);
  if (!unit) return String(whole);
  return `${whole} ${whole === 1 ? SINGULAR[unit.toLowerCase()] || unit : unit}`;
}
