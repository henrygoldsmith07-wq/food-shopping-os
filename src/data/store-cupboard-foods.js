/**
 * The store cupboard: herbs, spices, condiments, baking staples, oils and tins.
 *
 * This whole category was missing, which mattered more than its calorie count
 * suggests. A shopping list is mostly cooking ingredients, and an item the
 * catalogue cannot find gets no nutrition tags, no health grade and no branded
 * suggestion — so "cumin" and "plain flour" came back blank while "banana"
 * came back fully described.
 *
 * Portions are what these are actually used in: a teaspoon of spice, a
 * tablespoon of oil, a stock cube. Per-100g figures for a spice look alarming
 * until you notice nobody eats 100g of cinnamon.
 *
 * Figures are typical published values. Salt is the label figure; the builder
 * converts it to sodium.
 */

import { foodRow } from './food-row.js';

const ROWS = [
  // ---- Herbs and spices (per 100g looks extreme; the portion is a teaspoon) ----
  ['black-pepper', 'Black pepper, ground', '🧂', [251, 10.4, 38.3, 3.3, 25.3, 0.6, 1.4, 0.05], 2, ['spice', 'store-cupboard'], null],
  ['ground-cumin', 'Cumin, ground', '🧂', [375, 17.8, 33.7, 22.3, 10.5, 2.3, 1.5, 0.04], 2, ['spice', 'store-cupboard'], null],
  ['paprika', 'Paprika', '🌶️', [282, 14.1, 34, 12.9, 34.9, 10.3, 2.1, 0.07], 2, ['spice', 'store-cupboard'], null],
  ['ground-turmeric', 'Turmeric, ground', '🧂', [312, 9.7, 44.4, 3.3, 22.7, 3.2, 1.8, 0.03], 2, ['spice', 'store-cupboard'], null],
  ['ground-cinnamon', 'Cinnamon, ground', '🧂', [247, 4, 27.5, 1.2, 53.1, 2.2, 0.3, 0.03], 2, ['spice', 'store-cupboard'], null],
  ['chilli-flakes', 'Chilli flakes', '🌶️', [282, 12, 32.8, 14.3, 27.2, 10.3, 2.7, 0.08], 1, ['spice', 'store-cupboard'], null],
  ['curry-powder', 'Curry powder', '🧂', [325, 14.3, 25.2, 14, 33.2, 2.8, 1.6, 0.13], 5, ['spice', 'store-cupboard'], null],
  ['garam-masala', 'Garam masala', '🧂', [379, 15, 45, 15, 25, 3, 3.3, 0.1], 5, ['spice', 'store-cupboard'], null],
  ['dried-oregano', 'Oregano, dried', '🌿', [265, 9, 21.6, 4.3, 42.5, 4.1, 1.6, 0.06], 1, ['herb', 'store-cupboard'], null],
  ['dried-mixed-herbs', 'Mixed herbs, dried', '🌿', [259, 9.5, 24, 4.5, 40, 3, 1.5, 0.06], 1, ['herb', 'store-cupboard'], null],
  ['fresh-basil', 'Basil, fresh', '🌿', [23, 3.2, 1.1, 0.6, 1.6, 0.3, 0.04, 0.01], 5, ['herb', 'fresh'], null],
  ['fresh-coriander', 'Coriander, fresh', '🌿', [23, 2.1, 0.9, 0.5, 2.8, 0.9, 0.01, 0.11], 5, ['herb', 'fresh'], null],
  ['fresh-parsley', 'Parsley, fresh', '🌿', [36, 3, 3.3, 0.8, 3.3, 0.9, 0.1, 0.14], 5, ['herb', 'fresh'], null],
  ['fresh-rosemary', 'Rosemary, fresh', '🌿', [131, 3.3, 13.4, 5.9, 14.1, 0, 2.8, 0.07], 2, ['herb', 'fresh'], null],
  ['fresh-thyme', 'Thyme, fresh', '🌿', [101, 5.6, 15.1, 1.7, 14, 0, 0.5, 0.02], 2, ['herb', 'fresh'], null],
  ['fresh-ginger', 'Ginger, fresh', '🫚', [80, 1.8, 15.8, 0.8, 2, 1.7, 0.2, 0.03], 10, ['spice', 'fresh'], null],
  ['bay-leaves', 'Bay leaves, dried', '🌿', [313, 7.6, 45, 8.4, 26.3, 0, 2.3, 0.06], 1, ['herb', 'store-cupboard'], null],

  // ---- Oils and fats ----
  ['rapeseed-oil', 'Rapeseed oil', '🫒', [884, 0, 0, 100, 0, 0, 7.4, 0], 11, ['fat', 'store-cupboard'], 'olive-oil', 'ml'],
  ['sunflower-oil', 'Sunflower oil', '🌻', [884, 0, 0, 100, 0, 0, 10.3, 0], 11, ['fat', 'store-cupboard'], 'olive-oil', 'ml'],
  ['coconut-oil', 'Coconut oil', '🥥', [892, 0, 0, 99.1, 0, 0, 82.5, 0], 11, ['fat', 'store-cupboard'], 'olive-oil'],
  ['sesame-oil', 'Sesame oil', '🫗', [884, 0, 0, 100, 0, 0, 14.2, 0], 5, ['fat', 'store-cupboard'], 'olive-oil', 'ml'],
  ['ghee', 'Ghee', '🧈', [876, 0.3, 0, 99.5, 0, 0, 62, 0], 10, ['fat', 'dairy'], null],
  ['sunflower-spread', 'Sunflower spread', '🧈', [531, 0, 0.5, 59, 0, 0.5, 12, 0.7], 10, ['fat'], null],

  // ---- Condiments and sauces ----
  ['soy-sauce', 'Soy sauce', '🍶', [53, 5.5, 4.9, 0.1, 0.8, 0.4, 0, 16.3], 15, ['condiment', 'world'], null, 'ml'],
  ['balsamic-vinegar', 'Balsamic vinegar', '🍶', [88, 0.5, 17, 0, 0, 15, 0, 0.06], 15, ['condiment'], null, 'ml'],
  ['white-wine-vinegar', 'White wine vinegar', '🍶', [19, 0.1, 0.4, 0, 0, 0.4, 0, 0.02], 15, ['condiment'], null, 'ml'],
  ['wholegrain-mustard', 'Mustard, wholegrain', '🌭', [140, 8, 5.5, 9.5, 5, 2.5, 0.6, 3.5], 10, ['condiment'], null],
  ['tomato-ketchup-generic', 'Tomato ketchup', '🍅', [102, 1.2, 23.2, 0.1, 0.8, 22.8, 0.1, 1.8], 15, ['condiment'], null],
  ['brown-sauce-generic', 'Brown sauce', '🍶', [122, 1, 28, 0.2, 0.9, 23, 0.1, 2.1], 15, ['condiment'], null],
  ['sweet-chilli-sauce', 'Chilli sauce, sweet', '🌶️', [225, 0.5, 54, 0.1, 0.6, 51, 0, 1.5], 15, ['condiment', 'world'], null],
  ['sriracha', 'Sriracha hot sauce', '🌶️', [93, 1.9, 19, 0.9, 2.2, 15, 0.1, 6.2], 10, ['condiment', 'world'], null],
  ['bbq-sauce', 'Barbecue sauce', '🍖', [172, 0.8, 40.8, 0.6, 0.9, 33.2, 0.1, 2.5], 15, ['condiment'], null],
  ['pesto-green', 'Pesto, green', '🌿', [458, 5.6, 5.4, 45.9, 2.3, 3.1, 6.8, 2.4], 45, ['sauce', 'world'], null],
  ['worcestershire-sauce', 'Worcestershire sauce', '🍶', [78, 0, 19.5, 0, 0, 17, 0, 3.3], 5, ['condiment'], null, 'ml'],
  ['horseradish-sauce', 'Horseradish sauce', '🌶️', [180, 1.7, 12, 13.4, 2.6, 8.6, 1.1, 1.5], 15, ['condiment'], null],
  ['tartare-sauce', 'Tartare sauce', '🐟', [358, 1, 8.5, 35, 0.4, 6.5, 2.7, 1.3], 15, ['condiment'], null],
  ['gravy-granules', 'Gravy granules, made up', '🥣', [26, 0.4, 3.3, 1.2, 0.2, 0.5, 0.6, 1], 70, ['sauce'], null, 'ml'],
  ['salad-dressing', 'Salad dressing, French', '🥗', [340, 0.5, 8, 35, 0.2, 7, 4.5, 2], 15, ['condiment'], null],

  // ---- Baking ----
  ['plain-flour', 'Plain flour, white', '🌾', [341, 9.4, 69.3, 1.3, 3.1, 1.5, 0.2, 0.01], 30, ['baking', 'store-cupboard'], null],
  ['self-raising-flour', 'Self-raising flour', '🌾', [330, 8.9, 68.3, 1.2, 3.1, 1.5, 0.2, 0.8], 30, ['baking', 'store-cupboard'], null],
  ['wholemeal-flour', 'Wholemeal flour', '🌾', [310, 12.6, 57.5, 2.2, 9, 2.1, 0.4, 0.01], 30, ['baking', 'store-cupboard', 'high-fibre'], null],
  ['caster-sugar', 'Caster sugar', '🍬', [400, 0, 100, 0, 0, 100, 0, 0], 5, ['baking', 'store-cupboard'], null],
  ['icing-sugar', 'Icing sugar', '🍬', [398, 0, 99.5, 0, 0, 99.5, 0, 0], 10, ['baking', 'store-cupboard'], null],
  ['soft-brown-sugar', 'Soft brown sugar', '🍬', [384, 0.1, 96, 0, 0, 96, 0, 0.03], 5, ['baking', 'store-cupboard'], null],
  ['cocoa-powder', 'Cocoa powder', '🍫', [343, 23.7, 10.9, 21.7, 30.8, 0.9, 12.9, 0.05], 5, ['baking', 'store-cupboard'], null],
  ['baking-powder', 'Baking powder', '🧁', [97, 0.1, 23.2, 0, 0.2, 0, 0, 25], 3, ['baking', 'store-cupboard'], null],
  ['cornflour', 'Cornflour', '🌽', [354, 0.3, 85, 0.1, 0.9, 0, 0, 0.01], 10, ['baking', 'store-cupboard'], null],
  ['dried-yeast', 'Yeast, dried active', '🍞', [325, 40.4, 22.1, 7.6, 26.9, 0, 1, 0.13], 7, ['baking', 'store-cupboard'], null],
  ['vanilla-extract', 'Vanilla extract', '🍦', [288, 0.1, 12.7, 0.1, 0, 12.7, 0, 0.01], 5, ['baking', 'store-cupboard', 'alcohol'], null, 'ml'],
  ['desiccated-coconut', 'Desiccated coconut', '🥥', [604, 5.6, 6.4, 62, 16.3, 6.4, 54, 0.09], 15, ['baking', 'store-cupboard'], null],

  // ---- Tins, jars and stock ----
  ['passata', 'Passata', '🍅', [32, 1.4, 5.4, 0.2, 1.3, 5.1, 0.1, 0.05], 200, ['tinned', 'store-cupboard'], null],
  ['coconut-milk-tinned', 'Coconut milk, tinned', '🥥', [169, 1.6, 2.9, 16.9, 0.8, 2.2, 14.8, 0.03], 100, ['tinned', 'world'], null, 'ml'],
  ['tinned-sweetcorn', 'Sweetcorn, tinned', '🌽', [86, 2.9, 14.5, 1.2, 2.4, 5.5, 0.2, 0.4], 80, ['tinned', 'veg'], null],
  ['tinned-peaches', 'Peaches in juice, tinned', '🍑', [50, 0.5, 11.6, 0.1, 1, 11.4, 0, 0.01], 120, ['tinned', 'fruit'], null],
  ['butter-beans-tinned', 'Butter beans, tinned', '🫘', [82, 5.9, 12.3, 0.5, 4.6, 0.6, 0.1, 0.5], 120, ['tinned', 'plant-protein'], null],
  ['cannellini-beans-tinned', 'Cannellini beans, tinned', '🫘', [88, 6.4, 12.6, 0.6, 5, 0.7, 0.1, 0.5], 120, ['tinned', 'plant-protein'], null],
  ['anchovies-tinned', 'Anchovies in oil, tinned', '🐟', [191, 20.4, 0, 12.3, 0, 0, 2.8, 5.2], 15, ['tinned', 'fish'], null],
  ['gherkins', 'Gherkins, pickled', '🥒', [14, 0.7, 1.6, 0.2, 1.2, 1.4, 0, 1.7], 30, ['pickle', 'store-cupboard'], null],
  ['capers', 'Capers in brine', '🫒', [23, 2.4, 1.7, 0.9, 3.2, 0.4, 0.2, 6.5], 10, ['pickle', 'store-cupboard'], null],
  ['stock-cube-chicken', 'Stock cube, chicken, made up', '🍲', [4, 0.2, 0.4, 0.2, 0, 0.1, 0.1, 0.4], 250, ['store-cupboard'], null, 'ml'],
  ['stock-cube-veg', 'Stock cube, vegetable, made up', '🍲', [4, 0.1, 0.5, 0.1, 0, 0.2, 0.1, 0.4], 250, ['store-cupboard', 'vegan'], null, 'ml'],
  ['miso-paste', 'Miso paste', '🍜', [199, 12.8, 21.3, 6, 5.4, 6.2, 1.1, 10.5], 15, ['world', 'store-cupboard'], null],
  ['thai-red-curry-paste', 'Curry paste, Thai red', '🌶️', [116, 2.5, 14, 5, 3.5, 6, 0.8, 6.5], 25, ['world', 'store-cupboard'], null],
  ['harissa-paste', 'Harissa', '🌶️', [150, 3.5, 9, 11, 4, 4.5, 1.2, 3.5], 15, ['world', 'store-cupboard'], null],
  ['fish-sauce', 'Fish sauce', '🐟', [35, 5.1, 3.6, 0, 0, 3.6, 0, 26], 8, ['world', 'store-cupboard'], null, 'ml'],
  ['peanut-butter-smooth', 'Peanut butter, smooth', '🥜', [588, 25.1, 12.3, 47.7, 6.4, 6, 9.4, 0.9], 20, ['spread', 'high-protein'], 'peanut-butter'],
  ['maple-syrup', 'Maple syrup', '🍁', [260, 0, 67, 0.1, 0, 60, 0, 0.03], 20, ['spread', 'store-cupboard'], null],
  ['golden-syrup', 'Golden syrup', '🍯', [325, 0.3, 79, 0, 0, 79, 0, 0.15], 20, ['spread', 'store-cupboard'], null],
];

export const STORE_CUPBOARD_FOODS = ROWS.map(foodRow);
