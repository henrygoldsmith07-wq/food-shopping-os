/**
 * Arithmetic on quantities the parser has already read.
 *
 * Everything here takes parsed measurements rather than text, and keeps the
 * three rules `measure.js` sets out: dimensions never silently mix, a density
 * conversion is always approximate, and a comparison that cannot honestly be
 * made returns null instead of a guess.
 *
 * Split out of measure.js so both halves stay readable; the whole surface is
 * still re-exported from there, and callers import from `measure.js` as before.
 */

import {
  DENSITIES, DIMENSIONS, parseQuantity, round2, UNICODE_FRACTIONS,
} from './measure-parse.js';

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
