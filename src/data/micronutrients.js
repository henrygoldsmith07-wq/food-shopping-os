/**
 * Micronutrient tables, per 100 g (or 100 ml for drinks).
 *
 * Values are rounded reference figures for common UK products — enough to make
 * the tracking honest and the maths real, not a clinical database. Columns are
 * fixed and positional so a food is one readable line. The base table carries:
 *
 *   sugar g · satFat g · transFat g · cholesterol mg · sodium mg · potassium mg
 *   calcium mg · iron mg · magnesium mg · zinc mg · vitA µg · vitB %RI
 *   vitC mg · vitD µg · vitE mg · vitK µg · water ml · caffeine mg · alcohol g
 *
 * and the deep table next to it carries iodine, selenium, omega-3 and the
 * eight B vitamins individually, so a folate gap can be seen as a folate gap.
 *
 * `vitB` survives as a summary rather than a nutrient: the share of the daily
 * B-complex reference that 100 g provides, kept because it reads at a glance
 * where eight separate rows do not. Deficiency work uses the individual
 * vitamins; `vitB` is marked composite and left out of it.
 *
 * Missing table rows return null for every column — "not in this database" —
 * never zero. Explicit 0 in a row still means measured none.
 */

const BASE_COLUMNS = [
  'sugar', 'satFat', 'transFat', 'cholesterol', 'sodium', 'potassium',
  'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitB',
  'vitC', 'vitD', 'vitE', 'vitK', 'water', 'caffeine', 'alcohol',
];

/**
 * The deep micronutrient columns, in their own table so each stays readable:
 *
 *   iodine µg · selenium µg · omega-3 g · B1 mg · B2 mg · B3 mg · B5 mg
 *   B6 mg · B7 µg · B9 µg · B12 µg
 *
 * Same rules as the base table — a food absent here reads as null for these
 * columns, and an explicit 0 means measured none. Omega-3 is total n-3 fatty
 * acids (ALA plus EPA/DHA where the food has them), which is why oily fish and
 * rapeseed-oil mayonnaise are the outliers.
 */
const EXTRA_COLUMNS = [
  'iodine', 'selenium', 'omega3', 'vitB1', 'vitB2', 'vitB3', 'vitB5',
  'vitB6', 'vitB7', 'vitB9', 'vitB12',
];

export const MICRO_COLUMNS = [...BASE_COLUMNS, ...EXTRA_COLUMNS];

/* Columns are padded to line up: the alignment is the readability. */
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
  'cod-fillet':         [0,   0.1, 0,    43,   83, 285,  14,  0.4,  33, 0.5,  10,   8,   1, 0.9,  0.7, 0.1,  82,  0, 0],
  prawns:               [0,   0.2, 0,   152,  670, 260,  62,  0.6,  37, 1.6,  54,   9,   0, 0.1,  2.1, 0.1,  78,  0, 0],
  'plain-yogurt':       [4.7, 1.9, 0,    10,   46, 155, 121,  0.1,  12, 0.6,  27, 9.3, 0.5, 0.1, 0.03, 0.2,  84,  0, 0],
  'soy-sauce':          [0.6,   0, 0,     0, 5490, 220,  20,  2.4,  50, 0.5,   0, 2.8, 0.8,   0,  0.1, 0.3,  68,  0, 0],
  'plain-flour':        [1,   0.2, 0,     0,    2, 107,  15,  1.2,  20, 0.7,   0, 5.3,   0,   0, 0.06, 0.3,  13,  0, 0],
};

const EXTRA = {
  //                       I     Se    n-3     B1     B2     B3     B5     B6     B7     B9   B12
  'porridge-oats':     [   0,    28,  0.11,  0.76,  0.14,  0.96,  1.35,   0.1,    20,    56,    0],
  'semi-skimmed-milk': [  30,     3,  0.01,  0.04,  0.18,  0.09,  0.36,  0.04,     2,     5, 0.45],
  banana:              [   2,     1,  0.03,  0.03,  0.07,  0.67,  0.33,  0.37,   0.1,    20,    0],
  'wholemeal-bread':   [   5,    25,  0.15,  0.39,  0.18,   4.4,  0.65,  0.21,     3,    42,    0],
  'peanut-butter':     [   2,     6,  0.05,  0.11,  0.11,  13.1,   1.1,  0.44,    30,    87,    0],
  'greek-yogurt':      [  27,    10,     0,  0.04,  0.28,   0.2,   0.5,  0.06,     2,     7, 0.75],
  blueberries:         [   0,   0.1,  0.06,  0.04,  0.04,  0.42,  0.12,  0.05,   0.5,     6,    0],
  egg:                 [  53,    30,   0.1,  0.07,  0.46,  0.08,  1.53,  0.17,    20,    47,  1.1],
  'chicken-breast':    [   7,    24,  0.03,  0.07,  0.12,  13.7,     1,   0.6,     2,     4,  0.3],
  'salmon-fillet':     [  14,    36,   2.5,  0.23,  0.38,   8.5,   1.6,   0.8,     5,    26,  3.2],
  'white-rice':        [   0,   7.5,  0.01,  0.02,  0.01,   0.4,  0.39,  0.05,   0.5,     3,    0],
  'brown-rice':        [   0,   9.8,  0.01,   0.1,  0.02,   1.5,  0.29,  0.15,     1,     4,    0],
  pasta:               [   1,    26,  0.03,  0.14,  0.06,   1.2,  0.11,  0.05,   0.5,     7,    0],
  'olive-oil':         [   0,     0,  0.76,     0,     0,     0,     0,     0,     0,     0,    0],
  cheddar:             [  30,    14,  0.36,  0.03,  0.43,  0.06,  0.41,  0.07,   2.4,    27,  1.1],
  'baked-beans':       [   3,   3.5,  0.11,  0.07,  0.05,   0.5,  0.16,  0.11,     2,    29,    0],
  avocado:             [   1,   0.4,  0.11,  0.07,  0.13,  1.74,  1.39,  0.26,   3.6,    81,    0],
  hummus:              [   1,   2.6,  0.11,  0.09,  0.05,  0.58,  0.23,  0.16,     2,    48,    0],
  'tortilla-wrap':     [   3,    15,  0.06,  0.35,   0.2,   3.2,   0.3,  0.06,     1,    40,    0],
  chickpeas:           [   1,   3.7,  0.03,  0.06,  0.03,  0.27,  0.28,  0.14,     2,    54,    0],
  lentils:             [   1,   2.8,  0.04,  0.17,  0.07,  1.06,  0.64,  0.18,     2,   181,    0],
  broccoli:            [   2,   2.5,  0.13,  0.07,  0.12,  0.64,  0.57,  0.18,   1.5,    63,    0],
  spinach:             [  12,     1,  0.14,  0.08,  0.19,  0.72,  0.07,   0.2,   6.9,   194,    0],
  'sweet-potato':      [   3,   0.6,  0.01,  0.08,  0.06,  0.56,   0.8,  0.21,   4.4,    11,    0],
  potato:              [   3,   0.3,  0.01,  0.08,  0.03,  1.06,   0.3,   0.3,   0.4,    15,    0],
  apple:               [   1,     0,  0.01,  0.02,  0.03,  0.09,  0.06,  0.04,   0.9,     3,    0],
  orange:              [   1,   0.5,  0.01,  0.09,  0.04,  0.28,  0.25,  0.06,     1,    30,    0],
  almonds:             [   2,   4.1,  0.01,  0.21,  1.14,   3.6,  0.47,  0.14,    45,    44,    0],
  'dark-chocolate':    [   3,   6.8,  0.03,  0.03,  0.08,  1.05,  0.42,  0.04,     3,    12,  0.3],
  'whey-protein':      [  20,    30,     0,   0.2,   1.2,     2,     3,   0.5,    15,    30,  1.5],
  'protein-bar':       [  10,    15,  0.05,   0.3,   0.4,     5,   1.5,   0.4,    10,    40,    1],
  cappuccino:          [  20,     2,     0,  0.03,  0.14,   0.2,   0.3,  0.03,   1.5,     4, 0.35],
  'orange-juice':      [   1,   0.1,     0,  0.07,  0.02,  0.28,  0.19,  0.04,   0.5,    19,    0],
  cola:                [   0,     0,     0,     0,     0,     0,     0,     0,     0,     0,    0],
  lager:               [   1,   0.6,     0,  0.01,  0.03,   0.5,  0.04,  0.05,     1,     6, 0.02],
  crisps:              [   2,     3,   0.2,  0.17,  0.06,   3.7,  0.65,   0.6,     1,    40,    0],
  digestive:           [   4,    12,   0.1,  0.15,   0.1,   1.6,   0.3,  0.06,     2,    15,    0],
  'tuna-tinned':       [  12,    60,  0.28,  0.02,  0.08,  12.4,  0.28,  0.32,     2,     4,  2.2],
  tofu:                [   1,   9.9,  0.28,  0.08,  0.05,   0.2,  0.12,  0.05,     3,    19,    0],
  butter:              [  38,     1,  0.32,  0.01,  0.03,  0.04,  0.11, 0.003,   0.4,     3, 0.17],
  mayonnaise:          [   5,     3,   4.2,  0.01,  0.02,  0.02,  0.09,  0.02,     2,     5,  0.1],
  halloumi:            [  35,    15,  0.25,  0.03,  0.35,   0.2,   0.4,  0.06,     2,    20,    1],
  granola:             [   1,    12,   0.3,   0.4,   0.2,   1.8,   0.9,  0.15,    15,    40,    0],
  'ice-cream':         [  25,   3.4,  0.03,  0.04,  0.24,  0.12,   0.6,  0.05,     2,     5,  0.4],
  'cod-fillet':        [  90,    27,  0.22,  0.05,  0.08,   2.6,  0.15,  0.25,     1,    12,  1.1],
  prawns:              [  38,    38,  0.34,  0.02,  0.05,   4.6,  0.65,  0.12,     2,     8,  1.4],
  'plain-yogurt':      [  27,     7,  0.01,  0.03,  0.22,   0.2,  0.35,  0.05,     2,     7,  0.4],
  'soy-sauce':         [   3,     1,     0,  0.03,  0.12,   1.5,  0.25,  0.08,     5,     9,  0.1],
  'plain-flour':       [   1,     4,  0.01,  0.23,  0.07,   2.3,  0.45,  0.05,     1,    15,    0],
};

const nullRow = () => Object.fromEntries(MICRO_COLUMNS.map((k) => [k, null]));

const readRow = (row, columns) => (row
  ? Object.fromEntries(columns.map((k, i) => [k, row[i] ?? null]))
  : Object.fromEntries(columns.map((k) => [k, null])));

/**
 * Micronutrients for a generic food, as an object keyed by nutrient.
 * Unknown foods return null for every column — not zero. A food in the base
 * table but not yet in the deep table keeps its base figures and reads null
 * for the deep ones, rather than borrowing a neighbour's.
 */
export const microsFor = (foodId) => {
  const base = TABLE[foodId];
  const extra = EXTRA[foodId];
  if (!base && !extra) return nullRow();
  return { ...readRow(base, BASE_COLUMNS), ...readRow(extra, EXTRA_COLUMNS) };
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
