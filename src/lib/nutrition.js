/**
 * Pure nutrition maths for the food diary.
 *
 * A log entry is either weight-based (`per100` + `grams`, so portions rescale
 * exactly) or a flat quick-add (`nutrients` only).
 *
 * Nutrient fields are stored as NutrientValue objects so the app can tell:
 *   - measured zero  ("this food contains none")
 *   - missing data   ("this food has not been measured")
 *   - unreported     ("this database does not report it")
 *
 * Plain numbers in older catalogue rows are still accepted and normalised on
 * read. Missing / null is never coerced to 0 during scale or sum.
 */

import { ALCOHOL_UNIT_G, GLASS_ML, NUTRIENTS, NUTRIENT_KEYS } from '../data/nutrients.js';
import {
  EMPTY, EMPTY_NUMBERS, asNutrientValue, entryMacros, entryNumbers, hasNutrientData,
  isEstimatedCell, metaForSource, normalizePer100, numbersFromValues, nutrientNumber,
  nutrientValue, round, scale, scaleValues,
} from './nutrient-value.js';

/* The NutrientValue model lives next door, but it stays part of this module's
   surface: where a nutrient figure came from is inseparable from the maths
   done on it, and every caller already imports these from here. */
export {
  EMPTY, EMPTY_NUMBERS, asNutrientValue, entryMacros, entryNumbers, hasNutrientData,
  metaForSource, normalizePer100, numbersFromValues, nutrientNumber, nutrientValue, scale,
  scaleValues,
};

export const MEALS = [
  { key: 'breakfast', label: 'Breakfast', from: 4, to: 10.5 },
  { key: 'lunch', label: 'Lunch', from: 10.5, to: 15 },
  { key: 'dinner', label: 'Dinner', from: 17, to: 22 },
  { key: 'snack', label: 'Snacks', from: 22, to: 4 },
];

export const MEAL_KEYS = MEALS.map((m) => m.key);
export const mealLabel = (key) => MEALS.find((m) => m.key === key)?.label || 'Snacks';

/** Everything tracked, energy and micronutrients alike. */
export const MACROS = NUTRIENT_KEYS;

const emptyDetail = () => ({
  known: 0,
  estimated: 0,
  unknownCount: 0,
  measuredCount: 0,
  coverage: 0,
  confidence: /** @type {NutrientConfidence} */ ('low'),
  value: /** @type {number | null} */ (null),
});

/**
 * Sum entries into daily totals.
 * Flat keys hold known + estimated only. `detail[key]` has the full breakdown.
 */
export const sumMacros = (entries = []) => {
  const detail = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, emptyDetail()]));
  const n = entries.length || 0;

  for (const entry of entries) {
    const macros = entryMacros(entry);
    for (const key of NUTRIENT_KEYS) {
      const cell = macros[key];
      if (cell.value === null) {
        detail[key].unknownCount += 1;
      } else if (isEstimatedCell(cell)) {
        detail[key].estimated += cell.value;
        detail[key].measuredCount += 1;
      } else {
        detail[key].known += cell.value;
        detail[key].measuredCount += 1;
      }
    }
  }

  const flat = {};
  for (const key of NUTRIENT_KEYS) {
    const d = detail[key];
    d.known = key === 'kcal' ? Math.round(d.known) : round(d.known);
    d.estimated = key === 'kcal' ? Math.round(d.estimated) : round(d.estimated);
    const measured = d.known + d.estimated;
    d.value = d.measuredCount > 0 ? measured : null;
    d.coverage = n ? Math.round((d.measuredCount / n) * 100) : 100;
    if (d.unknownCount === 0 && d.estimated === 0 && d.measuredCount > 0) d.confidence = 'high';
    else if (d.measuredCount === 0) d.confidence = 'low';
    else if (d.estimated !== 0 && d.known === 0) d.confidence = 'low';
    else if (d.unknownCount > 0 || d.estimated !== 0) d.confidence = 'medium';
    else d.confidence = 'high';

    flat[key] = d.value === null ? 0 : d.value;
  }

  return { ...flat, detail };
};

/** Totals for a whole day, plus a per-meal breakdown and data-quality summary. */
export const dayTotals = (entries = []) => {
  const totals = sumMacros(entries);
  const byMeal = Object.fromEntries(
    MEAL_KEYS.map((k) => [k, sumMacros(entries.filter((e) => e.meal === k))]),
  );

  const energy = totals.detail?.kcal;
  const knownAmount = energy?.known ?? 0;
  const estimatedAmount = energy?.estimated ?? 0;
  const withEnergy = entries.filter((e) => hasNutrientData(entryMacros(e).kcal)).length;
  const dataQuality = {
    knownAmount,
    estimatedAmount,
    unknownAmount: null,
    unknownEntries: energy?.unknownCount ?? 0,
    entryCount: entries.length,
    coverage: entries.length ? Math.round((withEnergy / entries.length) * 100) : 100,
    confidence: energy?.confidence || 'low',
    measuredKcal: knownAmount + estimatedAmount,
  };

  return { ...totals, byMeal, dataQuality };
};

export const remaining = (totals, goals) => ({
  kcal: Math.round((goals.kcalGoal || 0) - (totals.kcal || 0)),
  protein: round((goals.proteinGoal || 0) - (totals.protein || 0), 1),
  carbs: round((goals.carbsGoal || 0) - (totals.carbs || 0), 1),
  fat: round((goals.fatGoal || 0) - (totals.fat || 0), 1),
});

export const nutrientRows = (totals, targets = {}, group) =>
  NUTRIENTS
    .filter((n) => !group || n.group === group)
    .map((n) => {
      const target = targets[n.key] ?? n.target;
      const d = totals.detail?.[n.key];
      const value = d ? d.value : (totals[n.key] ?? null);
      const display = value === null || value === undefined ? 0 : value;
      const pct = target && value !== null ? Math.round((display / target) * 100) : 0;
      const tone = value === null
        ? 'faint'
        : n.kind === 'limit'
          ? (pct > 100 ? 'danger' : pct >= 80 ? 'warn' : 'good')
          : (pct >= 100 ? 'good' : pct >= 60 ? 'muted' : 'faint');
      return {
        ...n,
        target,
        value,
        display,
        pct,
        tone,
        known: d?.known ?? (value ?? 0),
        estimated: d?.estimated ?? 0,
        unknownCount: d?.unknownCount ?? 0,
        coverage: d?.coverage ?? 100,
        confidence: d?.confidence ?? 'high',
        incomplete: (d?.unknownCount ?? 0) > 0 || value === null,
      };
    });

const NOT_A_DEFICIENCY = new Set(['kcal', 'carbs', 'fat']);

export const nutrientAlerts = (totals, targets = {}) => {
  const rows = nutrientRows(totals, targets);
  return {
    over: rows.filter((r) => r.kind === 'limit' && r.value !== null && r.pct > 100),
    low: rows.filter((r) => r.kind === 'goal' && !NOT_A_DEFICIENCY.has(r.key) && r.value !== null && r.pct < 50),
    hit: rows.filter((r) => r.kind === 'goal' && r.value !== null && r.pct >= 100),
    incomplete: rows.filter((r) => r.incomplete),
  };
};

export const nutrientCoverage = (entries = []) => {
  if (!entries.length) {
    return {
      pct: 100, kcal: 0, total: 0, knownAmount: 0, estimatedAmount: 0,
      unknownAmount: null, confidence: 'high', coverage: 100,
    };
  }
  const totals = sumMacros(entries);
  const energy = totals.detail.kcal;
  const total = energy.known + energy.estimated;
  const measuredEntries = entries.filter((e) => hasNutrientData(entryMacros(e).kcal));
  const fullProfile = entries.filter((e) => {
    const m = entryMacros(e);
    return hasNutrientData(m.kcal) && hasNutrientData(m.sodium);
  });
  const fullKcal = sumMacros(fullProfile).kcal;
  return {
    pct: total ? Math.round((fullKcal / total) * 100) : 0,
    kcal: fullKcal,
    total,
    knownAmount: energy.known,
    estimatedAmount: energy.estimated,
    unknownAmount: null,
    unknownEntries: entries.length - measuredEntries.length,
    confidence: energy.confidence,
    coverage: Math.round((measuredEntries.length / entries.length) * 100),
  };
};

export const hydration = (totals, glasses = 0) => {
  const fromDrinks = Math.round(totals.water || 0);
  const fromGlasses = glasses * GLASS_ML;
  return { fromDrinks, fromGlasses, total: fromDrinks + fromGlasses };
};

export const alcoholUnits = (grams = 0) => {
  const g = nutrientNumber(grams) ?? (typeof grams === 'number' ? grams : 0);
  return Math.round((g / ALCOHOL_UNIT_G) * 10) / 10;
};

export const saltEquivalent = (sodiumMg = 0) =>
  Math.round(((Number(sodiumMg) || 0) * 2.5 / 1000) * 10) / 10;

export const mealForTime = (date = new Date()) => {
  const h = date.getHours() + date.getMinutes() / 60;
  for (const m of MEALS) {
    if (m.key === 'snack') continue;
    if (h >= m.from && h < m.to) return m.key;
  }
  return 'snack';
};

export const timeStamp = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const byTime = (a, b) => minutesOf(a.time) - minutesOf(b.time);

export const timingInsight = (entries = [], lateFrom = 20) => {
  if (!entries.length) return null;
  const sorted = [...entries].sort(byTime);
  const first = sorted[0].time;
  const last = sorted[sorted.length - 1].time;
  const windowMins = Math.max(0, minutesOf(last) - minutesOf(first));
  const total = sumMacros(entries).kcal;
  const lateKcal = sumMacros(sorted.filter((e) => minutesOf(e.time) >= lateFrom * 60)).kcal;
  const gaps = sorted.slice(1).map((e, i) => minutesOf(e.time) - minutesOf(sorted[i].time));
  return {
    first,
    last,
    windowMins,
    windowLabel: `${Math.floor(windowMins / 60)}h ${windowMins % 60}m`,
    lateKcal,
    latePct: total ? Math.round((lateKcal / total) * 100) : 0,
    longestGapMins: gaps.length ? Math.max(...gaps) : 0,
  };
};

export const snackSummary = (entries = []) => {
  const snacks = entries.filter((e) => e.meal === 'snack');
  const totals = sumMacros(snacks);
  return {
    count: snacks.length,
    ...totals,
    pctOfDay: (() => {
      const day = sumMacros(entries).kcal;
      return day ? Math.round((totals.kcal / day) * 100) : 0;
    })(),
  };
};

export const servingOptions = (food, grams) => {
  const base = [...(food?.servings || [])];
  const unit = food?.unit || 'g';
  if (!base.some((o) => o.grams === 100)) base.push({ label: `100 ${unit}`, grams: 100 });
  if (grams && !base.some((o) => Math.abs(o.grams - grams) < 0.01)) {
    base.push({ label: `${round(grams)} ${unit}`, grams, custom: true });
  }
  return base;
};

export const defaultServing = (food) => food?.servings?.[0] || { label: '100 g', grams: 100 };

export const buildEntry = (food, { grams, meal, time, servingLabel, source, qty = 1 } = {}) => {
  const serving = defaultServing(food);
  const weight = grams ?? serving.grams * qty;
  const now = new Date();
  return {
    id: `e${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    foodId: food.id,
    name: food.name,
    brand: food.brand || null,
    emoji: food.emoji,
    unit: food.unit || 'g',
    grams: round(weight, 1),
    servingLabel: servingLabel ?? (qty === 1 ? serving.label : `${qty} × ${serving.label}`),
    per100: food.per100,
    foodSource: food.source || 'generic',
    meal: meal || mealForTime(now),
    time: time || timeStamp(now),
    source: source || 'search',
  };
};

export const buildQuickEntry = ({ kcal, protein, carbs, fat, meal, time, label } = {}) => {
  const now = new Date();
  const cell = (v) => {
    if (v === undefined || v === null || v === '') return nutrientValue(null, 'user', 'low');
    return nutrientValue(Number(v), 'user', 'medium');
  };
  const nutrients = { ...EMPTY };
  nutrients.kcal = cell(kcal);
  if (protein !== undefined) nutrients.protein = cell(protein);
  if (carbs !== undefined) nutrients.carbs = cell(carbs);
  if (fat !== undefined) nutrients.fat = cell(fat);
  return {
    id: `q${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    foodId: null,
    name: label || 'Quick add',
    brand: null,
    emoji: '⚡',
    unit: null,
    grams: null,
    servingLabel: 'Estimated',
    per100: null,
    nutrients,
    meal: meal || mealForTime(now),
    time: time || timeStamp(now),
    source: 'quick',
  };
};

export const copyEntries = (entries = [], { meal, time } = {}) =>
  entries.map((e, i) => ({
    ...e,
    id: `c${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`,
    meal: meal || e.meal,
    time: time || e.time,
    source: 'copy',
  }));

export const recipeAsFood = (recipe, micros = null) => {
  const per100 = {};
  const macro = (v) => nutrientValue(v, 'estimated', 'medium');
  per100.kcal = macro(Math.round((recipe.kcal / 350) * 100));
  per100.protein = macro(round((recipe.protein / 350) * 100, 1));
  per100.carbs = macro(round((recipe.carbs / 350) * 100, 1));
  per100.fat = macro(round((recipe.fat / 350) * 100, 1));
  per100.fibre = macro(round(((recipe.fibre || 0) / 350) * 100, 1));

  for (const key of NUTRIENT_KEYS) {
    if (per100[key]) continue;
    if (micros && micros[key] !== undefined && micros[key] !== null) {
      per100[key] = nutrientValue(micros[key], 'estimated', 'low');
    } else {
      per100[key] = nutrientValue(null, 'estimated', 'low');
    }
  }

  return {
    id: `recipe--${recipe.id}`,
    name: recipe.name,
    brand: 'Recipe',
    emoji: recipe.emoji,
    unit: 'g',
    source: 'recipe',
    tags: recipe.tags || [],
    per100,
    servings: [
      { label: '1 serving', grams: 350 },
      { label: 'Half serving', grams: 175 },
      { label: '1½ servings', grams: 525 },
    ],
  };
};
