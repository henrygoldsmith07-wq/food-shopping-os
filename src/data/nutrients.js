/**
 * The nutrients Forq tracks, their units, and the daily reference intakes the
 * rings and meters are measured against.
 *
 * `kind` decides how a nutrient reads: 'goal' nutrients are something to reach
 * (protein, fibre, vitamin C), 'limit' nutrients are something to stay under
 * (saturated fat, sodium, caffeine). The UI colours them accordingly — a
 * limit at 90% is a warning, a goal at 90% is nearly there.
 *
 * Reference intakes are adult UK/EU RI figures, rounded. They are defaults:
 * `targets` in app state overrides any of them.
 */

export const NUTRIENT_GROUPS = [
  { id: 'macro', label: 'Macronutrients' },
  { id: 'fat', label: 'Fats & cholesterol' },
  { id: 'mineral', label: 'Minerals' },
  { id: 'vitamin', label: 'Vitamins' },
  { id: 'other', label: 'Water, caffeine & alcohol' },
];

/** key, label, unit, group, daily reference, goal|limit, decimal places */
const N = (key, label, unit, group, target, kind = 'goal', dp = 0) =>
  ({ key, label, unit, group, target, kind, dp });

export const NUTRIENTS = [
  N('kcal', 'Calories', 'kcal', 'macro', 2200),
  N('protein', 'Protein', 'g', 'macro', 130, 'goal', 1),
  N('carbs', 'Carbohydrates', 'g', 'macro', 250, 'goal', 1),
  N('fat', 'Fat', 'g', 'macro', 75, 'goal', 1),
  N('fibre', 'Fibre', 'g', 'macro', 30, 'goal', 1),
  N('sugar', 'Sugar', 'g', 'macro', 90, 'limit', 1),

  N('satFat', 'Saturated fat', 'g', 'fat', 20, 'limit', 1),
  N('transFat', 'Trans fat', 'g', 'fat', 2, 'limit', 2),
  N('cholesterol', 'Cholesterol', 'mg', 'fat', 300, 'limit'),

  N('sodium', 'Sodium', 'mg', 'mineral', 2300, 'limit'),
  N('potassium', 'Potassium', 'mg', 'mineral', 3500),
  N('calcium', 'Calcium', 'mg', 'mineral', 800),
  N('iron', 'Iron', 'mg', 'mineral', 14, 'goal', 1),
  N('magnesium', 'Magnesium', 'mg', 'mineral', 375),
  N('zinc', 'Zinc', 'mg', 'mineral', 10, 'goal', 1),

  N('vitA', 'Vitamin A', 'µg', 'vitamin', 800),
  N('vitB', 'Vitamin B complex', '%', 'vitamin', 100),
  N('vitC', 'Vitamin C', 'mg', 'vitamin', 80),
  N('vitD', 'Vitamin D', 'µg', 'vitamin', 10, 'goal', 1),
  N('vitE', 'Vitamin E', 'mg', 'vitamin', 12, 'goal', 1),
  N('vitK', 'Vitamin K', 'µg', 'vitamin', 75),

  N('water', 'Water', 'ml', 'other', 2000),
  N('caffeine', 'Caffeine', 'mg', 'other', 400, 'limit'),
  N('alcohol', 'Alcohol', 'g', 'other', 16, 'limit', 1),
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);
export const nutrientBy = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

/** The four the app has always led with — rings, cards, quick add. */
export const HEADLINE_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

export const DEFAULT_TARGETS = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.target]));

/** A glass of water, for the tap-a-glass tracker. */
export const GLASS_ML = 250;

/** UK alcohol unit: 8 g of ethanol. */
export const ALCOHOL_UNIT_G = 8;

/**
 * Format a nutrient amount for display.
 * null / undefined means "not measured" — never shown as 0.
 */
export const formatAmount = (key, value) => {
  const n = nutrientBy[key];
  if (value === null || value === undefined) return '—';
  if (!n) return String(value);
  const v = Number(value);
  if (Number.isNaN(v)) return '—';
  const rounded = n.dp ? Math.round(v * 10 ** n.dp) / 10 ** n.dp : Math.round(v);
  return `${rounded.toLocaleString()}${n.unit === '%' ? '' : ' '}${n.unit}`;
};
