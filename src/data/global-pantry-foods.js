/**
 * A fourth wave: the things a UK shopping list reaches for that the first
 * three did not have.
 *
 * The gaps were found by probing the catalogue rather than guessing at it —
 * asking which of a long list of ordinary supermarket items it could not
 * recognise. What came back was a shape worth noticing: the catalogue was
 * strong on fresh produce and weak on everything that arrives in a tin, a jar
 * or a baking cupboard. Tinned tuna is one of the most bought products in
 * Britain and the app did not know what it was.
 *
 * Four groups, all of them things people write on lists:
 *
 *  - **Tins and the fish counter** — tuna, pilchards, coley, scallops.
 *  - **Store cupboard and baking** — suet, semolina, tapioca, marzipan,
 *    treacle, muscovado, arrowroot, bicarbonate of soda, cream of tartar.
 *  - **The world aisle** — gochujang, oyster sauce, rice vinegar, jackfruit,
 *    soya mince, rice vermicelli, borlotti and pinto beans, split peas.
 *  - **Produce the older files skipped** — fennel, celeriac, watercress,
 *    samphire, plantain, and the fruit that is not an apple: persimmon,
 *    guava, lychee, dragon fruit, rhubarb, gooseberry.
 *
 * Figures are per 100g as a UK label prints them, with fibre stated separately
 * from the caloric carbohydrate. Sugar, saturated fat and salt are stated on
 * every row rather than left to a micronutrient profile, because those three
 * decide the health grade and the grade refuses to guess.
 *
 * Bicarbonate of soda carries a salt figure that looks like a typo and is not:
 * sodium bicarbonate is 27g of sodium per 100g, which is 68g of salt
 * equivalent. It is also used a teaspoon at a time, which is why the portion
 * matters as much as the per-100g row.
 */

import { foodRow } from './food-row.js';

const ROWS = [
  // ---- Tins and the fish counter ----
  ['tuna-brine', 'Tuna, tinned in brine', '🐟', [99, 23.5, 0, 0.6, 0, 0, 0.2, 0.9], 100, ['fish', 'tinned', 'high-protein'], null],
  ['tuna-oil', 'Tuna, tinned in oil', '🐟', [189, 27, 0, 9, 0, 0, 1.5, 0.9], 100, ['fish', 'tinned', 'high-protein'], null],
  ['pilchards-tomato', 'Pilchards in tomato sauce', '🐟', [146, 18, 2.5, 7, 0.3, 2, 1.8, 0.6], 120, ['fish', 'tinned', 'high-protein'], null],
  ['coley-fillet', 'Coley fillet', '🐟', [82, 18.3, 0, 1, 0, 0, 0.2, 0.3], 140, ['fish', 'fresh', 'high-protein'], null],
  ['scallops', 'Scallops', '🦪', [84, 16.8, 2.4, 0.8, 0, 0, 0.1, 0.4], 100, ['seafood', 'fresh', 'high-protein'], null],
  ['pastrami', 'Pastrami', '🥩', [134, 22, 1.5, 4.5, 0, 1, 1.7, 2.2], 50, ['meat', 'deli', 'high-protein'], null],
  ['haggis', 'Haggis', '🥘', [270, 10, 19, 17, 2, 0.5, 6.5, 1.4], 150, ['meat', 'prepared'], null],

  // ---- Pulses and meat-free ----
  ['borlotti-beans', 'Borlotti beans, tinned', '🫘', [101, 7.5, 13.5, 0.6, 6, 0.6, 0.1, 0.5], 120, ['pulse', 'tinned', 'vegan'], null],
  ['pinto-beans', 'Pinto beans, tinned', '🫘', [104, 7, 15, 0.5, 5.5, 0.5, 0.1, 0.5], 120, ['pulse', 'tinned', 'vegan'], null],
  ['split-peas', 'Split peas, dried', '🫛', [343, 24.6, 46, 1.2, 25, 8, 0.2, 0.04], 60, ['pulse', 'store-cupboard', 'vegan'], null],
  ['jackfruit-tinned', 'Jackfruit, tinned', '🥭', [59, 1, 12, 0.3, 2, 8, 0.1, 0.5], 150, ['vegan', 'tinned', 'meat-free'], null],
  ['soya-mince', 'Soya mince, dried', '🌱', [315, 52, 15, 1.2, 18, 5, 0.3, 0.05], 30, ['vegan', 'meat-free', 'high-protein'], null],

  // ---- Pasta, grains and the world aisle ----
  ['rice-vermicelli', 'Rice vermicelli, dried', '🍜', [353, 6, 80, 0.6, 1.6, 0.2, 0.1, 0.02], 75, ['pasta', 'store-cupboard', 'vegan'], null],
  ['ravioli-fresh', 'Ravioli, fresh spinach and ricotta', '🥟', [261, 10, 36, 8, 2.5, 2, 3.5, 1], 125, ['pasta', 'fresh', 'vegetarian'], null],
  ['semolina', 'Semolina', '🥣', [341, 12.7, 68, 1.1, 3.9, 1, 0.2, 0.01], 50, ['grain', 'store-cupboard', 'vegan'], null],
  ['tapioca-pearls', 'Tapioca pearls', '⚪', [351, 0.2, 87, 0.02, 0.9, 3, 0, 0.01], 40, ['grain', 'store-cupboard', 'vegan'], null],
  ['gochujang', 'Gochujang', '🌶️', [207, 5, 43, 1, 3, 24, 0.2, 4.5], 15, ['condiment', 'store-cupboard', 'vegan'], null],
  ['oyster-sauce', 'Oyster sauce', '🧴', [107, 2, 24, 0.3, 0.3, 15, 0.1, 11], 15, ['condiment', 'store-cupboard'], null],
  ['rice-vinegar', 'Rice vinegar', '🧴', [17, 0.3, 4, 0, 0, 4, 0, 0.02], 15, ['condiment', 'store-cupboard', 'vegan'], null],

  // ---- Dairy the older files skipped ----
  ['soured-cream', 'Soured cream', '🥛', [204, 2.9, 3.8, 19.7, 0, 3.8, 12.5, 0.1], 30, ['dairy', 'vegetarian'], null],
  ['buttermilk', 'Buttermilk', '🥛', [40, 3.3, 4.8, 0.9, 0, 4.8, 0.6, 0.1], 250, ['dairy', 'vegetarian'], null, 'ml'],

  // ---- Baking cupboard ----
  ['shredded-suet', 'Suet, shredded', '🧈', [833, 0.3, 11.6, 87.3, 0, 0, 47, 0.01], 25, ['baking', 'store-cupboard'], null],
  ['marzipan', 'Marzipan', '🍬', [452, 8, 54, 22, 3, 52, 2, 0.02], 30, ['baking', 'store-cupboard', 'vegetarian'], null],
  ['glace-cherries', 'Glacé cherries', '🍒', [300, 0.4, 74, 0.1, 0.6, 74, 0, 0.02], 20, ['baking', 'store-cupboard', 'vegan'], null],
  ['mincemeat', 'Mincemeat', '🥧', [289, 0.6, 62, 4.3, 1.3, 55, 1.8, 0.1], 40, ['baking', 'store-cupboard'], null],
  ['arrowroot', 'Arrowroot', '🥄', [349, 0.3, 85, 0.1, 3.4, 0.2, 0, 0.01], 10, ['baking', 'store-cupboard', 'vegan'], null],
  ['bicarbonate-of-soda', 'Bicarbonate of soda', '🧂', [0, 0, 0, 0, 0, 0, 0, 68.5], 3, ['baking', 'store-cupboard', 'vegan'], null],
  ['cream-of-tartar', 'Cream of tartar', '🧂', [246, 0, 61, 0, 0.7, 0, 0, 0.1], 3, ['baking', 'store-cupboard', 'vegan'], null],
  ['muscovado-sugar', 'Muscovado sugar', '🟤', [380, 0.1, 95, 0, 0, 95, 0, 0.09], 15, ['baking', 'store-cupboard', 'vegan'], null],
  ['black-treacle', 'Black treacle', '🍯', [257, 1.2, 63, 0, 0, 60, 0, 0.3], 20, ['baking', 'store-cupboard', 'vegan'], null],
  ['malt-extract', 'Malt extract', '🍯', [314, 6, 72, 0.2, 0, 60, 0.1, 0.1], 20, ['baking', 'store-cupboard', 'vegan'], null],

  // ---- Produce the older files skipped ----
  ['fennel-bulb', 'Fennel bulb', '🥬', [33, 1.2, 5, 0.2, 3.1, 3.9, 0.03, 0.05], 100, ['vegetable', 'fresh', 'vegan'], null],
  ['celeriac', 'Celeriac', '🥔', [42, 1.5, 7.4, 0.3, 1.8, 1.6, 0.08, 0.25], 120, ['vegetable', 'fresh', 'vegan'], null],
  ['watercress', 'Watercress', '🥬', [26, 3, 0.4, 1, 1.5, 0.2, 0.3, 0.1], 40, ['vegetable', 'fresh', 'vegan'], null],
  ['samphire', 'Samphire', '🌿', [27, 2, 2.5, 0.5, 2, 0.5, 0.1, 2.5], 50, ['vegetable', 'fresh', 'vegan'], null],
  ['plantain', 'Plantain', '🍌', [129, 1.3, 29, 0.4, 2.3, 15, 0.14, 0.01], 150, ['vegetable', 'fresh', 'vegan'], null],
  ['persimmon', 'Persimmon', '🟠', [75, 0.6, 16, 0.2, 3.6, 12.5, 0.02, 0.003], 130, ['fruit', 'fresh', 'vegan'], null],
  ['guava', 'Guava', '🟢', [62, 2.6, 8, 1, 5.4, 9, 0.3, 0.005], 100, ['fruit', 'fresh', 'vegan'], null],
  ['lychee', 'Lychee', '🔴', [69, 0.8, 15, 0.4, 1.3, 15, 0.1, 0.003], 100, ['fruit', 'fresh', 'vegan'], null],
  ['dragon-fruit', 'Dragon fruit', '🐉', [58, 1.2, 11, 0.4, 3, 8, 0.1, 0.01], 150, ['fruit', 'fresh', 'vegan'], null],
  ['rhubarb', 'Rhubarb', '🌱', [20, 0.9, 2.7, 0.2, 1.8, 1, 0.05, 0.01], 100, ['fruit', 'fresh', 'vegan'], null],
  ['gooseberry', 'Gooseberries', '🟢', [50, 0.9, 8, 0.6, 4.3, 8, 0.04, 0.003], 80, ['fruit', 'fresh', 'vegan'], null],
];

export const GLOBAL_PANTRY_FOODS = ROWS.map(foodRow);
