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
  DENSITIES, DIMENSIONS, parseQuantity, pluralUnit, round2, UNICODE_FRACTIONS,
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
  // Density figures are approximate, so don't imply gram precision: 55.2 g -> 55 g.
  const tidy = amount >= 20 ? Math.round(amount) : round2(amount);
  return {
    ...parsed,
    amount: tidy,
    dim,
    unit: dim === 'mass' ? 'g' : 'ml',
    confidence: 'approximate',
    convertedFrom: parsed.dim,
  };
};

// A sum that includes a density conversion is approximate: 63.65 g -> 64 g.
const tidyAmount = (amount, converted) => (converted && amount >= 20 ? Math.round(amount) : round2(amount));

const WHOLE_ITEMS = new Set([
  'egg', 'piece', 'lemon', 'lime', 'onion', 'apple', 'banana', 'pepper', 'potato',
  'tomato', 'carrot', 'courgette', 'aubergine', 'avocado', 'mushroom',
]);

/** Both quantities on one scale, converting through density only if allowed. */
const align = (a, b, { ingredient = '', allowDensity = true } = {}) => {
  if (!a || !b) return null;
  if (a.dim === b.dim) {
    if (a.dim === 'count' && a.unit !== b.unit) {
      // "a dozen" / a bare "2" are counts of the thing itself, so they sit on
      // the same scale as "6 eggs" or "3 lemons" (but never as "2 tins").
      const loose = (x) => x.unit === 'unit' || WHOLE_ITEMS.has(x.unit);
      if (!(loose(a) && loose(b) && (a.unit === 'unit' || b.unit === 'unit'))) return null;
      const unit = a.unit === 'unit' ? b.unit : a.unit;
      return [{ ...a, unit }, { ...b, unit }];
    }
    return [a, b];
  }
  if (!allowDensity) return null;
  // Shops sell these staples by weight, so a volume/mass pair is added up in
  // grams, whichever side was written first ("1 cup" + "100 g" is 220 g, not 429 ml).
  if (a.dim === 'volume' && b.dim === 'mass') {
    const mass = convert(a, 'mass', { ingredient });
    if (mass) return [mass, b];
  }
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
  if (isCompoundQty(have) || isCompoundQty(need)) return compoundSufficient(have, need, options);
  const h = have && typeof have === 'object' ? have : parseQuantity(have, options);
  const n = need && typeof need === 'object' ? need : parseQuantity(need, options);
  const pair = align(h, n, options);
  if (!pair) return null;
  return pair[0].amount >= pair[1].amount;
};

/* ---------- Mixed amounts ("300 g + 2 cups") ---------- */

/**
 * Words that say "some" without saying how much. Next to a real amount they
 * add nothing a shopper can act on, so "to taste + 1 tsp" is just "1 tsp".
 */
const VAGUE_AMOUNT = /^(?:to taste|as (?:needed|required)|optional|(?:for|to) (?:serve|serving|garnish|decorate)|for the table|some|a little|a few|to season|for frying|for greasing)$/i;

/** Is this text an amount-free hedge such as "to taste" or "as needed"? */
export const isVagueAmount = (text) => VAGUE_AMOUNT.test(String(text ?? '').trim());

/**
 * The separate amounts inside a merged quantity. Two recipes asking for
 * "300 g" and "2 cups" of rice produce the text "300 g + 2 cups"; each part
 * is still a real amount and must be weighed on its own.
 */
export const splitQtyParts = (qty) => {
  if (qty == null) return [];
  if (typeof qty === 'object') return [qty];
  return String(qty).split(/\s+\+\s+/).map((part) => part.trim()).filter(Boolean);
};

/** Does this quantity hold more than one amount? */
export const isCompoundQty = (qty) => typeof qty === 'string' && splitQtyParts(qty).length > 1;

/**
 * Pool the readable parts of a quantity by scale: every part that sits on
 * the same scale as an earlier pool is added to it, the rest start a pool.
 * Parts that cannot be read stay as text. Vague hedges drop out once there
 * is at least one real amount.
 */
const poolParts = (qty, options = {}) => {
  const pools = [];
  const text = [];
  const parts = splitQtyParts(qty);
  const real = parts.filter((part) => !isVagueAmount(part));
  for (const part of (real.length ? real : parts)) {
    const parsed = typeof part === 'object' ? part : parseQuantity(part, options);
    if (!parsed) {
      if (!text.includes(part)) text.push(part);
      continue;
    }
    let placed = false;
    for (let i = 0; i < pools.length; i += 1) {
      const pair = align(pools[i], parsed, options);
      if (!pair) continue;
      pools[i] = {
        amount: tidyAmount(pair[0].amount + pair[1].amount, pair[0].convertedFrom || pair[1].convertedFrom),
        dim: pair[0].dim,
        unit: pair[0].unit,
        confidence: pair[0].confidence === 'exact' && pair[1].confidence === 'exact' ? 'exact' : 'approximate',
      };
      placed = true;
      break;
    }
    if (!placed) pools.push(parsed);
  }
  return { pools, text };
};

/** A part nobody added to reads as it was written ("2 cups", not "480 ml"). */
const showPart = (part) => (part.raw ? String(part.raw).trim() : formatQuantity(part));

/**
 * Add up a quantity that may hold several amounts: like amounts are summed
 * ("200 g + 1 cup + 100 g" → "300 g + 1 cup"), unlike ones stay visible side
 * by side, and "to taste" disappears next to a real amount.
 */
export const combineQtyParts = (qty, options = {}) => {
  const { pools, text } = poolParts(qty, options);
  return [...pools.map(showPart), ...text].filter(Boolean).join(' + ');
};

/**
 * `sufficientFor` for mixed amounts. Every part of the need that sits on the
 * pantry's scale is added up and compared; if that alone is more than the
 * pantry holds, the answer is a firm "no" even when another part cannot be
 * compared. Only when every part compares and fits is it a "yes".
 */
const compoundSufficient = (have, need, options = {}) => {
  const stock = poolParts(have, options).pools;
  const wanted = poolParts(need, options);
  if (!stock.length || (!wanted.pools.length && !wanted.text.length)) return null;
  let unknown = wanted.text.length > 0;
  let compared = false;
  for (const part of wanted.pools) {
    const pantry = stock.find((pool) => align(pool, part, options));
    if (!pantry) {
      unknown = true;
      continue;
    }
    compared = true;
    const pair = align(pantry, part, options);
    if (pair[0].amount < pair[1].amount) return false;
  }
  if (!compared || unknown) return null;
  return true;
};

/**
 * What is still short after the pantry, part by part. Each part that sits on
 * the pantry's scale is reduced by what is there (stock used once, never
 * twice); a part the pantry cannot be compared with is kept whole. Empty
 * string when everything is covered; null when nothing could be compared.
 */
export const compoundShortfall = (have, need, options = {}) => {
  const stock = poolParts(have, options).pools.map((pool) => ({ ...pool }));
  const wanted = poolParts(need, options);
  const left = [];
  let compared = false;
  for (const part of wanted.pools) {
    const index = stock.findIndex((pool) => align(pool, part, options));
    if (index < 0) {
      left.push(showPart(part));
      continue;
    }
    compared = true;
    const pair = align(stock[index], part, options);
    const short = round2(Math.max(0, pair[1].amount - pair[0].amount));
    stock[index] = { ...stock[index], amount: round2(Math.max(0, pair[0].amount - pair[1].amount)) };
    if (short > 0) left.push(formatQuantity({ ...part, ...pair[1], amount: short }));
  }
  if (!compared) return null;
  return [...left, ...wanted.text].join(' + ');
};

/**
 * Add two quantities, or null when they do not belong on the same scale.
 * An empty side counts as zero; a side that SAYS something we cannot read is
 * not zero — summing past it would silently drop what it said and present
 * the rest as the total.
 */
export const addQuantities = (a, b, options = {}) => {
  const pa = a && typeof a === 'object' ? a : parseQuantity(a, options);
  const pb = b && typeof b === 'object' ? b : parseQuantity(b, options);
  const says = (v) => Boolean(String(v ?? '').trim());
  if (!pa) return says(a) ? null : (pb || null);
  if (!pb) return says(b) ? null : pa;
  const pair = align(pa, pb, options);
  if (!pair) return null;
  const confidence = pair[0].confidence === 'exact' && pair[1].confidence === 'exact'
    ? 'exact' : 'approximate';
  return {
    amount: tidyAmount(pair[0].amount + pair[1].amount, pair[0].convertedFrom || pair[1].convertedFrom),
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
    amount: tidyAmount(Math.max(0, pair[0].amount - pair[1].amount), pair[0].convertedFrom || pair[1].convertedFrom),
    dim: pair[0].dim,
    unit: pair[0].unit,
    confidence: pair[0].confidence === 'exact' && pair[1].confidence === 'exact'
      ? 'exact' : 'approximate',
    shortfall: tidyAmount(Math.max(0, pair[1].amount - pair[0].amount), pair[0].convertedFrom || pair[1].convertedFrom),
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
      return `${scaled} ${big}`;
    }
    // Nobody weighs out 843.26 g: from 100 g up, whole grams / millilitres.
    return `${amount >= 100 ? Math.round(amount) : round2(amount)} ${small}`;
  }
  const glyph = Object.entries(UNICODE_FRACTIONS).find(([, v]) => Math.abs(v - amount) < 0.001);
  const number = glyph ? glyph[0] : String(round2(amount));
  if (!unit || unit === 'unit') return number;
  const plural = amount === 1 || glyph ? unit : pluralUnit(unit);
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
