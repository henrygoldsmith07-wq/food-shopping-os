/**
 * One way to read a quantity, for the whole app.
 *
 * A pantry row says "2 tins". A recipe says "400 g". A receipt says "1 x 400G".
 * A shopping row says "1/2 pack". Until these are the same kind of thing, the
 * app cannot answer the only question the week actually asks: *do I have
 * enough?* This module is the single place that turns text into a number with
 * a dimension attached, and it is deliberately strict about three things:
 *
 *  1. Mass and volume are different dimensions and never silently mix. 100 g of
 *     yogurt is not 100 ml of yogurt. Crossing them needs `convert`, an
 *     explicit density, and the result is always marked approximate.
 *  2. A package size is only exact when we know that package for that
 *     ingredient. "1 tin" of chopped tomatoes is 400 g; "1 jar" of something we
 *     have no entry for is a guess, and says so.
 *  3. Text it cannot read returns null. "To serve" is not a quantity, and an
 *     invented number is worse than an admitted gap.
 *
 * Confidence is part of the parse, not a label bolted on afterwards:
 *   exact       — a stated measurement, or a package size we are sure of
 *   approximate — hedged ("about 400 g"), a range, a generic package size, or
 *                 a density conversion
 *   unknown     — reserved for callers describing a row with no quantity at all
 */

import { packageSize } from '../data/package-sizes.js';

export const DIMENSIONS = ['mass', 'volume', 'count'];

/* ---------- Unit tables ---------- */

/** Grams per unit. UK retail conventions. */
const MASS_UNITS = {
  g: 1, gram: 1, grams: 1, gramme: 1, grammes: 1, gr: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125,
  lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237,
};

/**
 * Millilitres per unit. A UK tablespoon is 15 ml and a teaspoon 5 ml. `cup` is
 * the 240 ml measure used by the recipe sites people import from — it is a
 * genuine ambiguity (US 236.6, metric 250), so anything measured in cups is
 * marked approximate rather than pretending to a precision it hasn't got.
 */
const VOLUME_UNITS = {
  ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1, cc: 1,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  dsp: 10, dessertspoon: 10, dessertspoons: 10,
  tbsp: 15, tablespoon: 15, tablespoons: 15, tbs: 15,
  cup: 240, cups: 240,
  floz: 28.4130625,
  pint: 568.26125, pints: 568.26125,
};

/** Units whose reading is inherently vague — parsed, but never precise. */
const VAGUE_UNITS = new Set([
  'pinch', 'pinches', 'dash', 'dashes', 'splash', 'splashes', 'handful',
  'handfuls', 'knob', 'knobs', 'drizzle', 'glug', 'sprinkle',
]);

/** Things you count. Anything here can also carry a package size. */
const COUNT_UNITS = new Set([
  'tin', 'can', 'pack', 'packet', 'bag', 'box', 'bottle', 'jar', 'carton',
  'loaf', 'piece', 'egg', 'unit', 'portion', 'serving', 'bunch', 'head', 'bar',
  'tub', 'tray', 'roll', 'slice', 'nest', 'scoop', 'clove', 'thumb', 'square',
  'stick', 'bulb', 'sprig', 'fillet', 'breast', 'thigh', 'punnet', 'sachet',
  'pouch', 'block', 'ball', 'wrap', 'tortilla', 'rasher', 'link', 'cube',
  'pot', 'tube', 'dozen', 'lemon', 'lime', 'onion', 'apple', 'banana', 'pepper',
  'potato', 'tomato', 'carrot', 'courgette', 'aubergine', 'avocado', 'mushroom',
  ...VAGUE_UNITS,
]);

/** Irregular plurals; the rest fall back to stripping a trailing "s"/"es". */
const IRREGULAR_SINGULAR = {
  loaves: 'loaf', leaves: 'leaf', potatoes: 'potato', tomatoes: 'tomato',
  boxes: 'box', bunches: 'bunch', dashes: 'dash', splashes: 'splash',
  pinches: 'pinch', sandwiches: 'sandwich', halves: 'half', knives: 'knife',
};

export const singularUnit = (unit) => {
  const u = String(unit || '').toLowerCase();
  if (!u) return '';
  if (IRREGULAR_SINGULAR[u]) return IRREGULAR_SINGULAR[u];
  if (MASS_UNITS[u] || VOLUME_UNITS[u]) return u;
  if (u.endsWith('ies') && u.length > 4) return `${u.slice(0, -3)}y`;
  if (u.endsWith('es') && COUNT_UNITS.has(u.slice(0, -2))) return u.slice(0, -2);
  if (u.endsWith('s') && !u.endsWith('ss') && u.length > 2) return u.slice(0, -1);
  return u;
};

/**
 * Grams per millilitre, for the few staples where a recipe measures by spoon
 * and the packet measures by weight. Everyday cooking figures, only ever used
 * through `convert`, and always downgraded to approximate.
 */
export const DENSITIES = {
  water: 1, 'semi-skimmed milk': 1.03, 'greek yogurt': 1.03, 'coconut milk': 0.98,
  'olive oil': 0.91, 'vegetable oil': 0.92, 'rapeseed oil': 0.92, 'sesame oil': 0.92,
  honey: 1.42, 'maple syrup': 1.32, 'soy sauce': 1.15, passata: 1.05,
  'tomato puree': 1.1, 'peanut butter': 1.08, tahini: 1.05, flour: 0.53,
  sugar: 0.85, salt: 1.2, rice: 0.85, oats: 0.41, butter: 0.91,
};

/* ---------- Text normalisation ---------- */

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4,
  '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375,
  '⅝': 0.625, '⅞': 0.875,
};

/** Words that admit the number is not measured. Stripped, but remembered. */
const HEDGES = /\b(?:about|approx|approximately|roughly|around|circa|some|a\s+few|generous|heaped|heaping|scant|rounded|large|small|big|good)\b/g;

const normalise = (value) => {
  let text = String(value ?? '').toLowerCase().trim();
  if (!text) return '';
  text = text
    .replace(/[×✕✖]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/~/g, ' about ')
    .replace(/\bfl\.?\s*oz\b/g, 'floz')
    .replace(/\bfluid\s+ounces?\b/g, 'floz')
    .replace(/(\d),(\d{3})\b/g, '$1$2') // 1,000 g
    .replace(/(\d),(\d)/g, '$1.$2') // European decimal comma
    .replace(/\bhalf\s+(?:a|an)\s+/g, '0.5 ')
    .replace(/^half\s+/, '0.5 ')
    .replace(/\bquarter\s+(?:of\s+)?(?:a|an)\s+/g, '0.25 ');
  // Unicode fractions → decimals, keeping "1½" and "1 ½" both meaning 1.5.
  for (const [glyph, value_] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replace(new RegExp(`(\\d)\\s*${glyph}`, 'g'), (_, whole) => `${Number(whole) + value_}`);
    text = text.replace(new RegExp(glyph, 'g'), `${value_}`);
  }
  // ASCII fractions: "1 1/2" → 1.5, "1/2" → 0.5.
  text = text
    .replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (_, w, n, d) => `${Number(w) + Number(n) / Number(d)}`)
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_, n, d) => `${Number(n) / Number(d)}`);
  return text.replace(/\s+/g, ' ').trim();
};

const NUM = '\\d+(?:\\.\\d+)?';

const unitDim = (unit) => {
  if (MASS_UNITS[unit]) return 'mass';
  if (VOLUME_UNITS[unit]) return 'volume';
  return null;
};

const toBase = (amount, unit) => {
  if (MASS_UNITS[unit]) return { amount: amount * MASS_UNITS[unit], dim: 'mass' };
  if (VOLUME_UNITS[unit]) return { amount: amount * VOLUME_UNITS[unit], dim: 'volume' };
  return null;
};

const round2 = (n) => Math.round(n * 100) / 100;

const measurement = (amount, unit, extra = {}) => {
  const base = toBase(amount, unit);
  if (!base) return null;
  return {
    amount: round2(base.amount),
    dim: base.dim,
    unit: base.dim === 'mass' ? 'g' : 'ml',
    confidence: 'exact',
    ...extra,
  };
};

/* ---------- The parser ---------- */

/**
 * Read a quantity string.
 *
 * Returns null when the text holds no quantity ("to serve", "a splash of
 * whatever you like"), and otherwise:
 *   { amount, dim, unit, confidence, raw, ...detail }
 * where `amount` is grams for mass, millilitres for volume, and a plain count
 * for 'count'. `unit` is 'g' | 'ml' | the singular count noun.
 *
 * `ingredient` should be a canonical name — it unlocks the package sizes we are
 * confident about, so "1 tin" of coconut milk reads as 400 ml rather than a
 * generic 400 g.
 */
export const parseQuantity = (value, { ingredient = '' } = {}) => {
  const raw = String(value ?? '').trim();
  let text = normalise(raw);
  if (!text) return null;

  let hedged = false;
  const dehedged = text.replace(HEDGES, ' ').replace(/\s+/g, ' ').trim();
  if (dehedged !== text) {
    hedged = true;
    text = dehedged;
  }
  if (!text) return null;
  // "a pinch", "an onion" — an article is a count of one, not a vagueness.
  text = text.replace(/^an?\s+/, '1 ');

  // A range — "2-3 tbsp", "2 to 3 tbsp". We plan against the top of the range
  // so a shopping list never sends you home short, and record both ends.
  let range = null;
  const ranged = text.match(new RegExp(`^(${NUM})\\s*(?:-|to)\\s*(${NUM})\\s*(.*)$`));
  if (ranged) {
    const min = Number(ranged[1]);
    const max = Number(ranged[2]);
    if (max > min) {
      range = { min, max };
      text = `${max}${ranged[3] ? ` ${ranged[3]}` : ''}`.trim();
    }
  }

  const finish = (parsed) => {
    if (!parsed) return null;
    const approximate = hedged || Boolean(range) || parsed.confidence === 'approximate';
    return {
      ...parsed,
      raw,
      ...(range ? { range } : {}),
      ...(hedged ? { hedged: true } : {}),
      confidence: approximate ? 'approximate' : 'exact',
    };
  };

  const unitAlt = [...Object.keys(MASS_UNITS), ...Object.keys(VOLUME_UNITS)]
    .sort((a, b) => b.length - a.length).join('|');

  // "3 x 200 g" / "3 x 200g tins" — a multipack states its own size.
  const pack = text.match(new RegExp(`^(${NUM})\\s*x\\s*(${NUM})\\s*(${unitAlt})\\b`));
  if (pack) {
    const count = Number(pack[1]);
    const size = Number(pack[2]);
    const parsed = measurement(count * size, pack[3], {
      pack: { count, size, unit: pack[3] },
    });
    if (parsed) return finish(parsed);
  }

  // "2 x tins" — a multipack without a stated size falls back to the package table.
  const packCount = text.match(new RegExp(`^(${NUM})\\s*x\\s*([a-z]+)$`));
  if (packCount) {
    const parsed = fromCount(Number(packCount[1]), packCount[2], ingredient);
    if (parsed) return finish(parsed);
  }

  // "1 tin (400 g)" / "400 g tin" / "1 pack 250g" — an explicit size wins over
  // any table, because the packet in your hand beats our average.
  const stated = text.match(new RegExp(`(${NUM})\\s*(${unitAlt})\\b`));
  const countWord = text.match(new RegExp(`(?:^|[^a-z])(${NUM})\\s*([a-z]+)`));
  if (stated) {
    const size = Number(stated[1]);
    const unit = stated[2];
    // Leading count with a bracketed or trailing size: "2 tins (400g)".
    const leading = text.match(new RegExp(`^(${NUM})\\s*([a-z]+)\\b`));
    const leadingUnit = leading ? singularUnit(leading[2]) : '';
    if (leading && leadingUnit && COUNT_UNITS.has(leadingUnit) && !unitDim(leading[2])) {
      const parsed = measurement(Number(leading[1]) * size, unit, {
        count: { amount: Number(leading[1]), unit: leadingUnit, size, sizeUnit: unit },
      });
      if (parsed) return finish(parsed);
    }
    // Compound metric: "1 kg 500 g".
    const compound = text.match(new RegExp(`^(${NUM})\\s*(${unitAlt})\\s+(${NUM})\\s*(${unitAlt})\\b`));
    if (compound) {
      const first = toBase(Number(compound[1]), compound[2]);
      const second = toBase(Number(compound[3]), compound[4]);
      if (first && second && first.dim === second.dim) {
        return finish({
          amount: round2(first.amount + second.amount),
          dim: first.dim,
          unit: first.dim === 'mass' ? 'g' : 'ml',
          confidence: 'exact',
        });
      }
    }
    const parsed = measurement(size, unit, {
      // Cups and spoons are real measures, but not precise ones.
      ...(unit === 'cup' || unit === 'cups' ? { confidence: 'approximate' } : {}),
    });
    if (parsed) return finish(parsed);
  }

  // "2 tins", "4 eggs", "1 clove", "0.5 pack"
  if (countWord) {
    const parsed = fromCount(Number(countWord[1]), countWord[2], ingredient);
    if (parsed) return finish(parsed);
  }

  // "a pinch" / "a handful" — countable words with no number in front.
  const bareUnit = text.match(/^([a-z]+)$/);
  if (bareUnit) {
    const unit = singularUnit(bareUnit[1]);
    if (COUNT_UNITS.has(unit)) {
      return finish({
        amount: 1,
        dim: 'count',
        unit,
        confidence: VAGUE_UNITS.has(unit) ? 'approximate' : 'exact',
        ...(VAGUE_UNITS.has(unit) ? { vague: true } : {}),
      });
    }
    return null;
  }

  // A bare number is a count of the thing itself: "2" carrots.
  const bare = text.match(new RegExp(`^(${NUM})$`));
  if (bare) {
    return finish({ amount: Number(bare[1]), dim: 'count', unit: 'unit', confidence: 'exact' });
  }

  return null;
};

/** A count of packages, normalised to mass/volume when we know the package. */
function fromCount(amount, rawUnit, ingredient) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = singularUnit(rawUnit);
  if (!COUNT_UNITS.has(unit)) return null;
  if (unit === 'dozen') {
    return { amount: amount * 12, dim: 'count', unit: 'unit', confidence: 'exact' };
  }
  const size = packageSize(unit, ingredient);
  if (size) {
    // A size we know for this ingredient is a fact, and so is a package that is
    // standardised across the shelf. A generic average is not.
    const confidence = size.source === 'ingredient' || size.standard ? 'exact' : 'approximate';
    const dim = size.dim;
    const baseUnit = dim === 'count' ? 'unit' : (dim === 'mass' ? 'g' : 'ml');
    return {
      amount: round2(amount * size.amount),
      dim,
      unit: baseUnit,
      confidence,
      count: { amount, unit, size: size.amount, sizeUnit: baseUnit, source: size.source },
    };
  }
  return {
    amount,
    dim: 'count',
    unit,
    confidence: VAGUE_UNITS.has(unit) ? 'approximate' : 'exact',
    ...(VAGUE_UNITS.has(unit) ? { vague: true } : {}),
  };
}

/* ---------- Working with parsed quantities ---------- */

/**
 * Move a parsed quantity to another dimension. Mass ↔ volume needs a density
 * for that specific ingredient; without one the answer is null rather than a
 * pretend conversion. A converted figure is always approximate.
 */
export const convert = (parsed, dim, { ingredient = '' } = {}) => {
  if (!parsed || !DIMENSIONS.includes(dim)) return null;
  if (parsed.dim === dim) return parsed;
  if (parsed.dim === 'count' || dim === 'count') return null;
  const density = DENSITIES[String(ingredient || '').toLowerCase()];
  if (!density) return null;
  const amount = parsed.dim === 'volume' ? parsed.amount * density : parsed.amount / density;
  return {
    ...parsed,
    amount: round2(amount),
    dim,
    unit: dim === 'mass' ? 'g' : 'ml',
    confidence: 'approximate',
    convertedFrom: parsed.dim,
  };
};

/** Both quantities on one scale, converting through density only if allowed. */
const align = (a, b, { ingredient = '', allowDensity = false } = {}) => {
  if (!a || !b) return null;
  if (a.dim === b.dim) {
    if (a.dim === 'count' && a.unit !== b.unit) return null;
    return [a, b];
  }
  if (!allowDensity) return null;
  const converted = convert(b, a.dim, { ingredient });
  return converted ? [a, converted] : null;
};

/**
 * Does `have` cover `need`?
 *
 * true / false when both sit on the same scale, and null when they genuinely
 * cannot be compared — an honest "I can't tell" that the pantry surfaces as
 * "check before you shop" rather than a confident wrong answer.
 */
export const sufficientFor = (have, need, options = {}) => {
  const h = have && typeof have === 'object' ? have : parseQuantity(have, options);
  const n = need && typeof need === 'object' ? need : parseQuantity(need, options);
  const pair = align(h, n, options);
  if (!pair) return null;
  return pair[0].amount >= pair[1].amount;
};

/** Add two quantities, or null when they do not belong on the same scale. */
export const addQuantities = (a, b, options = {}) => {
  const pa = a && typeof a === 'object' ? a : parseQuantity(a, options);
  const pb = b && typeof b === 'object' ? b : parseQuantity(b, options);
  if (!pa) return pb || null;
  if (!pb) return pa;
  const pair = align(pa, pb, options);
  if (!pair) return null;
  const confidence = pair[0].confidence === 'exact' && pair[1].confidence === 'exact'
    ? 'exact' : 'approximate';
  return {
    amount: round2(pair[0].amount + pair[1].amount),
    dim: pair[0].dim,
    unit: pair[0].unit,
    confidence,
  };
};

/** Subtract `used` from `have`, never going below zero. Null when incomparable. */
export const subtractQuantities = (have, used, options = {}) => {
  const h = have && typeof have === 'object' ? have : parseQuantity(have, options);
  const u = used && typeof used === 'object' ? used : parseQuantity(used, options);
  if (!h) return null;
  if (!u) return null;
  const pair = align(h, u, options);
  if (!pair) return null;
  return {
    amount: round2(Math.max(0, pair[0].amount - pair[1].amount)),
    dim: pair[0].dim,
    unit: pair[0].unit,
    confidence: pair[0].confidence === 'exact' && pair[1].confidence === 'exact'
      ? 'exact' : 'approximate',
    shortfall: round2(Math.max(0, pair[1].amount - pair[0].amount)),
  };
};

/** Multiply a quantity — scaling a recipe from 2 servings to 5. */
export const scaleQuantity = (parsed, factor) => {
  if (!parsed || !Number.isFinite(factor) || factor <= 0) return null;
  return { ...parsed, amount: round2(parsed.amount * factor) };
};

/** The way a person writes it back: 1000 g → "1 kg", 0.5 lemon → "½ lemon". */
export const formatQuantity = (parsed) => {
  if (!parsed) return '';
  const { amount, dim, unit } = parsed;
  if (dim === 'mass' || dim === 'volume') {
    const big = dim === 'mass' ? 'kg' : 'l';
    const small = dim === 'mass' ? 'g' : 'ml';
    if (amount >= 1000) {
      const scaled = round2(amount / 1000);
      return `${Number.isInteger(scaled) ? scaled : scaled} ${big}`;
    }
    return `${round2(amount)} ${small}`;
  }
  const glyph = Object.entries(UNICODE_FRACTIONS).find(([, v]) => Math.abs(v - amount) < 0.001);
  const number = glyph ? glyph[0] : String(round2(amount));
  if (!unit || unit === 'unit') return number;
  const plural = amount === 1 || glyph ? unit : `${unit}${unit.endsWith('s') ? '' : 's'}`;
  return `${number} ${plural}`;
};

/**
 * Price per 100 g / 100 ml / item, so two sizes of the same thing can be
 * compared honestly. Returns null when the quantity gives nothing to divide by.
 */
export const unitPriceOf = (price, qty, options = {}) => {
  const amount = Number(price);
  if (!(amount > 0)) return null;
  const parsed = qty && typeof qty === 'object' ? qty : parseQuantity(qty, options);
  if (!parsed || !(parsed.amount > 0)) return null;
  if (parsed.dim === 'count') {
    return {
      value: round2(amount / parsed.amount),
      unit: parsed.unit === 'unit' ? 'each' : `per ${parsed.unit}`,
      dim: 'count',
      confidence: parsed.confidence,
    };
  }
  return {
    value: Math.round((amount / parsed.amount) * 100 * 100) / 100,
    unit: parsed.dim === 'mass' ? '100g' : '100ml',
    dim: parsed.dim,
    confidence: parsed.confidence,
  };
};

/**
 * Rank sizes of the same product by what they actually cost per unit. Only rows
 * that land on the same scale are compared; the rest are returned as
 * `incomparable` rather than silently dropped from a "best value" claim.
 */
export const compareUnitPrices = (rows = [], options = {}) => {
  const priced = [];
  const incomparable = [];
  for (const row of rows) {
    const unit = unitPriceOf(row?.price, row?.qty, { ingredient: row?.ingredient || options.ingredient });
    if (unit) priced.push({ ...row, unitPrice: unit });
    else incomparable.push(row);
  }
  const dims = new Set(priced.map((row) => `${row.unitPrice.dim}:${row.unitPrice.unit}`));
  if (dims.size > 1) {
    // Mixed scales: per-100g and per-item cannot be ranked against each other.
    return { best: null, ranked: priced, incomparable, mixedScales: true };
  }
  const ranked = [...priced].sort((a, b) => a.unitPrice.value - b.unitPrice.value);
  const best = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  return {
    best,
    ranked,
    incomparable,
    mixedScales: false,
    // How much better the best actually is — a 1p difference is not a finding.
    margin: best && runnerUp
      ? Math.round(((runnerUp.unitPrice.value - best.unitPrice.value) / runnerUp.unitPrice.value) * 1000) / 10
      : null,
  };
};
