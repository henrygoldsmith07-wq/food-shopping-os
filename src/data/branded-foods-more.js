import { brandedRow } from './food-row.js';

const ROWS = [
  [['heinz-spaghetti-hoops', 'Heinz Spaghetti Hoops', '🍝', [78, 2.5, 13.5, 1.1, 1.2, 4.8, 0.2, 0.7], 205, ['tinned', 'store-cupboard']], 'Heinz'],
  [['heinz-cream-chicken-soup', 'Heinz Cream of Chicken Soup', '🍲', [68, 3.2, 6.5, 3, 0.5, 1.2, 1.8, 0.7], 200, ['tinned', 'soup']], 'Heinz'],
  [['knorr-chicken-stock', 'Knorr Chicken Stock Pot', '🫙', [180, 5, 8, 14, 0, 1, 7, 8], 28, ['store-cupboard', 'condiment']], 'Knorr'],
  [['dolmio-lasagne-sauce', 'Dolmio Lasagne Sauce', '🍝', [62, 1.5, 7.6, 2.5, 1.2, 5.8, 0.4, 0.8], 125, ['sauce', 'meal']], 'Dolmio'],
  [['barilla-spaghetti', 'Barilla Spaghetti', '🍝', [359, 12.8, 71.2, 2, 3, 3.5, 0.4, 0.01], 75, ['grain', 'store-cupboard']], 'Barilla'],
  [['tilda-microwave-basmati', 'Tilda Microwave Basmati Rice', '🍚', [151, 3.2, 32.2, 1.1, 0.8, 0.2, 0.2, 0.3], 125, ['grain', 'store-cupboard']], 'Tilda'],
  [['warburtons-half-half', 'Warburtons Half & Half', '🍞', [235, 9.1, 42.5, 2.3, 4.5, 3.5, 0.4, 1], 40, ['bread']], 'Warburtons'],
  [['paxo-sage-onion', 'Paxo Sage & Onion Stuffing', '🌿', [340, 9.3, 65, 4, 5, 5, 1, 2.4], 50, ['store-cupboard']], 'Paxo'],
  [['oatly-barista', 'Oatly Barista Edition', '🥛', [61, 1.1, 6.7, 3, 0.8, 4, 0.3, 0.1], 200, ['drink', 'vegan']], 'Oatly'],
  [['alpro-protein-yogurt', 'Alpro High Protein Yogurt', '🥣', [67, 5.5, 4.5, 2.5, 0.5, 2.8, 0.4, 0.15], 200, ['vegan', 'high-protein']], 'Alpro'],
  [['actimel-original', 'Actimel Original', '🥛', [74, 2.8, 11.5, 1.5, 0, 11.2, 1, 0.1], 100, ['dairy', 'drink']], 'Actimel'],
  [['soreen-malt-loaf', 'Soreen Malt Loaf', '🍞', [301, 2.5, 66.5, 1.3, 2.8, 37, 0.3, 0.7], 42, ['snack', 'breakfast']], 'Soreen'],
  [['belvita-breakfast', 'belVita Breakfast Biscuits', '🍪', [438, 8.3, 70, 13, 5.5, 22, 2.5, 0.65], 50, ['breakfast', 'snack']], 'belVita'],
  [['mcvities-rich-tea', 'McVitie’s Rich Tea', '🍪', [467, 7.5, 74, 17, 2.2, 18, 5.8, 0.75], 15, ['snack', 'treat']], 'McVitie’s'],
  [['walkers-salt-vinegar', 'Walkers Salt & Vinegar Crisps', '🥔', [531, 6.5, 52, 33, 4, 2, 2.7, 1.4], 25, ['snack']], 'Walkers'],
  [['popchips-salt-vinegar', 'Popchips Sea Salt & Vinegar', '🥔', [426, 5.5, 66, 14, 4.5, 2, 1.4, 1.1], 23, ['snack']], 'Popchips'],
  [['weetabix-protein', 'Weetabix Protein', '🥣', [362, 20, 52, 5, 10, 7, 1, 0.8], 45, ['breakfast', 'cereal', 'high-protein']], 'Weetabix'],
  [['innocent-kids-smoothie', 'Innocent Kids Smoothie', '🍓', [54, 0.6, 11.8, 0.2, 1.2, 10.2, 0, 0.01], 150, ['drink', 'juice']], 'Innocent'],
  [['schweppes-tonic', 'Schweppes Indian Tonic Water', '🥤', [37, 0, 9.1, 0, 0, 9.1, 0, 0.01], 200, ['drink']], 'Schweppes'],
  [['monster-energy', 'Monster Energy Original', '🥤', [47, 0, 11.2, 0, 0, 11.2, 0, 0.15], 500, ['drink']], 'Monster'],
  [['mccain-oven-chips', 'McCain Oven Chips', '🍟', [154, 2.5, 25.6, 4.6, 3.1, 0.5, 0.5, 0.15], 150, ['frozen']], 'McCain'],
  [['birdseye-green-cuisine-nuggets', 'Birds Eye Green Cuisine Nuggets', '🌱', [209, 12, 20, 8, 5, 1.2, 1.1, 1], 100, ['frozen', 'vegan', 'high-protein']], 'Birds Eye'],
  [['youngs-fish-pie', 'Young’s Gastro Fish Pie', '🐟', [142, 7.5, 10, 8, 1, 1.5, 3.5, 0.8], 350, ['frozen', 'fish', 'meal']], 'Young’s'],
  [['warburtons-crumpets', 'Warburtons Crumpets', '🥞', [198, 6, 38, 1.2, 2, 2.5, 0.3, 1.1], 55, ['bread', 'breakfast']], 'Warburtons'],
  [['heck-chicken-sausages', 'HECK Chicken Italia Sausages', '🌭', [186, 17, 4, 11, 0.5, 1, 3.3, 1.4], 65, ['meat', 'high-protein']], 'HECK'],
  [['tilda-basmati-pouch', 'Tilda Basmati Rice Pouch', '🍚', [151, 3.2, 32.2, 1.1, 0.8, 0.2, 0.2, 0.3], 250, ['grain', 'store-cupboard']], 'Tilda'],
  [['old-el-paso-taco-kit', 'Old El Paso Stand ’N Stuff Taco Kit', '🌮', [238, 6.5, 43, 4.5, 4, 3, 1.3, 1.3], 100, ['world', 'meal']], 'Old El Paso'],
  [['pataks-korma-sauce', 'Patak’s Korma Cooking Sauce', '🍛', [126, 1.7, 9, 9, 1.2, 6.5, 3.2, 1], 125, ['sauce', 'world']], 'Patak’s'],
];

export const BRANDED_FOODS_MORE = ROWS.map(([row, brand]) => brandedRow(row, brand));
