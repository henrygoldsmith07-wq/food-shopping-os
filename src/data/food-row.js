/**
 * One way to declare a food, for catalogue files that came after the original.
 *
 * The older files lean on the micronutrient table for sugar, saturated fat and
 * salt, which works only for the handful of foods that table covers. Those
 * three drive the health grade, and the grade refuses to score without them —
 * so anything added here states them outright rather than hoping a profile
 * exists.
 *
 * `per100` is [kcal, protein, carbs, fat, fibre, sugar, satFat, saltGrams].
 * Salt is what a UK label prints; sodium in milligrams is what scoring uses.
 * Carbohydrate follows the UK convention: the caloric carbohydrate figure,
 * with fibre declared separately.
 */

import { microsFor } from './micronutrients.js';

export const foodRow = ([
  id, name, emoji, per100, portion, tags, micronutrientId = null, unit = 'g', extra = {},
]) => {
  const [kcal, protein, carbs, fat, fibre = 0, sugar = 0, satFat = 0, salt = 0] = per100;
  return {
    id,
    name,
    emoji,
    unit,
    source: 'generic',
    tags,
    per100: {
      // A micronutrient profile fills in the vitamins and minerals where one
      // fits; the figures that decide a grade are always stated explicitly and
      // therefore always win.
      ...(micronutrientId ? microsFor(micronutrientId) : {}),
      kcal,
      protein,
      carbs,
      fat,
      fibre,
      sugar,
      satFat,
      sodium: Math.round((salt * 1000) / 2.5),
    },
    servings: [
      { label: `Serving (${portion} ${unit})`, grams: portion },
      { label: `100 ${unit}`, grams: 100 },
    ],
    ...extra,
  };
};

/** The same row, declared as a branded product. */
export const brandedRow = (row, brand) => ({
  ...foodRow(row),
  brand,
  source: 'branded',
  tags: [...row[5], 'branded'],
});
