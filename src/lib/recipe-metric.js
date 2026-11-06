/**
 * A US recipe in a UK kitchen: cups, ounces, pounds, sticks and °F, shown in
 * grams, millilitres and °C — the way Paprika, Mela and Samsung Food offer it
 * for imported recipes.
 *
 * Honest by construction, as measure.js is:
 *   - only amounts written in US/imperial units change; "2 tbsp", "1 tin",
 *     "400 g" and "a pinch" stay exactly as written;
 *   - a cup becomes grams only for an ingredient with a known density
 *     (flour, sugar, rice, butter…); otherwise it becomes millilitres;
 *   - every converted figure is marked "≈", because a cup is itself an
 *     approximate measure, and anything the parser cannot read is left alone.
 */

import { DENSITIES, parseQuantity } from './measure-parse.js';

const IMPERIAL = /\b(?:cups?|c\.|oz|ounces?|fl\.?\s?oz|lbs?|pounds?|sticks?|quarts?|qts?)\b/i;
const STICK_GRAMS = 113; // a US stick of butter
const LIQUID = /\b(?:water|milk|oil|stock|broth|cream|juice|vinegar|wine|sauce|syrup|honey|passata)\b/i;
const QUART_ML = 946;

const DENSITY_KEYS = Object.keys(DENSITIES).sort((a, b) => b.length - a.length);

/** The density for an ingredient name, by its most specific known match. */
export const densityFor = (name) => {
  const text = String(name || '').toLowerCase();
  const key = DENSITY_KEYS.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(text));
  return key ? DENSITIES[key] : null;
};

/** Shop-friendly rounding: 7 g, 45 g, 230 g, 1.2 kg. */
const tidy = (amount, unit) => {
  if (amount >= 1000) return `${Math.round(amount / 100) / 10} ${unit === 'g' ? 'kg' : 'l'}`;
  const step = amount >= 250 ? 10 : amount >= 20 ? 5 : 1;
  return `${Math.max(1, Math.round(amount / step) * step)} ${unit}`;
};

/**
 * One quantity in metric, or null when it was not written in US/imperial
 * units or cannot be read.
 *
 * @returns {string|null} e.g. "≈ 250 g"
 */
export const metricQty = (qty, ingredient = '') => {
  const text = String(qty || '').trim();
  if (!text || !IMPERIAL.test(text)) return null;
  const sticks = text.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*sticks?\b/i);
  if (sticks) {
    const [a, b] = sticks[1].split('/').map(Number);
    return `≈ ${tidy((b ? a / b : a) * STICK_GRAMS, 'g')}`;
  }
  const quarts = text.match(/^(\d+(?:\.\d+)?)\s*(?:quarts?|qts?)\b/i);
  if (quarts) return `≈ ${tidy(Number(quarts[1]) * QUART_ML, 'ml')}`;
  const parsed = parseQuantity(text.replace(/\bfl\.?\s?oz\b/i, 'floz').replace(/\bc\.(?=\s|$)/i, 'cup'), { ingredient });
  if (!parsed || parsed.dim === 'count' || !(parsed.amount > 0)) return null;
  if (parsed.dim === 'mass') return `≈ ${tidy(parsed.amount, 'g')}`;
  // Liquids are measured as liquids in a UK kitchen too: a jug, not a scale.
  const density = LIQUID.test(String(ingredient)) ? null : densityFor(ingredient);
  return density ? `≈ ${tidy(parsed.amount * density, 'g')}` : `≈ ${tidy(parsed.amount, 'ml')}`;
};

const toCelsius = (f) => Math.round(((f - 32) * 5) / 9 / 10) * 10;

/** "Bake at 350°F" → "Bake at 180°C (160°C fan)". Leaves °C and bare numbers alone. */
export const metricStep = (text) => String(text || '').replace(
  /(\d{3})\s*(?:°\s*F\b|º\s*F\b|degrees?\s*F(?:ahrenheit)?\b|F\b(?=[\s.,;)]|$))/gi,
  (match, degrees) => {
    const f = Number(degrees);
    if (f < 200 || f > 550) return match;
    const c = toCelsius(f);
    return `${c}°C (${c - 20}°C fan)`;
  },
);

/**
 * The recipe with US/imperial amounts and oven temperatures in metric, and
 * how many lines changed (0 means there is nothing to offer).
 */
export const metricRecipe = (recipe) => {
  let changed = 0;
  const ingredients = (recipe?.ingredients || []).map((ing) => {
    const qty = metricQty(ing.qty, ing.name);
    if (!qty) return ing;
    changed += 1;
    return { ...ing, qty, qtyAsWritten: ing.qty };
  });
  const steps = (recipe?.steps || []).map((step) => {
    const text = typeof step === 'string' ? step : step?.text;
    const next = metricStep(text);
    if (next === text) return step;
    changed += 1;
    return typeof step === 'string' ? next : { ...step, text: next };
  });
  return { recipe: changed ? { ...recipe, ingredients, steps } : recipe, changed };
};
