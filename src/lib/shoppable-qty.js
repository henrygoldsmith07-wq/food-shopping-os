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
import { parseQuantity } from './measure.js';

const SPOONS = /^(tsps?|teaspoons?|tbsps?|tablespoons?|pinch(es)?|dash(es)?)$/i;
const MEASURES = /^(g|grams?|kg|ml|millilitres?|l|litres?|oz|lb|cups?)$/i;
/** Small volumes are a container's worth of a condiment, not a purchase. */
const SMALL_ML = 150;

const GARLIC_CLOVES_PER_BULB = 11;

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
  cups: 'cup', jars: 'jar', bottles: 'bottle', loaves: 'loaf', cartons: 'carton', boxes: 'box', punnets: 'punnet',
};

const containerFor = (name) =>
  (/butter|margarine|lard/i.test(name) && !/(peanut|nut|almond|cashew|cocoa|shea) butter/i.test(name)) ? 'pack'
  : /coconut (milk|cream)/i.test(name) ? 'can'
  : /cream|milk|yogh?urt|crème|creme/i.test(name) ? 'carton'
  : (/oil|vinegar|sauce|syrup|juice|extract|essence|wine/i.test(name) ? 'bottle' : 'jar');

const VULGAR = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

/** "1/2 tsp", "1 1/2 cups" and "½ tsp" read as decimals, so they are not skipped as unparseable. */
function fractionToDecimal(text) {
  const m = text.match(/^(?:(\d+)\s*)?(?:(\d+)\/(\d+)|([½⅓⅔¼¾⅛]))(?=\s|$)/);
  if (!m) return text;
  const whole = Number(m[1] || 0);
  const frac = m[4] ? VULGAR[m[4]] : Number(m[2]) / Number(m[3]);
  if (!Number.isFinite(frac)) return text;
  return `${Number((whole + frac).toFixed(3))}${text.slice(m[0].length)}`;
}

/**
 * @param {string} qty  the amount the recipe needs, e.g. "0.7 tsp"
 * @param {string} name the ingredient
 * @returns {string} the amount to buy; `qty` unchanged when it is already buyable
 */
export function shoppableQty(qty, name = '') {
  const whole = String(qty || '').trim();
  // Mixed amounts are made buyable part by part, and two parts that both
  // come down to "1 jar" are one jar, not "1 jar + 1 jar".
  const parts = whole.split(/\s+\+\s+/).filter(Boolean);
  if (parts.length > 1) {
    // Garlic written as cloves in one recipe and bulbs in another is one pile
    // of cloves: "2 cloves + 1 bulb" is 13 cloves, so 2 bulbs, not 1.
    if (/garlic/i.test(name)) {
      let cloves = 0;
      const allGarlic = parts.every((part) => {
        const m = part.match(/^(\d+(?:\.\d+)?)\s*(cloves?|bulbs?|heads?)?$/i);
        if (!m) return false;
        cloves += Number(m[1]) * (/^(bulb|head)/i.test(m[2] || '') ? GARLIC_CLOVES_PER_BULB : 1);
        return true;
      });
      if (allGarlic) return shoppableQty(`${cloves} cloves`, name);
    }
    const bought = [...new Set(parts.map((part) => shoppableQty(part, name)))];
    // "500 g + 2" reads as a typo: say the bare count is whole items.
    const hasMeasure = bought.some((p) => /^\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b/i.test(p));
    return bought.map((p) => (hasMeasure && /^\d+$/.test(p) ? `${p} whole` : p)).join(' + ');
  }
  // A prep note is the cook's business: "1.5, juiced" is 2 lemons to buy.
  const raw = whole.replace(/^(\d+(?:[.,]\d+)?)\s*,(?!\d).*$/, '$1');
  // "2-3 tbsp" / "2 to 3 cloves": buy for the top of the range.
  const range = raw.match(/^\d+(?:\.\d+)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)(?=\s|$)(.*)$/i);
  // "half a lemon" / "half an onion" is 0.5 of one, which you buy whole.
  const half = raw.match(/^(?:half|(?:a\s+)?(?:quarter|third))\s+(?:of\s+)?(?:an?\s+|the\s+)?([a-z].*)$/i);
  const text = fractionToDecimal(range ? `${range[1]}${range[2]}` : half ? `0.5 ${half[1]}` : raw);
  const match = text.match(/^(\d{1,3}(?:,\d{3})+(?!\d)|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return raw;
  // "1,500" is fifteen hundred; "1,5" is a European one and a half.
  const amount = Number(/^\d{1,3}(,\d{3})+$/.test(match[1]) ? match[1].replace(/,/g, '') : match[1].replace(',', '.'));
  const unit = match[2].trim();
  if (!Number.isFinite(amount) || amount <= 0) return raw;

  const small = SPOONS.test(unit) || (/^(ml|millilitres?)$/i.test(unit) && amount < SMALL_ML);
  if (small) {
    if (guessAisle(name) === 'Fruit & veg') {
      const produce = PRODUCE_UNITS.find(([pattern]) => pattern.test(name));
      return produce ? `1 ${produce[1]}` : '1';
    }
    return `1 ${containerFor(name)}`;
  }
  if (MEASURES.test(unit)) return range ? text : raw;

  // Garlic is counted in cloves, and a bulb holds about 11 (package-sizes.js):
  // 14 cloves is 2 bulbs, not 1, and a bare "14" is cloves too.
  if (/garlic/i.test(name) && /^(?:cloves?)?$/i.test(unit)) {
    const bulbs = Math.max(1, Math.ceil(amount / GARLIC_CLOVES_PER_BULB));
    return `${bulbs} bulb${bulbs === 1 ? '' : 's'}`;
  }
  const packaged = COUNT_PACKAGES[unit.toLowerCase()];
  if (packaged) return `1 ${packaged}`;
  // A bare count, or a count word ("heads", "fillets"): round up to whole.
  if (Number.isInteger(amount)) return range ? text : raw;
  const roundedUp = Math.ceil(amount);
  if (!unit) return String(roundedUp);
  return `${roundedUp} ${roundedUp === 1 ? SINGULAR[unit.toLowerCase()] || unit : unit}`;
}

const PACK_WORDS = 'tins?|cans?|jars?|packs?|packets?|cartons?|bottles?|bags?|boxes|box';
const NUMBER = '\\d+(?:\\.\\d+)?';
const SIZE = '(g|grams?|ml|millilitres?)';

/**
 * The pack a recipe line names: "400g tin", "2 x 400g tins", "1 tin (400 g)".
 * Returns { size, unit: 'g'|'ml', word } or null when the line states no size.
 */
export function packOf(qty) {
  const text = String(qty || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const forms = [
    [new RegExp(`^${NUMBER}\\s*x\\s*(${NUMBER})\\s*${SIZE}\\s*(${PACK_WORDS})?$`), [1, 2, 3]],
    [new RegExp(`^(${NUMBER})\\s*${SIZE}\\s*(${PACK_WORDS})$`), [1, 2, 3]],
    [new RegExp(`^${NUMBER}\\s*(${PACK_WORDS})\\s*\\(\\s*(${NUMBER})\\s*${SIZE}\\s*\\)$`), [2, 3, 1]],
  ];
  for (const [re, [si, ui, wi]] of forms) {
    const m = text.match(re);
    if (!m) continue;
    const size = Number(m[si]);
    const unit = /^g/.test(m[ui]) ? 'g' : 'ml';
    const word = (m[wi] || 'pack').replace(/^boxes$/, 'box').replace(/s$/, '');
    if (!(size > 0)) return null;
    return { size, unit, word };
  }
  return null;
}

/** Whole packs for a need: 1200 g of 400 g tins is "3 tins (400 g)". */
export function packsToBuy(totalAmount, pack) {
  if (!pack || !(totalAmount > 0)) return null;
  const count = Math.max(1, Math.ceil(totalAmount / pack.size - 1e-9));
  const word = count === 1 ? pack.word : pack.word === 'box' ? 'boxes' : `${pack.word}s`;
  return `${count} ${word} (${pack.size} ${pack.unit})`;
}

/** Per ingredient key: the one pack every recipe asks for, or null. */
export function packsByIngredient(recipes, keyFn) {
  const map = new Map();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients || []) {
      const k = keyFn(ing.name);
      const pack = packOf(ing.qty);
      const seen = map.get(k);
      if (seen === undefined) map.set(k, pack);
      else if (!pack || !seen || pack.size !== seen.size || pack.unit !== seen.unit) map.set(k, null);
    }
  }
  return map;
}

/** "5 tins (400 g)" for a total need in the pack's unit, else null. */
export function packQtyFor(requiredQty, pack) {
  const need = pack ? parseQuantity(requiredQty) : null;
  return need && need.unit === pack.unit ? packsToBuy(need.amount, pack) : null;
}
