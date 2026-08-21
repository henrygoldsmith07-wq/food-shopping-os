/**
 * Micronutrient table, per 100 g (or 100 ml for drinks).
 *
 * Values are rounded reference figures for common UK products — enough to make
 * the tracking honest and the maths real, not a clinical database. Columns are
 * fixed and positional so a food is one readable line:
 *
 *   sugar g · satFat g · transFat g · cholesterol mg · sodium mg · potassium mg
 *   calcium mg · iron mg · magnesium mg · zinc mg · vitA µg · vitB %RI
 *   vitC mg · vitD µg · vitE mg · vitK µg · water ml · caffeine mg · alcohol g
 *
 * `vitB` is the one composite: the B vitamins are tracked together as the
 * percentage of the daily B-complex reference intake that 100 g provides,
 * because tracking six separate B vitamins is more precision than this dataset
 * can honestly carry. A strong source (salmon, liver-ish territory) sits around
 * 20% per 100 g, a staple around 5%, so an ordinary day lands near 100%.
 *
 * Missing table rows return null for every column — "not in this database" —
 * never zero. Explicit 0 in a row still means measured none.
 */

export const MICRO_COLUMNS = [
  'sugar', 'satFat', 'transFat', 'cholesterol', 'sodium', 'potassium',
  'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitB',
  'vitC', 'vitD', 'vitE', 'vitK', 'water', 'caffeine', 'alcohol',
];

/* eslint-disable no-multi-spaces */
const TABLE = {
  //                    sug  sat  trn chol   Na    K    Ca   Fe   Mg   Zn   A    B    C    D    E     K   H2O caf alc
  'porridge-oats':      [1,   1.4, 0,    0,    7,  350,  52,  4.3, 138, 3.6,   0,15.7,   0,   0,  0.9,   2,   8,  0, 0],
  'semi-skimmed-milk':  [4.8, 1.1, 0,    8,   44,  150, 120,  0,    11, 0.4,  20,10.5,   1, 0.1, 0.05, 0.2,  89,  0, 0],
  banana:               [12,  0.1, 0,    0,    1,  358,   5,  0.3,  27, 0.15,  3,   7, 8.7,   0,  0.1, 0.5,  75,  0, 0],
  'wholemeal-bread':    [3.6, 0.7, 0.02, 0,  450,  250, 110,  2.7,  76, 1.8,   0, 7.7,   0,   0,  0.6, 1.9,  38,  0, 0],
  'peanut-butter':      [9,  10,   0.05, 0,  350,  650,  43,  1.9, 154, 2.9,   0,12.3,   0,   0,  9,   0.3,   1,  0, 0],
  'greek-yogurt':       [4,   0.1, 0,    5,   36,  141, 110,  0.1,  11, 0.5,   1, 8.8,   0,   0,  0,   0.1,  85,  0, 0],
  blueberries:          [10,  0,   0,    0,    1,   77,   6,  0.3,   6, 0.16,  3, 2.8, 9.7,   0,  0.6,  19,  84,  0, 0],
  egg:                  [0.4, 3.1, 0.03, 372, 142, 138,  56,  1.8,  12, 1.3, 160,  14,   0,   2,  1.1, 0.3,  76,  0, 0],
  'chicken-breast':     [0,   1,   0.03, 85,   74, 256,  15,  1,    29, 1,     9,15.7,   0, 0.1,  0.3, 0.3,  65,  0, 0],
  'salmon-fillet':      [0,   3.1, 0,    63,   61, 384,  15,  0.5,  30, 0.6,  12,  21,   0,  13,  1.1, 0.5,  62,  0, 0],
  'white-rice':         [0.1, 0.1, 0,    0,     1,  35,  10,  0.2,  12, 0.5,   0, 2.8,   0,   0,  0,     0,  69,  0, 0],
  'brown-rice':         [0.4, 0.2, 0,    0,     4,  43,  10,  0.4,  44, 0.6,   0, 4.9,   0,   0,  0.1, 0.6,  70,  0, 0],
  pasta:                [0.6, 0.2, 0,    0,     5,  44,   7,  0.5,  18, 0.5,   0, 4.2,   0,   0,  0.1,   0,  62,  0, 0],
  'olive-oil':          [0,  14,   0,    0,     2,   1,   1,  0.6,   0, 0,     0,   0,   0,   0, 14,    60,   0,  0, 0],
  cheddar:              [0.1,22,   1.2,  105, 620,  98, 720,  0.7,  28, 3.1, 265,   7,   0, 0.6,  0.7, 2.4,  37,  0, 0],
  'baked-beans':        [5,   0.1, 0,    0,   260, 380,  45,  1.4,  31, 0.6,   2, 4.2,   1,   0,  0.2,   2,  74,  0, 0],
  avocado:              [0.7, 2.1, 0,    0,     7, 485,  12,  0.6,  29, 0.6,   7,10.5,  10,   0,  2.1,  21,  73,  0, 0],
  hummus:               [0.3, 3.5, 0,    0,   380, 228,  38,  2.4,  71, 1.6,   0, 6.3, 0.8,   0,  2.6,   5,  57,  0, 0],
  'tortilla-wrap':      [2.5, 2.5, 0.1,  0,   590, 130,  90,  2.6,  20, 0.6,   0,   7,   0,   0,  0.5, 0.5,  30,  0, 0],
  chickpeas:            [1.4, 0.3, 0,    0,   240, 172,  45,  1.6,  39, 1.1,   1, 5.3,   1,   0,  0.3,   2,  68,  0, 0],
  lentils:              [1.8, 0.1, 0,    0,     2, 369,  19,  3.3,  36, 1.3,   1,10.5, 1.5,   0,  0.1, 1.7,  70,  0, 0],
  broccoli:             [1.4, 0.1, 0,    0,    33, 293,  47,  0.7,  21, 0.4,  77,   7,  65,   0,  1.5, 141,  89,  0, 0],
  spinach:              [0.4, 0.1, 0,    0,    79, 558,  99,  2.7,  79, 0.5, 469,12.3,  28,   0,  2,   483,  91,  0, 0],
  'sweet-potato':       [6.5, 0.1, 0,    0,    36, 475,  38,  0.7,  27, 0.3, 709, 8.8,  20,   0,  0.3,   2,  76,  0, 0],
  potato:               [0.9, 0,   0,    0,     5, 379,   8,  0.3,  22, 0.3,   0, 7.7,  13,   0,  0,     2,  77,  0, 0],
  apple:                [10.4,0,   0,    0,     1, 107,   6,  0.1,   5, 0,     3, 2.1, 4.6,   0,  0.2, 2.2,  86,  0, 0],
  orange:               [9.4, 0,   0,    0,     0, 181,  40,  0.1,  10, 0.1,  11, 5.3,  53,   0,  0.2,   0,  87,  0, 0],
  almonds:              [4.4, 3.8, 0,    0,     1, 733, 269,  3.7, 270, 3.1,   0,10.5,   0,   0, 25.6,   0,   4,  0, 0],
  'dark-chocolate':     [24, 24,   0.03, 3,    20, 715,  73, 11.9, 228, 3.3,   2, 4.2,   0,   0,  0.6, 7.3,   1, 80, 0],
  'whey-protein':       [5,   2,   0,    10,  250, 500, 500,  1,    60, 2,     0,  14,   0,   0,  0,     0,   5,  0, 0],
  'protein-bar':        [2,   5,   0.1,  15,  350, 300, 200,  3,    80, 2.5,   0, 8.8,   0,   0,  1,     1,   8,  0, 0],
  cappuccino:           [3.5, 1.2, 0,    6,    30, 120,  90,  0,    12, 0.3,  15, 4.2,   0, 0.1,  0,   0.1,  88, 30, 0],
  'orange-juice':       [8.9, 0,   0,    0,     1, 200,  11,  0.2,  11, 0.05,  8, 6.3,  45,   0,  0.1, 0.1,  88,  0, 0],
  cola:                 [10.6,0,   0,    0,     4,   2,   2,  0,     1, 0,     0,   0,   0,   0,  0,     0,  89, 10, 0],
  lager:                [0.3, 0,   0,    0,     4,  27,   4,  0,     6, 0,     0, 2.8,   0,   0,  0,     0,  92,  0, 3.6],
  crisps:               [0.5, 3.1, 0.1,  0,   540,1190,  24,  1.5,  66, 1,     0,   7,  15,   0,  5,    15,   2,  0, 0],
  digestive:            [17,  9.4, 0.4,  2,   500, 180,  90,  2,    22, 0.6,  30, 4.2,   0,   0,  1.5,   4,   3,  0, 0],
  'tuna-tinned':        [0,   0.2, 0,    30,  320, 237,  12,  1,    27, 0.7,   5,19.3,   0, 1.7,  0.5,   0,  74,  0, 0],
  tofu:                 [0.6, 1.2, 0,    0,    12, 121, 350,  2.7,  58, 1.6,   0, 5.3,   0,   0,  0.6, 2.4,  70,  0, 0],
  butter:               [0.1,51,   3.3,  215,  11,  24,  24,  0,     2, 0.1, 684,   1,   0, 1.5,  2.3,   7,  16,  0, 0],
  mayonnaise:           [1.3,11,   0.2,  42,  620,  20,   8,  0.2,   1, 0.1,  40, 1.4,   0, 0.2,  3.3,  93,  21,  0, 0],
  halloumi:             [2.6,17,   0.9,  65, 1300,  90, 780,  0.4,  25, 2.8, 210, 5.3,   0, 0.4,  0.4,   2,  45,  0, 0],
  granola:              [18,  3,   0.05, 0,    60, 336,  60,  3.3, 110, 2.4,   0, 8.8,   0,   0,  3.5,   2,   5,  0, 0],
  'ice-cream':          [21,  6.8, 0.3,  44,   80, 199, 128,  0.1,  14, 0.7, 118, 3.5, 0.6, 0.3,  0.3, 0.3,  61,  0, 0],
};
/* eslint-enable no-multi-spaces */

/**
 * Micronutrients for a generic food, as an object keyed by nutrient.
 * Unknown foods return null for every column — not zero.
 */
export const microsFor = (foodId) => {
  const row = TABLE[foodId];
  if (!row) return Object.fromEntries(MICRO_COLUMNS.map((k) => [k, null]));
  return Object.fromEntries(MICRO_COLUMNS.map((k, i) => [k, row[i] ?? null]));
};

/**
 * Restaurant menus quote calories, macros and salt — never magnesium. Each
 * menu item names a blend of generic foods it eats like, and its
 * micronutrients are modelled from those. Shares are fractions of the dish;
 * whatever is left over is treated as water (sauce, stock, moisture).
 */
export const BLENDS = {
  'chicken-meal': [['chicken-breast', 0.4], ['white-rice', 0.35], ['broccoli', 0.15]],
  sandwich: [['wholemeal-bread', 0.45], ['chicken-breast', 0.25], ['mayonnaise', 0.08], ['spinach', 0.15]],
  pastry: [['wholemeal-bread', 0.45], ['butter', 0.2], ['chicken-breast', 0.25]],
  burger: [['wholemeal-bread', 0.35], ['chicken-breast', 0.35], ['cheddar', 0.08], ['mayonnaise', 0.12]],
  'salad-bowl': [['spinach', 0.3], ['chickpeas', 0.3], ['avocado', 0.15], ['olive-oil', 0.05]],
  'noodle-soup': [['pasta', 0.3], ['chicken-breast', 0.2], ['spinach', 0.1], ['olive-oil', 0.03]],
  'fried-side': [['potato', 0.75], ['olive-oil', 0.2]],
  sushi: [['white-rice', 0.6], ['salmon-fillet', 0.35]],
  'porridge-pot': [['porridge-oats', 0.35], ['semi-skimmed-milk', 0.5], ['banana', 0.1]],
  'yogurt-pot': [['greek-yogurt', 0.5], ['granola', 0.3], ['blueberries', 0.2]],
  dessert: [['digestive', 0.5], ['ice-cream', 0.45]],
  broth: [['tofu', 0.06], ['spinach', 0.04]],
  'rice-side': [['white-rice', 0.85], ['olive-oil', 0.05]],
  'veg-curry': [['white-rice', 0.45], ['chickpeas', 0.15], ['broccoli', 0.1], ['olive-oil', 0.05]],
  'breaded-chicken': [['chicken-breast', 0.5], ['wholemeal-bread', 0.2], ['olive-oil', 0.15]],
  greens: [['broccoli', 0.55], ['olive-oil', 0.05], ['chickpeas', 0.3]],
  'protein-pot': [['chicken-breast', 0.5], ['avocado', 0.3], ['spinach', 0.1]],
};

/** 1 g of salt is 393 mg of sodium — menus quote salt, we track sodium. */
export const SALT_TO_SODIUM = 393;

/**
 * Blend generic micronutrient rows into a per-100 g profile for a dish.
 * Contributions from missing table rows are skipped (not treated as zero).
 */
export const microsFromBlend = (blendId, saltGramsPer100) => {
  const parts = BLENDS[blendId] || [];
  const out = Object.fromEntries(MICRO_COLUMNS.map((k) => [k, 0]));
  const seen = Object.fromEntries(MICRO_COLUMNS.map((k) => [k, false]));
  let solids = 0;
  for (const [foodId, share] of parts) {
    const micros = microsFor(foodId);
    solids += share;
    for (const k of MICRO_COLUMNS) {
      if (micros[k] === null || micros[k] === undefined) continue;
      out[k] += micros[k] * share;
      seen[k] = true;
    }
  }
  // Whatever the blend doesn't account for is water (sauce, stock, moisture).
  if (seen.water || parts.length) {
    out.water += Math.max(0, 1 - solids) * 100;
    seen.water = true;
  }
  for (const k of MICRO_COLUMNS) {
    if (!seen[k]) out[k] = null;
    else out[k] = Math.round(out[k] * 100) / 100;
  }
  if (saltGramsPer100 !== undefined) out.sodium = Math.round(saltGramsPer100 * SALT_TO_SODIUM);
  return out;
};

/** Fibre also has to be modelled for restaurant dishes. */
export const FIBRE_PER_100 = {
  'porridge-oats': 9, 'wholemeal-bread': 6.5, 'brown-rice': 1.8, 'white-rice': 0.4, pasta: 1.8,
  broccoli: 3.3, spinach: 2.2, chickpeas: 6, lentils: 8, avocado: 6.7, banana: 2.6, blueberries: 2.4,
  potato: 1.8, 'sweet-potato': 3.3, granola: 7, digestive: 3, 'ice-cream': 0.7, almonds: 12.5,
  cheddar: 0, 'chicken-breast': 0, 'salmon-fillet': 0, mayonnaise: 0, butter: 0, 'olive-oil': 0,
  tofu: 2, 'greek-yogurt': 0, 'semi-skimmed-milk': 0, crisps: 4, hummus: 6,
};

export const fibreFromBlend = (blendId) =>
  Math.round(((BLENDS[blendId] || []).reduce((sum, [id, share]) => sum + (FIBRE_PER_100[id] || 0) * share, 0)) * 10) / 10;
