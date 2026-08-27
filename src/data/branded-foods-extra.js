/**
 * A second wave of branded groceries: the rest of a real trolley.
 *
 * The first branded file covered store cupboard, cereal, dairy and the obvious
 * snacks. This adds what was still missing — tea and coffee, the chocolate
 * counter, crisps beyond one bag, soft drinks, cooking sauces, the freezer and
 * meat-free.
 *
 * Same contract as the first file: sugar, saturated fat and salt are stated
 * outright because they decide the health grade, and diet-relevant ingredients
 * that the product name hides get an explicit tag — a shopper filtering out
 * dairy should not be defeated by a chocolate bar whose name never says milk.
 *
 * Typical published per-100g label values. Manufacturers reformulate: the pack
 * in your hand is the authority.
 */

import { brandedRow } from './food-row.js';

const ROWS = [
  // ---- Tea and coffee ----
  [['pg-tips', 'PG Tips Tea (brewed, no milk)', '🫖', [1, 0.1, 0.1, 0, 0, 0, 0, 0.01], 250, ['drink'], null, 'ml'], 'PG Tips'],
  [['yorkshire-tea', 'Yorkshire Tea (brewed, no milk)', '🫖', [1, 0.1, 0.1, 0, 0, 0, 0, 0.01], 250, ['drink'], null, 'ml'], 'Yorkshire Tea'],
  [['nescafe-gold', 'Nescafé Gold Blend (made up)', '☕', [2, 0.2, 0.3, 0, 0, 0, 0, 0.01], 200, ['drink'], null, 'ml'], 'Nescafé'],
  [['twinings-earl-grey', 'Twinings Earl Grey (brewed)', '🫖', [1, 0.1, 0.1, 0, 0, 0, 0, 0.01], 250, ['drink'], null, 'ml'], 'Twinings'],

  // ---- Cereal ----
  [['coco-pops', 'Kellogg’s Coco Pops', '🥣', [386, 5, 84, 2.5, 3, 17, 1.3, 0.55], 30, ['breakfast', 'cereal'], null], "Kellogg's"],
  [['frosties', 'Kellogg’s Frosties', '🥣', [375, 4.5, 87, 0.6, 2, 37, 0.2, 0.6], 30, ['breakfast', 'cereal'], null], "Kellogg's"],
  [['alpen-original', 'Alpen Original Muesli', '🥣', [361, 10.1, 65.6, 5.7, 7.2, 21.4, 1, 0.15], 45, ['breakfast', 'cereal'], null], 'Alpen'],
  [['ready-brek', 'Ready Brek Original', '🥣', [378, 12.5, 59.5, 8.7, 8.2, 1.1, 1.5, 0.05], 30, ['breakfast', 'cereal'], 'porridge-oats'], 'Ready Brek'],

  // ---- Chocolate counter ----
  [['galaxy-smooth', 'Galaxy Smooth Milk', '🍫', [551, 6.6, 56.8, 32.5, 1.4, 55.8, 20, 0.28], 40, ['snack', 'treat', 'dairy'], 'dark-chocolate'], 'Galaxy'],
  [['aero-milk', 'Aero Milk Chocolate', '🍫', [530, 6.6, 59.1, 29.4, 1.5, 57.7, 17.9, 0.26], 36, ['snack', 'treat', 'dairy'], 'dark-chocolate'], 'Aero'],
  [['twirl', 'Cadbury Twirl', '🍫', [534, 7.3, 57, 30, 2.1, 56, 18, 0.24], 43, ['snack', 'treat', 'dairy'], 'dark-chocolate'], 'Cadbury'],
  [['mars-bar', 'Mars Bar', '🍫', [449, 3.9, 69.6, 16.6, 1.1, 59.7, 8.3, 0.29], 51, ['snack', 'treat', 'dairy'], null], 'Mars'],
  [['snickers', 'Snickers', '🍫', [484, 8.7, 55.1, 24.8, 1.9, 47.2, 9.1, 0.5], 48, ['snack', 'treat', 'dairy'], null], 'Snickers'],
  [['bounty', 'Bounty', '🍫', [473, 3.8, 57.6, 25.1, 4.6, 46.8, 19.5, 0.25], 57, ['snack', 'treat', 'dairy'], null], 'Bounty'],
  [['milkybar', 'Milkybar', '🍫', [548, 8.1, 57.4, 31.4, 0, 57.4, 19.3, 0.31], 25, ['snack', 'treat', 'dairy'], null], 'Milkybar'],
  [['toblerone', 'Toblerone Milk', '🍫', [525, 5.6, 60.4, 28.5, 1.7, 58.7, 17.4, 0.11], 35, ['snack', 'treat', 'dairy'], 'dark-chocolate'], 'Toblerone'],
  [['terrys-chocolate-orange', 'Terry’s Chocolate Orange', '🍊', [534, 5.2, 59.7, 29.9, 2.4, 57.6, 18.3, 0.16], 35, ['snack', 'treat', 'dairy'], 'dark-chocolate'], "Terry's"],
  [['haribo-starmix', 'Haribo Starmix', '🍬', [343, 6.3, 77, 0.5, 0, 46, 0.3, 0.07], 30, ['snack', 'treat'], null], 'Haribo'],
  [['skittles', 'Skittles Fruits', '🍬', [405, 0.2, 90.8, 4.1, 0, 76.4, 3.9, 0.02], 45, ['snack', 'treat'], null], 'Skittles'],

  // ---- Biscuits ----
  [['oreo', 'Oreo Original', '🍪', [480, 5.2, 68.8, 20, 3.2, 38.4, 9.7, 0.9], 33, ['snack', 'treat'], null], 'Oreo'],
  [['mcvities-digestives', 'McVitie’s Digestives', '🍪', [478, 6.6, 63.4, 21.4, 3.4, 16.6, 10.1, 1.1], 15, ['snack', 'treat'], null], 'McVitie’s'],
  [['penguin-bar', 'McVitie’s Penguin', '🐧', [514, 5.4, 61.7, 26.6, 2.5, 39.1, 15.2, 0.5], 25, ['snack', 'treat', 'dairy'], null], 'McVitie’s'],
  [['tunnocks-teacake', 'Tunnock’s Teacake', '🍫', [426, 4.1, 66.3, 15.9, 1.1, 52.3, 10.9, 0.28], 24, ['snack', 'treat', 'dairy'], null], "Tunnock's"],
  [['fox-party-rings', 'Fox’s Party Rings', '🍪', [443, 4.6, 76.9, 13.1, 1.9, 36.9, 6.7, 0.5], 20, ['snack', 'treat'], null], "Fox's"],

  // ---- Crisps ----
  [['quavers', 'Walkers Quavers Cheese', '🧀', [520, 3.1, 59.5, 29.6, 1.2, 2.6, 2.6, 1.6], 16, ['snack', 'dairy'], null], 'Walkers'],
  [['wotsits', 'Walkers Wotsits Really Cheesy', '🧀', [546, 6.4, 51.9, 34.2, 1.6, 3.1, 3.3, 1.9], 16, ['snack', 'dairy'], null], 'Walkers'],
  [['monster-munch', 'Monster Munch Pickled Onion', '🧅', [488, 4.6, 60.2, 24.9, 2.4, 3.4, 2.4, 2], 22, ['snack'], null], 'Monster Munch'],
  [['mccoys-ridge-cut', 'McCoy’s Flame Grilled Steak', '🥔', [513, 6.1, 51.3, 30.7, 4.2, 2.5, 2.6, 1.5], 25, ['snack'], null], "McCoy's"],
  [['kettle-chips-sea-salt', 'Kettle Chips Sea Salt', '🥔', [473, 6.3, 53.4, 25.1, 4.9, 1.5, 2.2, 1], 30, ['snack'], null], 'Kettle Chips'],
  [['twiglets', 'Twiglets Original', '🥨', [385, 11.6, 60.2, 10.7, 10.8, 3.6, 1.3, 2.9], 30, ['snack', 'high-fibre'], null], 'Twiglets'],

  // ---- Soft drinks ----
  [['pepsi-max', 'Pepsi Max', '🥤', [1, 0, 0, 0, 0, 0, 0, 0.02], 330, ['drink'], null, 'ml'], 'Pepsi'],
  [['fanta-orange', 'Fanta Orange', '🍊', [19, 0, 4.6, 0, 0, 4.6, 0, 0.02], 330, ['drink'], null, 'ml'], 'Fanta'],
  [['sprite', 'Sprite', '🥤', [19, 0, 4.5, 0, 0, 4.5, 0, 0.02], 330, ['drink'], null, 'ml'], 'Sprite'],
  [['irn-bru', 'Irn-Bru', '🥤', [21, 0, 4.7, 0, 0, 4.7, 0, 0.03], 330, ['drink'], null, 'ml'], 'Irn-Bru'],
  [['dr-pepper', 'Dr Pepper', '🥤', [7, 0, 1.3, 0, 0, 1.3, 0, 0.04], 330, ['drink'], null, 'ml'], 'Dr Pepper'],
  [['red-bull', 'Red Bull Energy', '🥤', [46, 0.4, 11, 0, 0, 11, 0, 0.1], 250, ['drink'], null, 'ml'], 'Red Bull'],
  [['j2o-orange-passion', 'J2O Orange & Passion Fruit', '🍹', [40, 0.1, 9.3, 0, 0, 9, 0, 0.02], 275, ['drink'], null, 'ml'], 'J2O'],
  [['capri-sun-orange', 'Capri-Sun Orange', '🧃', [39, 0, 9.4, 0, 0, 9.2, 0, 0.01], 200, ['drink'], null, 'ml'], 'Capri-Sun'],

  // ---- Cooking sauces and jars ----
  [['branston-pickle', 'Branston Original Pickle', '🥒', [143, 0.8, 33.1, 0.2, 1.4, 26.6, 0.1, 2.3], 20, ['condiment'], null], 'Branston'],
  [['colmans-english-mustard', 'Colman’s English Mustard', '🌭', [180, 8.2, 17, 8.7, 4.5, 8.4, 0.7, 4.7], 5, ['condiment'], null], "Colman's"],
  [['lea-perrins', 'Lea & Perrins Worcestershire Sauce', '🍶', [78, 0, 19.5, 0, 0, 17, 0, 3.3], 5, ['condiment'], null, 'ml'], 'Lea & Perrins'],
  [['pataks-tikka-masala', 'Patak’s Tikka Masala Sauce', '🍛', [128, 1.8, 10.4, 8.7, 1.4, 8.1, 3.4, 1], 125, ['sauce', 'world'], null], "Patak's"],
  [['sharwoods-sweet-sour', 'Sharwood’s Sweet & Sour Sauce', '🍜', [107, 0.5, 25.3, 0.2, 0.6, 21.6, 0, 0.8], 125, ['sauce', 'world'], null], "Sharwood's"],
  [['old-el-paso-fajita-kit', 'Old El Paso Fajita Kit', '🌯', [321, 8.9, 55.4, 6.9, 3.6, 5.2, 2.7, 1.9], 100, ['world', 'meal'], null], 'Old El Paso'],
  [['loyd-grossman-tomato', 'Loyd Grossman Tomato & Basil', '🍝', [77, 1.7, 8.2, 4, 1.6, 6.8, 0.5, 0.7], 175, ['sauce'], null], 'Loyd Grossman'],
  [['tilda-basmati', 'Tilda Pure Basmati Rice, cooked', '🍚', [143, 3.2, 30.9, 0.5, 0.9, 0.1, 0.1, 0.01], 125, ['store-cupboard'], 'white-rice'], 'Tilda'],

  // ---- Freezer ----
  [['aunt-bessies-yorkshires', 'Aunt Bessie’s Yorkshire Puddings', '🥐', [292, 8.9, 38.6, 11.1, 1.6, 4.1, 2.5, 0.9], 30, ['frozen', 'bakery'], null], "Aunt Bessie's"],
  [['goodfellas-pizza', 'Goodfella’s Stonebaked Margherita', '🍕', [243, 10.3, 30.5, 8.6, 2.2, 3.2, 4.5, 1.1], 173, ['frozen', 'meal', 'dairy'], null], "Goodfella's"],
  [['ben-jerrys-cookie-dough', 'Ben & Jerry’s Cookie Dough', '🍦', [281, 4.3, 32.4, 14.7, 0.7, 26.5, 9.1, 0.24], 100, ['frozen', 'treat', 'dairy'], 'ice-cream'], "Ben & Jerry's"],
  [['magnum-classic', 'Magnum Classic', '🍦', [329, 4.1, 32.4, 20.1, 1.1, 29.3, 14.1, 0.14], 79, ['frozen', 'treat', 'dairy'], 'ice-cream'], 'Magnum'],
  [['cornetto-classico', 'Cornetto Classico', '🍦', [318, 4, 38.5, 16.2, 1.1, 26.9, 11.9, 0.2], 90, ['frozen', 'treat', 'dairy'], 'ice-cream'], 'Cornetto'],
  [['mccain-smiles', 'McCain Smiles', '🥔', [196, 2.8, 28.5, 7.6, 2.7, 0.7, 0.7, 0.6], 100, ['frozen'], null], 'McCain'],

  // ---- Meat and meat-free ----
  [['peperami-original', 'Peperami Original', '🌭', [530, 22, 1.5, 48, 0, 0.6, 18, 3.5], 25, ['meat', 'snack'], null], 'Peperami'],
  [['bernard-matthews-turkey', 'Bernard Matthews Wafer Thin Turkey', '🦃', [104, 18.5, 2.5, 2.2, 0.5, 1, 0.7, 1.8], 40, ['meat', 'high-protein'], null], 'Bernard Matthews'],
  [['richmond-meat-free', 'Richmond Meat Free Sausages', '🌱', [212, 13.5, 10.5, 12.5, 4.5, 1.2, 1.3, 1.4], 50, ['meat-free', 'high-protein', 'vegan'], null], 'Richmond'],
  [['this-isnt-chicken', 'THIS Isn’t Chicken Pieces', '🌱', [152, 22, 2.3, 5.5, 3.5, 0.4, 0.6, 1.1], 100, ['meat-free', 'high-protein', 'vegan'], null], 'THIS'],
  [['cauldron-tofu', 'Cauldron Original Tofu', '🌱', [136, 15.4, 0.9, 7.8, 0.4, 0.5, 1.2, 0.03], 100, ['meat-free', 'high-protein', 'vegan'], null], 'Cauldron'],
  [['quorn-nuggets', 'Quorn Crispy Nuggets', '🌱', [219, 12.5, 20.5, 9.5, 4.5, 1.1, 1, 1.1], 100, ['meat-free', 'egg'], null], 'Quorn'],

  // ---- Spreads and dairy ----
  [['flora-original', 'Flora Original Spread', '🧈', [531, 0, 0.5, 59, 0, 0.5, 12, 0.75], 10, ['fat'], null], 'Flora'],
  [['sun-pat-peanut-butter', 'Sun-Pat Smooth Peanut Butter', '🥜', [606, 26.5, 12.7, 49.4, 6, 6.5, 9.8, 0.9], 20, ['spread', 'high-protein'], 'peanut-butter'], 'Sun-Pat'],
  [['activia-natural', 'Activia Natural Yogurt', '🥛', [72, 4.6, 6.4, 3.1, 0, 6.4, 2, 0.16], 125, ['dairy'], 'greek-yogurt'], 'Activia'],
  [['muller-light-vanilla', 'Müller Light Vanilla', '🥛', [51, 4.6, 7.8, 0.1, 0, 6.6, 0.1, 0.18], 160, ['dairy'], 'greek-yogurt'], 'Müller'],
  [['petits-filous', 'Petits Filous Strawberry', '🥛', [113, 4.7, 14.1, 3.9, 0, 12.9, 2.5, 0.11], 47, ['dairy'], 'greek-yogurt'], 'Petits Filous'],
  [['cravendale-semi', 'Cravendale Semi-Skimmed Milk', '🥛', [50, 3.6, 4.8, 1.8, 0, 4.8, 1.1, 0.1], 250, ['dairy'], 'semi-skimmed-milk', 'ml'], 'Cravendale'],
];

export const BRANDED_FOODS_EXTRA = ROWS.map(([row, brand]) => brandedRow(row, brand));
