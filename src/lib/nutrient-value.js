/**
 * The NutrientValue model.
 *
 * A nutrient is not a number. It is a number *and* what is known about it, so
 * that three genuinely different things stay apart:
 *
 *   - a measured zero  ("this food contains none")
 *   - missing data     ("this food has not been measured")
 *   - unreported       ("this database does not report it")
 *
 * Coercing any of those to 0 is how an app ends up reporting that someone ate
 * no iron all week when the truth is that nobody measured it. Plain numbers in
 * older catalogue rows are accepted and normalised on read; missing stays null
 * through scaling and summing alike.
 *
 * Split out of `nutrition.js`, which owns the diary maths built on top of it.
 */

import { NUTRIENTS, NUTRIENT_KEYS } from '../data/nutrients.js';

/** @typedef {'label'|'verified_database'|'community'|'estimated'|'user'} NutrientSource */
/** @typedef {'high'|'medium'|'low'} NutrientConfidence */

/**
 * @typedef {{
 *   value: number | null,
 *   source: NutrientSource,
 *   confidence: NutrientConfidence,
 * }} NutrientValue
 */

/** Shared rounding, so a figure reads the same wherever it is computed. */
export const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

const SOURCE_META = {
  generic: { source: 'verified_database', confidence: 'high' },
  branded: { source: 'label', confidence: 'high' },
  restaurant: { source: 'estimated', confidence: 'medium' },
  custom: { source: 'user', confidence: 'high' },
  recipe: { source: 'estimated', confidence: 'low' },
  quick: { source: 'user', confidence: 'medium' },
  import: { source: 'estimated', confidence: 'low' },
  community: { source: 'community', confidence: 'medium' },
};

/** Build a NutrientValue. Pass null/undefined for "not measured / not reported". */
export const nutrientValue = (value, source = 'verified_database', confidence = 'high') => {
  if (value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value))) {
    return { value: null, source, confidence: confidence === 'high' ? 'low' : confidence };
  }
  return { value: Number(value), source, confidence };
};

/** Normalise a raw cell (plain number, null, or NutrientValue) into NutrientValue. */
export const asNutrientValue = (raw, defaults = {}) => {
  const source = defaults.source || 'verified_database';
  const confidence = defaults.confidence || 'high';
  if (raw === undefined || raw === null) {
    return nutrientValue(null, source, 'low');
  }
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const v = raw.value;
    if (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) {
      return nutrientValue(null, raw.source || source, raw.confidence || 'low');
    }
    return {
      value: Number(v),
      source: raw.source || source,
      confidence: raw.confidence || confidence,
    };
  }
  if (typeof raw === 'number' && Number.isNaN(raw)) {
    return nutrientValue(null, source, 'low');
  }
  return nutrientValue(Number(raw), source, confidence);
};

/** True when a value was actually measured or estimated (including real zero). */
export const hasNutrientData = (cell) => asNutrientValue(cell).value !== null;

/** Numeric value or null — never coerces missing data to 0. */
export const nutrientNumber = (cell) => asNutrientValue(cell).value;

export const isEstimatedCell = (nv) =>
  nv.value !== null && (nv.source === 'estimated' || nv.confidence === 'low');

/** Meta defaults from a food/entry source string. */
export const metaForSource = (foodSource = 'generic') =>
  SOURCE_META[foodSource] || SOURCE_META.generic;

/**
 * Turn a per-100 profile (plain numbers and/or NutrientValues) into a map of
 * NutrientValue. Keys that are absent stay null — they are not filled with 0.
 */
export const normalizePer100 = (per100 = {}, foodSource = 'generic') => {
  const meta = metaForSource(foodSource);
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    if (per100[key] === undefined) {
      out[key] = nutrientValue(null, meta.source, 'low');
    } else {
      out[key] = asNutrientValue(per100[key], meta);
    }
  }
  return out;
};

/** Empty profile: every nutrient explicitly unknown, not zero. */
export const EMPTY = Object.fromEntries(
  NUTRIENT_KEYS.map((k) => [k, nutrientValue(null, 'verified_database', 'low')]),
);

/** Flat zeros only for callers that truly need a numeric bag (tests, legacy). Prefer EMPTY. */
export const EMPTY_NUMBERS = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));

/**
 * Scale a per-100 profile → NutrientValue map.
 * Missing nutrients stay null; measured zeros stay zero.
 */
export const scaleValues = (per100, grams, foodSource = 'generic') => {
  const k = (Number(grams) || 0) / 100;
  const profile = normalizePer100(per100 || {}, foodSource);
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const cell = profile[key];
    if (cell.value === null) {
      out[key] = { value: null, source: cell.source, confidence: cell.confidence };
      continue;
    }
    const scaled = key === 'kcal'
      ? Math.round(cell.value * k)
      : round(cell.value * k, key === 'transFat' ? 3 : 2);
    out[key] = { value: scaled, source: cell.source, confidence: cell.confidence };
  }
  return out;
};

/** Flatten NutrientValue map → numbers, using null for unknown (not 0). */
export const numbersFromValues = (values = {}) => {
  const out = {};
  for (const key of NUTRIENT_KEYS) out[key] = nutrientNumber(values[key]);
  return out;
};

/**
 * Scale a per-100 g/ml profile to an arbitrary weight.
 * Returns plain numbers for UI/tests; missing nutrients are null, never 0.
 * Measured zeros stay 0.
 */
export const scale = (per100, grams, foodSource = 'generic') =>
  numbersFromValues(scaleValues(per100, grams, foodSource));

/**
 * Nutrients for one entry as NutrientValue map.
 * Quick-adds only fill macros they were given; everything else stays unknown.
 */
export const entryMacros = (entry) => {
  if (!entry) return { ...EMPTY };
  if (entry.per100) {
    return scaleValues(entry.per100, entry.grams, entry.foodSource || entry.source || 'generic');
  }
  const meta = metaForSource(entry.source === 'quick' ? 'quick' : 'user');
  const raw = entry.nutrients || {};
  const out = { ...EMPTY };
  for (const key of NUTRIENT_KEYS) {
    if (raw[key] === undefined || raw[key] === null) {
      out[key] = nutrientValue(null, meta.source, 'low');
    } else {
      out[key] = asNutrientValue(raw[key], meta);
    }
  }
  return out;
};

/** Numeric macros for one entry: unknown → null. */
export const entryNumbers = (entry) => numbersFromValues(entryMacros(entry));
