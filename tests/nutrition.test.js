import { describe, it, expect } from 'vitest';
import {
  asNutrientValue, buildEntry, buildQuickEntry, copyEntries, dayTotals, entryMacros,
  hasNutrientData, mealForTime, nutrientNumber, nutrientValue, remaining, scale,
  servingOptions, snackSummary, sumMacros, timingInsight,
} from '../src/lib/nutrition.js';
import { formatAmount } from '../src/data/nutrients.js';
import { FOODS } from '../src/data/foods.js';
import { microsFor } from '../src/data/micronutrients.js';

const oats = FOODS.find((f) => f.id === 'porridge-oats');
const banana = FOODS.find((f) => f.id === 'banana');

describe('NutrientValue', () => {
  it('distinguishes measured zero from missing data', () => {
    const zero = nutrientValue(0, 'label', 'high');
    const missing = nutrientValue(null, 'verified_database', 'low');
    expect(zero.value).toBe(0);
    expect(missing.value).toBeNull();
    expect(hasNutrientData(zero)).toBe(true);
    expect(hasNutrientData(missing)).toBe(false);
  });

  it('normalises plain numbers without inventing values for absent keys', () => {
    expect(asNutrientValue(12).value).toBe(12);
    expect(asNutrientValue(undefined).value).toBeNull();
    expect(asNutrientValue(null).value).toBeNull();
  });

  it('formatAmount shows an em dash for unknown', () => {
    expect(formatAmount('protein', null)).toBe('—');
    expect(formatAmount('protein', 0)).toMatch(/0/);
  });
});

describe('portion scaling', () => {
  it('scales a per-100 profile by weight', () => {
    const full = scale(oats.per100, 100);
    expect(nutrientNumber(full.kcal)).toBe(379);
    expect(nutrientNumber(full.protein)).toBe(11);
    expect(nutrientNumber(scale(oats.per100, 50).kcal)).toBe(190);
  });

  it('keeps missing nutrients as null when scaling', () => {
    const sparse = { kcal: 100, protein: 5 }; // no micros
    const scaled = scale(sparse, 100);
    expect(nutrientNumber(scaled.kcal)).toBe(100);
    expect(nutrientNumber(scaled.protein)).toBe(5);
    expect(nutrientNumber(scaled.sodium)).toBeNull();
    expect(nutrientNumber(scaled.vitC)).toBeNull();
  });

  it('preserves measured zero through scale', () => {
    const scaled = scale({ kcal: 0, caffeine: 0, protein: 10 }, 200);
    expect(nutrientNumber(scaled.kcal)).toBe(0);
    expect(nutrientNumber(scaled.caffeine)).toBe(0);
    expect(nutrientNumber(scaled.protein)).toBe(20);
  });

  it('doubling the portion doubles the calories', () => {
    const one = nutrientNumber(scale(banana.per100, 118).kcal);
    const two = nutrientNumber(scale(banana.per100, 236).kcal);
    expect(two).toBe(one * 2);
  });

  it('offers the food’s servings plus 100 g and any weighed amount', () => {
    const options = servingOptions(oats, 73);
    expect(options.some((o) => o.grams === 40)).toBe(true);
    expect(options.some((o) => o.grams === 100)).toBe(true);
    expect(options.some((o) => o.grams === 73 && o.custom)).toBe(true);
  });
});

describe('entries and totals', () => {
  const entries = [
    buildEntry(oats, { grams: 40, meal: 'breakfast', time: '07:30' }),
    buildEntry(banana, { grams: 118, meal: 'snack', time: '10:15' }),
    buildQuickEntry({ kcal: 500, protein: 20, carbs: 50, fat: 15, meal: 'lunch', time: '13:00' }),
  ];

  it('reads weight-based and quick-add entries the same way', () => {
    expect(nutrientNumber(entryMacros(entries[0]).kcal)).toBe(152);
    expect(nutrientNumber(entryMacros(entries[2]).kcal)).toBe(500);
  });

  it('quick-add leaves untyped nutrients unknown, not zero', () => {
    const quick = buildQuickEntry({ kcal: 300 });
    const macros = entryMacros(quick);
    expect(nutrientNumber(macros.kcal)).toBe(300);
    expect(nutrientNumber(macros.sodium)).toBeNull();
    expect(nutrientNumber(macros.vitC)).toBeNull();
    // protein was not passed — unknown, not 0
    expect(nutrientNumber(macros.protein)).toBeNull();
  });

  it('sums a day and breaks it down by meal', () => {
    const totals = dayTotals(entries);
    expect(totals.kcal).toBe(152 + 105 + 500);
    expect(totals.byMeal.breakfast.kcal).toBe(152);
    expect(totals.byMeal.lunch.kcal).toBe(500);
    expect(totals.byMeal.dinner.kcal).toBe(0);
  });

  it('exposes known / estimated / coverage / confidence on daily totals', () => {
    const totals = dayTotals(entries);
    expect(totals.dataQuality).toBeDefined();
    expect(totals.dataQuality.knownAmount).toBeGreaterThan(0);
    expect(totals.dataQuality.coverage).toBeGreaterThan(0);
    expect(['high', 'medium', 'low']).toContain(totals.dataQuality.confidence);
    expect(totals.detail.kcal.known + totals.detail.kcal.estimated).toBe(totals.kcal);
    // Quick-add has no sodium → sodium detail should record unknowns
    expect(totals.detail.sodium.unknownCount).toBeGreaterThan(0);
  });

  it('reports what is left against the goals', () => {
    const left = remaining(sumMacros(entries), { kcalGoal: 2200, proteinGoal: 130, carbsGoal: 250, fatGoal: 75 });
    expect(left.kcal).toBe(2200 - 757);
    expect(left.protein).toBeGreaterThan(0);
  });

  it('copies entries onto a new meal with fresh ids', () => {
    const copied = copyEntries(entries.slice(0, 2), { meal: 'dinner' });
    expect(copied).toHaveLength(2);
    expect(copied.every((e) => e.meal === 'dinner')).toBe(true);
    expect(copied[0].id).not.toBe(entries[0].id);
    expect(sumMacros(copied).kcal).toBe(sumMacros(entries.slice(0, 2)).kcal);
  });

  it('defaults a log to the meal the clock is in', () => {
    expect(mealForTime(new Date('2026-07-27T08:00:00'))).toBe('breakfast');
    expect(mealForTime(new Date('2026-07-27T12:30:00'))).toBe('lunch');
    expect(mealForTime(new Date('2026-07-27T19:00:00'))).toBe('dinner');
    expect(mealForTime(new Date('2026-07-27T23:30:00'))).toBe('snack');
    expect(mealForTime(new Date('2026-07-27T16:00:00'))).toBe('snack');
  });
});

describe('micronutrient table honesty', () => {
  it('returns nulls for foods not in the micro table', () => {
    const missing = microsFor('totally-unknown-food');
    expect(missing.sodium).toBeNull();
    expect(missing.vitC).toBeNull();
  });

  it('returns explicit zeros for measured-none columns', () => {
    const oil = microsFor('olive-oil');
    expect(oil.cholesterol).toBe(0);
    expect(oil.caffeine).toBe(0);
  });
});

describe('timing and snacks', () => {
  const day = [
    buildEntry(oats, { grams: 40, meal: 'breakfast', time: '07:00' }),
    buildEntry(banana, { grams: 118, meal: 'snack', time: '15:00' }),
    buildQuickEntry({ kcal: 400, meal: 'dinner', time: '21:00' }),
  ];

  it('describes the eating window and late-evening share', () => {
    const t = timingInsight(day);
    expect(t.first).toBe('07:00');
    expect(t.last).toBe('21:00');
    expect(t.windowLabel).toBe('14h 0m');
    expect(t.latePct).toBe(Math.round((400 / (152 + 105 + 400)) * 100));
    expect(t.longestGapMins).toBe(8 * 60); // 07:00 → 15:00
  });

  it('is null for an empty day', () => {
    expect(timingInsight([])).toBeNull();
  });

  it('summarises snacking as a share of the day', () => {
    const s = snackSummary(day);
    expect(s.count).toBe(1);
    expect(s.kcal).toBe(105);
    expect(s.pctOfDay).toBe(Math.round((105 / 657) * 100));
  });
});
