/**
 * Food catalogue for logging: generic staples, branded products (with
 * barcodes) and restaurant menus. Nutrition is always stored per 100 g/ml so
 * every portion — a serving, a slice, a weighed amount — is one multiplication.
 *
 * `n` takes [kcal, protein, carbs, fat, fibre]; `s` takes [label, grams] pairs
 * with the first entry acting as the default serving.
 */

import { microsFor, microsFromBlend, fibreFromBlend } from './micronutrients.js';
import { EXPANDED_FOODS } from './expanded-foods.js';

const n = ([kcal, protein, carbs, fat, fibre = 0]) => ({ kcal, protein, carbs, fat, fibre });
const s = (pairs) => pairs.map(([label, grams]) => ({ label, grams }));

/** Energy + macros live here; the other 19 nutrients come from the micro table. */
const food = (id, name, emoji, per100, servings, extra = {}) => {
  const { micronutrientId = id, ...details } = extra;
  return {
    id,
    name,
    emoji,
    unit: 'g',
    source: 'generic',
    tags: [],
    per100: { ...n(per100), ...microsFor(micronutrientId) },
    servings: s(servings),
    ...details,
  };
};

/* ---------- Everyday foods ---------- */

const CORE_FOODS = [
  food('porridge-oats', 'Porridge oats', '🌾', [379, 11, 60, 8, 9],
    [['1 serving (40 g)', 40], ['Small bowl (30 g)', 30], ['Big bowl (60 g)', 60]],
    { brand: 'Quaker', barcode: '5000108000015', source: 'branded', tags: ['breakfast', 'grain'] }),
  food('semi-skimmed-milk', 'Semi-skimmed milk', '🥛', [50, 3.6, 4.8, 1.8],
    [['Splash (50 ml)', 50], ['Glass (200 ml)', 200], ['Mug (250 ml)', 250]],
    { unit: 'ml', barcode: '5000108000022', tags: ['dairy', 'drink'] }),
  food('banana', 'Banana', '🍌', [89, 1.1, 23, 0.3, 2.6],
    [['1 medium (118 g)', 118], ['1 small (90 g)', 90], ['1 large (140 g)', 140]],
    { tags: ['fruit', 'snack'] }),
  food('wholemeal-bread', 'Wholemeal bread', '🍞', [247, 10, 41, 3.4, 6.5],
    [['1 slice (36 g)', 36], ['2 slices (72 g)', 72], ['Thick slice (44 g)', 44]],
    { brand: 'Hovis', barcode: '5000108000039', source: 'branded', tags: ['bread', 'breakfast'] }),
  food('peanut-butter', 'Peanut butter', '🥜', [598, 25, 20, 50, 6],
    [['1 tbsp (16 g)', 16], ['2 tbsp (32 g)', 32]],
    { brand: 'Whole Earth', barcode: '5000108000046', source: 'branded', tags: ['spread'] }),
  food('greek-yogurt', 'Greek yogurt 0%', '🥣', [57, 10, 4, 0.4],
    [['Pot (170 g)', 170], ['Serving (100 g)', 100], ['Big bowl (250 g)', 250]],
    { brand: 'Fage', barcode: '5000108000053', source: 'branded', tags: ['dairy', 'high-protein'] }),
  food('blueberries', 'Blueberries', '🫐', [57, 0.7, 14, 0.3, 2.4],
    [['Handful (40 g)', 40], ['Punnet (150 g)', 150]], { tags: ['fruit'] }),
  food('egg', 'Egg', '🥚', [143, 13, 0.7, 9.5],
    [['1 medium (58 g)', 58], ['2 medium (116 g)', 116], ['3 medium (174 g)', 174]],
    { tags: ['high-protein', 'breakfast'] }),
  food('chicken-breast', 'Chicken breast, cooked', '🍗', [165, 31, 0, 3.6],
    [['1 breast (150 g)', 150], ['Half breast (75 g)', 75], ['100 g', 100]],
    { tags: ['high-protein', 'meat'] }),
  food('salmon-fillet', 'Salmon fillet, cooked', '🐟', [208, 20, 0, 13],
    [['1 fillet (130 g)', 130], ['100 g', 100]], { tags: ['high-protein', 'fish'] }),
  food('white-rice', 'White rice, cooked', '🍚', [130, 2.7, 28, 0.3, 0.4],
    [['Serving (180 g)', 180], ['Small (120 g)', 120], ['Large (250 g)', 250]], { tags: ['grain'] }),
  food('brown-rice', 'Brown rice, cooked', '🍚', [123, 2.7, 26, 1, 1.8],
    [['Serving (180 g)', 180], ['Small (120 g)', 120]], { tags: ['grain'] }),
  food('pasta', 'Pasta, cooked', '🍝', [158, 6, 31, 0.9, 1.8],
    [['Serving (200 g)', 200], ['Large (280 g)', 280]], { tags: ['grain'] }),
  food('olive-oil', 'Olive oil', '🫒', [884, 0, 0, 100],
    [['1 tbsp (14 g)', 14], ['1 tsp (5 g)', 5], ['Drizzle (8 g)', 8]], { tags: ['fat'] }),
  food('cheddar', 'Cheddar', '🧀', [416, 25, 0.1, 35],
    [['Slice (25 g)', 25], ['Grated handful (30 g)', 30], ['Chunk (50 g)', 50]], { tags: ['dairy'] }),
  food('baked-beans', 'Baked beans', '🥫', [78, 4.7, 12.5, 0.2, 3.7],
    [['Half tin (207 g)', 207], ['Full tin (415 g)', 415], ['Small serving (120 g)', 120]],
    { brand: 'Heinz', barcode: '5000108000060', source: 'branded', tags: ['tinned'] }),
  food('avocado', 'Avocado', '🥑', [160, 2, 8.5, 15, 6.7],
    [['Half (75 g)', 75], ['Whole (150 g)', 150]], { tags: ['fruit', 'fat'] }),
  food('hummus', 'Hummus', '🫙', [303, 8, 12, 24, 6],
    [['2 tbsp (40 g)', 40], ['Pot (170 g)', 170]], { tags: ['dip'] }),
  food('tortilla-wrap', 'Tortilla wrap', '🌮', [297, 8, 49, 7, 3],
    [['1 wrap (62 g)', 62], ['2 wraps (124 g)', 124]], { tags: ['bread'] }),
  food('chickpeas', 'Chickpeas, tinned', '🫘', [119, 7.2, 16, 2.6, 6],
    [['Half tin (120 g)', 120], ['Full tin (240 g)', 240]], { tags: ['tinned', 'plant-protein'] }),
  food('lentils', 'Lentils, cooked', '🫘', [116, 9, 20, 0.4, 8],
    [['Serving (150 g)', 150], ['100 g', 100]], { tags: ['plant-protein'] }),
  food('broccoli', 'Broccoli, steamed', '🥦', [35, 2.4, 7, 0.4, 3.3],
    [['Serving (80 g)', 80], ['Big serving (150 g)', 150]], { tags: ['veg'] }),
  food('spinach', 'Spinach', '🥬', [23, 2.9, 3.6, 0.4, 2.2],
    [['Handful (30 g)', 30], ['Bag (150 g)', 150]], { tags: ['veg'] }),
  food('sweet-potato', 'Sweet potato, roasted', '🍠', [90, 2, 21, 0.2, 3.3],
    [['1 medium (150 g)', 150], ['Serving (200 g)', 200]], { tags: ['veg', 'carb'] }),
  food('potato', 'Potatoes, boiled', '🥔', [87, 1.9, 20, 0.1, 1.8],
    [['Serving (180 g)', 180], ['Small (120 g)', 120]], { tags: ['veg', 'carb'] }),
  food('apple', 'Apple', '🍎', [52, 0.3, 14, 0.2, 2.4],
    [['1 medium (150 g)', 150], ['1 small (110 g)', 110]], { tags: ['fruit', 'snack'] }),
  food('orange', 'Orange', '🍊', [47, 0.9, 12, 0.1, 2.4],
    [['1 medium (140 g)', 140]], { tags: ['fruit', 'snack'] }),
  food('almonds', 'Almonds', '🥜', [579, 21, 22, 50, 12.5],
    [['Handful (28 g)', 28], ['Small handful (15 g)', 15]], { tags: ['snack', 'fat'] }),
  food('dark-chocolate', 'Dark chocolate 70%', '🍫', [598, 7.8, 46, 43, 11],
    [['2 squares (20 g)', 20], ['Half bar (50 g)', 50]], { tags: ['snack', 'treat'] }),
  food('whey-protein', 'Whey protein powder', '💪', [380, 76, 8, 5],
    [['1 scoop (30 g)', 30], ['2 scoops (60 g)', 60]],
    { brand: 'MyProtein', barcode: '5000108000077', source: 'branded', tags: ['high-protein', 'supplement'] }),
  food('protein-bar', 'Protein bar', '💪', [352, 33, 30, 11, 5],
    [['1 bar (60 g)', 60], ['Half bar (30 g)', 30]],
    { brand: 'Grenade', barcode: '5000108000084', source: 'branded', tags: ['snack', 'high-protein'] }),
  food('cappuccino', 'Cappuccino', '☕', [45, 2.4, 4.3, 2],
    [['Regular (240 ml)', 240], ['Large (350 ml)', 350]], { unit: 'ml', tags: ['drink'] }),
  food('orange-juice', 'Orange juice', '🍊', [45, 0.7, 10.4, 0.2],
    [['Glass (200 ml)', 200], ['Small glass (150 ml)', 150]], { unit: 'ml', tags: ['drink'] }),
  food('cola', 'Cola', '🥤', [42, 0, 10.6, 0],
    [['Can (330 ml)', 330], ['Bottle (500 ml)', 500]],
    { brand: 'Coca-Cola', barcode: '5000108000091', source: 'branded', unit: 'ml', tags: ['drink'] }),
  food('lager', 'Lager 4.5%', '🍺', [43, 0.5, 3.2, 0],
    [['Pint (568 ml)', 568], ['Bottle (330 ml)', 330]], { unit: 'ml', tags: ['drink', 'alcohol'] }),
  food('crisps', 'Ready salted crisps', '🥔', [532, 6.6, 50, 34, 4],
    [['Standard bag (25 g)', 25], ['Grab bag (45 g)', 45], ['Sharing bag (150 g)', 150]],
    { brand: 'Walkers', barcode: '5000108000107', source: 'branded', tags: ['snack'] }),
  food('digestive', 'Digestive biscuit', '🍪', [478, 6.7, 63, 21, 3],
    [['1 biscuit (14.5 g)', 14.5], ['2 biscuits (29 g)', 29]],
    { brand: 'McVitie’s', barcode: '5000108000114', source: 'branded', tags: ['snack', 'treat'] }),
  food('tuna-tinned', 'Tuna in spring water', '🐟', [109, 25, 0, 0.8],
    [['1 tin (112 g)', 112], ['Half tin (56 g)', 56]],
    { brand: 'John West', barcode: '5000108000121', source: 'branded', tags: ['high-protein', 'tinned'] }),
  food('tofu', 'Firm tofu', '⬜', [144, 15, 3, 8, 2],
    [['Half block (140 g)', 140], ['Block (280 g)', 280]], { tags: ['plant-protein'] }),
  food('butter', 'Butter', '🧈', [717, 0.9, 0.1, 81],
    [['Thin spread (7 g)', 7], ['Knob (14 g)', 14]], { tags: ['fat', 'dairy'] }),
  food('mayonnaise', 'Mayonnaise', '🫙', [680, 1, 1.3, 75],
    [['1 tbsp (13 g)', 13], ['2 tbsp (26 g)', 26]], { tags: ['sauce', 'fat'] }),
  food('halloumi', 'Halloumi', '🧀', [321, 22, 2.6, 25],
    [['2 slices (60 g)', 60], ['Half block (100 g)', 100]], { tags: ['dairy'] }),
  food('granola', 'Granola', '🥣', [471, 10, 61, 20, 7],
    [['Serving (45 g)', 45], ['Big serving (70 g)', 70]], { tags: ['breakfast'] }),
  food('ice-cream', 'Vanilla ice cream', '🍦', [207, 3.5, 24, 11],
    [['2 scoops (100 g)', 100], ['Tub (450 g)', 450]], { tags: ['treat'] }),

  /* ---------- More everyday foods ---------- */

  food('weetabix', 'Weetabix', '🌾', [362, 12, 69, 2, 10],
    [['2 biscuits (37.5 g)', 37.5], ['1 biscuit (18.75 g)', 18.75], ['3 biscuits (56.25 g)', 56.25]],
    { brand: 'Weetabix', tags: ['breakfast', 'cereal', 'high-fibre'], micronutrientId: 'porridge-oats' }),
  food('corn-flakes', 'Corn flakes', '🌽', [378, 7, 84, 0.9, 3],
    [['Bowl (30 g)', 30], ['Large bowl (45 g)', 45]],
    { tags: ['breakfast', 'cereal'], micronutrientId: 'porridge-oats' }),
  food('muesli', 'Muesli', '🥣', [360, 10, 64, 7, 8],
    [['Bowl (45 g)', 45], ['Large bowl (70 g)', 70]],
    { tags: ['breakfast', 'cereal', 'high-fibre'], micronutrientId: 'porridge-oats' }),
  food('full-fat-milk', 'Whole milk', '🥛', [64, 3.4, 4.7, 3.6],
    [['Splash (50 ml)', 50], ['Glass (200 ml)', 200], ['Mug (250 ml)', 250]],
    { unit: 'ml', tags: ['dairy', 'drink'], micronutrientId: 'semi-skimmed-milk' }),
  food('skimmed-milk', 'Skimmed milk', '🥛', [35, 3.6, 5, 0.1],
    [['Splash (50 ml)', 50], ['Glass (200 ml)', 200], ['Mug (250 ml)', 250]],
    { unit: 'ml', tags: ['dairy', 'drink'], micronutrientId: 'semi-skimmed-milk' }),
  food('oat-drink', 'Oat drink', '🥛', [46, 1, 6.7, 1.5, 0.8],
    [['Splash (50 ml)', 50], ['Glass (200 ml)', 200], ['Mug (250 ml)', 250]],
    { unit: 'ml', tags: ['vegan', 'drink', 'milk alternative'], micronutrientId: 'semi-skimmed-milk' }),
  food('plain-yogurt', 'Plain yogurt', '🥣', [61, 3.5, 4.7, 3.3],
    [['Small pot (125 g)', 125], ['Bowl (170 g)', 170]],
    { tags: ['dairy', 'breakfast'], micronutrientId: 'greek-yogurt' }),
  food('cottage-cheese', 'Cottage cheese', '🧀', [98, 12.4, 3.4, 4.3],
    [['Half tub (150 g)', 150], ['2 tbsp (60 g)', 60]],
    { tags: ['dairy', 'high-protein'], micronutrientId: 'greek-yogurt' }),

  food('chicken-thigh', 'Chicken thigh, cooked', '🍗', [209, 26, 0, 10.9],
    [['1 thigh (100 g)', 100], ['2 thighs (200 g)', 200]],
    { tags: ['high-protein', 'meat'], micronutrientId: 'chicken-breast' }),
  food('beef-mince', 'Lean beef mince 5%, cooked', '🥩', [172, 26, 0, 7],
    [['Serving (125 g)', 125], ['Large serving (200 g)', 200]],
    { tags: ['high-protein', 'meat'], micronutrientId: 'chicken-breast' }),
  food('turkey-breast', 'Turkey breast, cooked', '🍗', [135, 30, 0, 1],
    [['Serving (120 g)', 120], ['2 slices (50 g)', 50]],
    { tags: ['high-protein', 'meat'], micronutrientId: 'chicken-breast' }),
  food('pork-loin', 'Pork loin, cooked', '🥩', [196, 29, 0, 8],
    [['1 chop (140 g)', 140], ['Serving (100 g)', 100]],
    { tags: ['high-protein', 'meat'], micronutrientId: 'chicken-breast' }),
  food('cod-fillet', 'Cod fillet, cooked', '🐟', [89, 19.9, 0, 0.7],
    [['1 fillet (140 g)', 140], ['Small fillet (100 g)', 100]],
    { tags: ['high-protein', 'fish'], micronutrientId: 'tuna-tinned' }),
  food('prawns', 'Prawns, cooked', '🍤', [99, 24, 0.2, 0.3],
    [['Half pack (100 g)', 100], ['Handful (60 g)', 60]],
    { tags: ['high-protein', 'fish'], micronutrientId: 'tuna-tinned' }),
  food('kidney-beans', 'Kidney beans, tinned', '🫘', [94, 6.9, 13.5, 0.5, 6.4],
    [['Half tin (120 g)', 120], ['Full tin (240 g)', 240]],
    { tags: ['plant-protein', 'tinned', 'high-fibre'], micronutrientId: 'chickpeas' }),
  food('black-beans', 'Black beans, tinned', '🫘', [116, 7.8, 16, 0.5, 6.9],
    [['Half tin (120 g)', 120], ['Full tin (240 g)', 240]],
    { tags: ['plant-protein', 'tinned', 'high-fibre'], micronutrientId: 'chickpeas' }),
  food('tempeh', 'Tempeh', '🫘', [193, 20.3, 7.6, 10.8, 6],
    [['Half pack (100 g)', 100], ['Full pack (200 g)', 200]],
    { tags: ['vegan', 'plant-protein', 'high-protein'], micronutrientId: 'tofu' }),

  food('couscous', 'Couscous, cooked', '🍚', [112, 3.8, 23.2, 0.2, 1.4],
    [['Serving (150 g)', 150], ['Small serving (100 g)', 100]],
    { tags: ['grain'], micronutrientId: 'white-rice' }),
  food('quinoa', 'Quinoa, cooked', '🌾', [120, 4.4, 21.3, 1.9, 2.8],
    [['Serving (150 g)', 150], ['Small serving (100 g)', 100]],
    { tags: ['grain', 'plant-protein'], micronutrientId: 'brown-rice' }),
  food('egg-noodles', 'Egg noodles, cooked', '🍜', [138, 4.5, 25, 2.1, 1.2],
    [['Serving (180 g)', 180], ['Small serving (120 g)', 120]],
    { tags: ['grain', 'egg'], micronutrientId: 'pasta' }),
  food('white-bread', 'White bread', '🍞', [265, 9, 49, 3.2, 2.7],
    [['1 slice (36 g)', 36], ['2 slices (72 g)', 72], ['Thick slice (44 g)', 44]],
    { tags: ['bread', 'breakfast'], micronutrientId: 'wholemeal-bread' }),
  food('plain-bagel', 'Plain bagel', '🥯', [257, 10, 50, 1.7, 2.3],
    [['1 bagel (90 g)', 90], ['Half bagel (45 g)', 45]],
    { tags: ['bread', 'breakfast'], micronutrientId: 'wholemeal-bread' }),

  food('carrots', 'Carrots', '🥕', [35, 0.8, 8.2, 0.2, 3],
    [['1 medium (60 g)', 60], ['Serving (80 g)', 80]],
    { tags: ['veg', 'snack'], micronutrientId: 'sweet-potato' }),
  food('peas', 'Garden peas', '🫛', [79, 5.4, 10, 1.1, 5.5],
    [['Serving (80 g)', 80], ['Large serving (120 g)', 120]],
    { tags: ['veg', 'plant-protein'], micronutrientId: 'broccoli' }),
  food('red-pepper', 'Red pepper', '🫑', [31, 1, 6, 0.3, 2.1],
    [['Half pepper (80 g)', 80], ['1 pepper (160 g)', 160]],
    { tags: ['veg'], micronutrientId: 'broccoli' }),
  food('tomatoes', 'Tomatoes', '🍅', [18, 0.9, 3.9, 0.2, 1.2],
    [['1 medium (80 g)', 80], ['Handful (120 g)', 120]],
    { tags: ['veg'], micronutrientId: 'broccoli' }),
  food('cucumber', 'Cucumber', '🥒', [15, 0.7, 3.6, 0.1, 0.5],
    [['Quarter cucumber (75 g)', 75], ['Half cucumber (150 g)', 150]],
    { tags: ['veg', 'snack'], micronutrientId: 'broccoli' }),
  food('mushrooms', 'Mushrooms', '🍄', [22, 3.1, 3.3, 0.3, 1],
    [['Handful (80 g)', 80], ['Half pack (125 g)', 125]],
    { tags: ['veg'], micronutrientId: 'spinach' }),
  food('cauliflower', 'Cauliflower', '🥦', [25, 1.9, 5, 0.3, 2],
    [['Serving (80 g)', 80], ['Large serving (150 g)', 150]],
    { tags: ['veg'], micronutrientId: 'broccoli' }),
  food('green-beans', 'Green beans', '🫛', [35, 1.9, 7.9, 0.3, 3.2],
    [['Serving (80 g)', 80], ['Large serving (150 g)', 150]],
    { tags: ['veg'], micronutrientId: 'broccoli' }),
  food('sweetcorn', 'Sweetcorn', '🌽', [86, 3.2, 19, 1.2, 2.7],
    [['Serving (80 g)', 80], ['Half tin (130 g)', 130]],
    { tags: ['veg', 'tinned'], micronutrientId: 'broccoli' }),

  food('strawberries', 'Strawberries', '🍓', [32, 0.7, 7.7, 0.3, 2],
    [['Handful (80 g)', 80], ['Half punnet (125 g)', 125]],
    { tags: ['fruit', 'snack'], micronutrientId: 'blueberries' }),
  food('grapes', 'Grapes', '🍇', [69, 0.7, 18, 0.2, 0.9],
    [['Handful (80 g)', 80], ['Bowl (150 g)', 150]],
    { tags: ['fruit', 'snack'], micronutrientId: 'blueberries' }),
  food('pear', 'Pear', '🍐', [57, 0.4, 15, 0.1, 3.1],
    [['1 medium (170 g)', 170], ['1 small (120 g)', 120]],
    { tags: ['fruit', 'snack'], micronutrientId: 'apple' }),
  food('mango', 'Mango', '🥭', [60, 0.8, 15, 0.4, 1.6],
    [['Half mango (100 g)', 100], ['1 mango (200 g)', 200]],
    { tags: ['fruit', 'snack'], micronutrientId: 'orange' }),
  food('raspberries', 'Raspberries', '🫐', [52, 1.2, 12, 0.7, 6.5],
    [['Handful (80 g)', 80], ['Punnet (150 g)', 150]],
    { tags: ['fruit', 'snack', 'high-fibre'], micronutrientId: 'blueberries' }),
];

export const FOODS = [...CORE_FOODS, ...EXPANDED_FOODS];

/* ---------- Restaurant menus ----------
   Menu items are stored the way a menu quotes them — calories, macros, portion
   weight and salt — then normalised to per-100 g so they portion-scale like
   everything else. Micronutrients aren't on any menu, so each dish names the
   blend of everyday foods it eats like and its profile is modelled from those.
   [name, kcal, protein, carbs, fat, grams, salt g, blend] */

const RESTAURANT_MENUS = [
  ['Pret A Manger', '🥪', [
    ['Chicken Caesar & Bacon Baguette', 555, 33, 47, 25, 380, 2.4, 'sandwich'],
    ['Posh Cheddar & Pickle Sandwich', 486, 20, 43, 26, 250, 1.9, 'sandwich'],
    ['Chicken & Avocado Protein Pot', 300, 26, 5, 20, 210, 0.9, 'protein-pot'],
    ['Coconut Porridge', 296, 8, 43, 10, 300, 0.3, 'porridge-pot'],
    ['Very Berry Granola Pot', 322, 9, 45, 12, 260, 0.2, 'yogurt-pot'],
  ]],
  ['Nando’s', '🌶️', [
    ['1/2 Peri-Peri Chicken', 610, 79, 1, 32, 400, 3.2, 'chicken-meal'],
    ['Butterfly Chicken Breast', 336, 61, 0.6, 10, 230, 2.1, 'chicken-meal'],
    ['Spicy Rice', 348, 8, 66, 5, 230, 1.6, 'rice-side'],
    ['Peri-Peri Chips (regular)', 393, 5, 51, 18, 200, 1.2, 'fried-side'],
    ['Macho Peas', 143, 9, 13, 5, 150, 0.9, 'greens'],
  ]],
  ['Wagamama', '🍜', [
    ['Chicken Katsu Curry', 1063, 46, 132, 38, 620, 4.1, 'chicken-meal'],
    ['Yasai Katsu Curry', 967, 21, 137, 37, 600, 3.6, 'veg-curry'],
    ['Chicken Ramen', 553, 42, 63, 13, 700, 4.5, 'noodle-soup'],
    ['Grilled Chicken Donburi', 660, 46, 84, 16, 520, 3.2, 'chicken-meal'],
    ['Edamame (salted)', 190, 15, 9, 9, 120, 1.4, 'greens'],
  ]],
  ['McDonald’s', '🍔', [
    ['Big Mac', 493, 26, 41, 24, 219, 2.3, 'burger'],
    ['McChicken Sandwich', 388, 18, 41, 16, 173, 1.5, 'burger'],
    ['Medium Fries', 337, 3.7, 42, 16, 114, 0.6, 'fried-side'],
    ['6 Chicken McNuggets', 259, 16, 15, 15, 108, 1, 'breaded-chicken'],
    ['Sausage & Egg McMuffin', 425, 24, 30, 23, 165, 2, 'burger'],
  ]],
  ['Greggs', '🥐', [
    ['Sausage Roll', 329, 9.4, 25, 22, 101, 1.3, 'pastry'],
    ['Steak Bake', 408, 12, 32, 26, 138, 1.6, 'pastry'],
    ['Vegan Sausage Roll', 311, 12, 25, 19, 96, 1.4, 'pastry'],
    ['Chicken Bacon Mayo Baguette', 460, 26, 46, 19, 200, 2.2, 'sandwich'],
    ['Yum Yum', 275, 3.5, 30, 16, 68, 0.4, 'dessert'],
  ]],
  ['itsu', '🍣', [
    ['Chicken Teriyaki Rice’bowl', 462, 30, 66, 8, 380, 2.4, 'chicken-meal'],
    ['Salmon Sashimi Sushi Box', 320, 24, 38, 8, 250, 2, 'sushi'],
    ['Chicken Gyoza (5)', 240, 12, 26, 9, 135, 1.3, 'breaded-chicken'],
    ['Miso Soup', 45, 3, 5, 1.5, 250, 1.8, 'broth'],
    ['Veggie Rainbow Salad', 285, 9, 34, 12, 300, 1.1, 'salad-bowl'],
  ]],
];

export const RESTAURANTS = RESTAURANT_MENUS.map(([chain, emoji]) => ({ chain, emoji }));

const slug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Restaurant items as ordinary catalogue foods (per-100 g + one serving). */
export const RESTAURANT_FOODS = RESTAURANT_MENUS.flatMap(([chain, emoji, items]) =>
  items.map(([name, kcal, protein, carbs, fat, grams, salt, blend]) => {
    const k = 100 / grams;
    return {
      id: `${slug(chain)}--${slug(name)}`,
      name,
      brand: chain,
      chain,
      emoji,
      unit: 'g',
      source: 'restaurant',
      tags: ['eating out'],
      per100: {
        ...n([
          +(kcal * k).toFixed(1), +(protein * k).toFixed(1),
          +(carbs * k).toFixed(1), +(fat * k).toFixed(1), fibreFromBlend(blend),
        ]),
        ...microsFromBlend(blend, salt * k),
      },
      servings: s([['1 portion', grams], ['Half portion', Math.round(grams / 2)]]),
    };
  }),
);

/** Presets for quick-add — an estimate now beats a perfect entry never. */
export const QUICK_ADD_PRESETS = [
  { label: 'Small snack', kcal: 150, protein: 4, carbs: 18, fat: 6 },
  { label: 'Light meal', kcal: 350, protein: 18, carbs: 38, fat: 12 },
  { label: 'Full meal', kcal: 650, protein: 32, carbs: 70, fat: 24 },
  { label: 'Takeaway', kcal: 950, protein: 40, carbs: 100, fat: 40 },
];

/** Everything loggable that ships with the app. */
export const CATALOGUE = [...FOODS, ...RESTAURANT_FOODS];
