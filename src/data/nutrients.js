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
 *
 * Micronutrients are tracked individually rather than as a vitamin blur: each
 * B vitamin, iodine, selenium and omega-3 have their own row, their own
 * reference intake and — where an authority has published one — their own
 * tolerable upper level, so a day can be short of folate without that being
 * hidden inside a single "B complex" number.
 */

export const NUTRIENT_GROUPS = [
  { id: 'macro', label: 'Macronutrients' },
  { id: 'fat', label: 'Fats & cholesterol' },
  { id: 'mineral', label: 'Minerals' },
  { id: 'vitamin', label: 'Vitamins' },
  { id: 'bvitamin', label: 'B vitamins' },
  { id: 'other', label: 'Water, caffeine & alcohol' },
];

/** key, label, unit, group, daily reference, goal|limit, decimal places */
const N = (key, label, unit, group, target, kind = 'goal', dp = 0, extra = {}) =>
  ({ key, label, unit, group, target, kind, dp, upper: null, composite: false, ...extra });

/**
 * Tolerable upper intake levels, in the nutrient's own unit.
 *
 * Only nutrients that actually have a published UK/EFSA/US upper level carry
 * one. Where no authority has set a level — magnesium from food, potassium,
 * vitamin C — the field stays null and nothing is ever flagged as excess,
 * because "no published limit" is not the same as "safe at any dose".
 */
const UL = (upper) => ({ upper });

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
  N('omega3', 'Omega-3', 'g', 'fat', 2, 'goal', 2),

  N('sodium', 'Sodium', 'mg', 'mineral', 2300, 'limit'),
  N('potassium', 'Potassium', 'mg', 'mineral', 3500),
  N('calcium', 'Calcium', 'mg', 'mineral', 800, 'goal', 0, UL(2500)),
  N('iron', 'Iron', 'mg', 'mineral', 14, 'goal', 1, UL(45)),
  N('magnesium', 'Magnesium', 'mg', 'mineral', 375),
  N('zinc', 'Zinc', 'mg', 'mineral', 10, 'goal', 1, UL(25)),
  N('iodine', 'Iodine', 'µg', 'mineral', 150, 'goal', 0, UL(600)),
  N('selenium', 'Selenium', 'µg', 'mineral', 55, 'goal', 0, UL(300)),

  N('vitA', 'Vitamin A', 'µg', 'vitamin', 800, 'goal', 0, UL(3000)),
  N('vitC', 'Vitamin C', 'mg', 'vitamin', 80),
  N('vitD', 'Vitamin D', 'µg', 'vitamin', 10, 'goal', 1, UL(100)),
  N('vitE', 'Vitamin E', 'mg', 'vitamin', 12, 'goal', 1, UL(300)),
  N('vitK', 'Vitamin K', 'µg', 'vitamin', 75),

  N('vitB1', 'Thiamin (B1)', 'mg', 'bvitamin', 1.1, 'goal', 2),
  N('vitB2', 'Riboflavin (B2)', 'mg', 'bvitamin', 1.4, 'goal', 2),
  N('vitB3', 'Niacin (B3)', 'mg', 'bvitamin', 16, 'goal', 1, UL(900)),
  N('vitB5', 'Pantothenic acid (B5)', 'mg', 'bvitamin', 6, 'goal', 2),
  N('vitB6', 'Vitamin B6', 'mg', 'bvitamin', 1.4, 'goal', 2, UL(25)),
  N('vitB7', 'Biotin (B7)', 'µg', 'bvitamin', 50, 'goal', 1),
  N('vitB9', 'Folate (B9)', 'µg', 'bvitamin', 200, 'goal', 0, UL(1000)),
  N('vitB12', 'Vitamin B12', 'µg', 'bvitamin', 2.5, 'goal', 2),
  // Kept as the one-line summary of the eight above, not a ninth B vitamin:
  // it is the share of the daily B-complex reference 100 g of a food carries.
  N('vitB', 'Vitamin B complex', '%', 'bvitamin', 100, 'goal', 0, { composite: true }),

  N('water', 'Water', 'ml', 'other', 2000),
  N('caffeine', 'Caffeine', 'mg', 'other', 400, 'limit'),
  N('alcohol', 'Alcohol', 'g', 'other', 16, 'limit', 1),
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);
export const nutrientBy = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

/** The four the app has always led with — rings, cards, quick add. */
export const HEADLINE_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

export const DEFAULT_TARGETS = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.target]));

/** Published upper intake levels, keyed by nutrient. Absent = no level set. */
export const UPPER_LIMITS = Object.fromEntries(
  NUTRIENTS.filter((n) => n.upper).map((n) => [n.key, n.upper]),
);

/**
 * The nutrients the deficiency work is about: everything in the mineral,
 * vitamin and B-vitamin groups except sodium (a limit, not a goal) and the
 * vitB composite (a summary of the eight B vitamins, not a ninth) — plus
 * omega-3, which sits in the fats group for reading but is a nutrient you can
 * be short of in exactly the same way.
 */
const MICRO_GROUP_IDS = ['mineral', 'vitamin', 'bvitamin'];

export const MICRONUTRIENT_KEYS = NUTRIENTS
  .filter((n) => MICRO_GROUP_IDS.includes(n.group) || n.key === 'omega3')
  .filter((n) => n.kind === 'goal' && !n.composite)
  .map((n) => n.key);

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
