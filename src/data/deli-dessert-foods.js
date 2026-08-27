/**
 * Counter, freezer and pudding: the categories that had one or two entries.
 *
 * Cheese had nine varieties but no blue cheese or goat's cheese; cured meats
 * had sliced ham and nothing else; desserts had vanilla ice cream alone. These
 * are the things a real trolley is full of, and an item the catalogue cannot
 * find is an item with no tags, no grade and no branded suggestion.
 *
 * Sugar, saturated fat and salt are stated on every row, because those three
 * decide the health grade and the grade refuses to score without them.
 */

import { foodRow } from './food-row.js';

const ROWS = [
  // ---- Cheese counter ----
  ['red-leicester', 'Red Leicester', '🧀', [401, 24.3, 0.1, 33.7, 0, 0.1, 21.1, 1.8], 30, ['dairy', 'cheese'], null],
  ['wensleydale', 'Wensleydale', '🧀', [377, 23, 0.1, 31.5, 0, 0.1, 19.7, 1.7], 30, ['dairy', 'cheese'], null],
  ['stilton', 'Stilton, blue', '🧀', [410, 23.7, 0.1, 35, 0, 0.1, 22.4, 2], 30, ['dairy', 'cheese'], null],
  ['goats-cheese', 'Goat’s cheese, soft', '🧀', [268, 18.5, 2.5, 20.6, 0, 2.5, 14.2, 1.2], 30, ['dairy', 'cheese'], null],
  ['mascarpone', 'Mascarpone', '🧀', [431, 4.4, 3.6, 44, 0, 3.6, 29.5, 0.1], 30, ['dairy', 'cheese'], null],
  ['creme-fraiche', 'Crème fraîche', '🥛', [299, 2.4, 2.9, 31, 0, 2.9, 21.4, 0.08], 30, ['dairy'], null],
  ['greek-style-yogurt', 'Yogurt, Greek-style', '🥛', [133, 5.7, 4.5, 10.2, 0, 4.5, 6.8, 0.13], 150, ['dairy'], 'greek-yogurt'],
  ['soft-cheese-light', 'Soft cheese, light', '🧀', [153, 9.5, 5, 10.5, 0, 5, 6.9, 0.8], 30, ['dairy', 'cheese'], null],

  // ---- Cured and cooked meats ----
  ['chorizo', 'Chorizo', '🌭', [455, 24.1, 1.9, 38.3, 0, 1.1, 14.4, 3.5], 30, ['meat', 'cured'], null],
  ['salami', 'Salami', '🌭', [407, 21.8, 1.2, 34.4, 0, 0.8, 13.1, 4.3], 20, ['meat', 'cured'], null],
  ['pepperoni', 'Pepperoni', '🍕', [494, 20.4, 1.2, 44.9, 0, 0.8, 16.8, 4.2], 20, ['meat', 'cured'], null],
  ['prosciutto', 'Prosciutto', '🥓', [258, 26.5, 0.5, 16.9, 0, 0.5, 5.9, 5], 20, ['meat', 'cured'], null],
  ['corned-beef', 'Corned beef', '🥫', [217, 26.9, 1, 12.1, 0, 1, 5.4, 1.8], 50, ['meat', 'tinned'], null],
  ['black-pudding', 'Black pudding', '🍳', [297, 10.3, 20.5, 19.5, 0.9, 0.7, 8, 2], 60, ['meat'], null],
  ['chicken-liver-pate', 'Pâté, chicken liver', '🥫', [297, 12.5, 2.5, 26.2, 0.4, 1.2, 10.4, 1.4], 30, ['meat'], null],
  ['scotch-egg', 'Scotch egg', '🥚', [270, 12.1, 15.8, 17.4, 1.2, 1.1, 4.9, 1.2], 113, ['meat', 'snack'], null],

  // ---- Fish counter ----
  ['tuna-steak', 'Tuna steak, cooked', '🐟', [184, 30, 0, 6.3, 0, 0, 1.6, 0.11], 140, ['fish', 'high-protein'], 'salmon-fillet'],
  ['pollock-fillet', 'Pollock fillet, cooked', '🐟', [111, 23.5, 0, 1.2, 0, 0, 0.2, 0.2], 140, ['fish', 'high-protein'], 'cod-fillet'],
  ['hake-fillet', 'Hake fillet, cooked', '🐟', [108, 22.4, 0, 1.9, 0, 0, 0.4, 0.15], 140, ['fish', 'high-protein'], null],
  ['kippers', 'Kippers, grilled', '🐟', [217, 25.5, 0, 12.8, 0, 0, 2.7, 2.5], 120, ['fish', 'high-protein'], null],
  ['squid-cooked', 'Squid, cooked', '🦑', [175, 17.9, 7.8, 7.5, 0, 0, 1.9, 0.6], 100, ['fish'], null],
  ['smoked-haddock', 'Smoked haddock, cooked', '🐟', [101, 23.3, 0, 0.6, 0, 0, 0.1, 3.1], 140, ['fish', 'high-protein'], 'cod-fillet'],

  // ---- Puddings and bakery treats ----
  ['rice-pudding', 'Rice pudding', '🍚', [89, 3.4, 15.6, 1.6, 0.2, 9.6, 1, 0.15], 150, ['dessert'], null],
  ['custard', 'Custard, ready-made', '🍮', [101, 3, 16.5, 2.7, 0, 11.5, 1.7, 0.12], 120, ['dessert'], null],
  ['sticky-toffee-pudding', 'Sticky toffee pudding', '🍰', [364, 3.5, 53.9, 14.7, 1.3, 38.2, 8.5, 0.6], 100, ['dessert', 'treat'], null],
  ['apple-pie', 'Apple pie', '🥧', [265, 2.4, 34.5, 12.5, 1.6, 15.5, 5.4, 0.4], 120, ['dessert', 'treat'], null],
  ['cheesecake', 'Cheesecake, baked', '🍰', [321, 5.5, 30.4, 19.5, 0.7, 22.1, 11, 0.5], 100, ['dessert', 'treat'], null],
  ['victoria-sponge', 'Victoria sponge cake', '🍰', [412, 4.9, 51.6, 20.6, 1, 34.5, 8.4, 0.5], 70, ['dessert', 'treat'], null],
  ['chocolate-brownie', 'Chocolate brownie', '🍫', [466, 5.6, 53, 25.5, 2.4, 40.1, 12.9, 0.35], 60, ['dessert', 'treat'], null],
  ['jam-doughnut', 'Doughnut, jam', '🍩', [336, 5.4, 44.5, 15, 1.9, 17.4, 6.8, 0.6], 75, ['dessert', 'treat'], null],
  ['blueberry-muffin', 'Muffin, blueberry', '🧁', [387, 5.1, 50.5, 18.2, 1.5, 27.6, 3.4, 0.55], 100, ['dessert', 'treat'], null],
  ['flapjack', 'Flapjack', '🍪', [472, 5, 58, 24, 3.4, 32, 12.4, 0.3], 60, ['snack', 'treat'], 'porridge-oats'],
  ['shortbread', 'Shortbread', '🍪', [523, 5.4, 60.3, 28.6, 1.9, 18.4, 17.9, 0.6], 20, ['snack', 'treat'], null],
  ['scone-plain', 'Scone, plain', '🥯', [362, 7.2, 53.8, 13.5, 2.1, 8.1, 6.6, 1.1], 60, ['bakery'], null],
  ['mince-pie', 'Mince pie', '🥧', [412, 3.9, 59.5, 17.1, 2.2, 30.1, 8, 0.4], 60, ['dessert', 'treat'], null],

  // ---- Freezer ----
  ['frozen-berries', 'Berries, mixed, frozen', '🫐', [48, 1, 8.4, 0.4, 3.7, 7.9, 0.1, 0.01], 100, ['frozen', 'fruit'], null],
  ['frozen-spinach', 'Spinach, frozen', '🥬', [28, 3.2, 1.1, 0.6, 2.5, 0.7, 0.1, 0.15], 100, ['frozen', 'veg'], null],
  ['yorkshire-pudding', 'Yorkshire pudding', '🥐', [292, 8.9, 38.6, 11.1, 1.6, 4.1, 2.5, 0.9], 30, ['frozen', 'bakery'], null],
  ['frozen-onion-rings', 'Onion rings, frozen', '🧅', [276, 3.6, 33.5, 13.9, 2.4, 3.8, 1.4, 1.2], 80, ['frozen', 'snack'], null],
  ['garlic-bread', 'Garlic bread', '🥖', [341, 7.8, 40.2, 16.3, 2.4, 2.6, 8.1, 1.1], 50, ['frozen', 'bakery'], null],
  ['frozen-yorkshire-veg', 'Roasting vegetables, frozen', '🥕', [62, 1.9, 8.4, 2.1, 3.1, 3.6, 0.2, 0.1], 120, ['frozen', 'veg'], null],
  ['choc-ice-lolly', 'Ice lolly, chocolate', '🍦', [295, 3.3, 27.5, 19, 0.8, 24.7, 14.6, 0.12], 70, ['frozen', 'treat'], 'ice-cream'],
  ['fruit-ice-lolly', 'Ice lolly, fruit', '🧊', [83, 0.2, 20.2, 0.1, 0.2, 18.5, 0, 0.02], 75, ['frozen', 'treat'], null],

  // ---- Deli and lunch ----
  ['sausage-roll', 'Sausage roll', '🥐', [354, 9.3, 25.5, 23.4, 1.5, 1.4, 10.4, 1.3], 60, ['bakery', 'meat'], null],
  ['pork-pie', 'Pork pie', '🥧', [376, 10.9, 24.4, 26.3, 1.2, 0.9, 10.1, 1.4], 140, ['bakery', 'meat'], null],
  ['quiche-lorraine', 'Quiche Lorraine', '🥧', [278, 9.5, 18.4, 18.4, 1, 2.1, 8.6, 0.9], 125, ['bakery'], null],
  ['tzatziki', 'Tzatziki', '🥒', [123, 3.1, 3.5, 10.7, 0.4, 3.2, 6.4, 0.7], 50, ['dip', 'dairy'], null],
  ['guacamole', 'Guacamole', '🥑', [166, 1.9, 3.2, 15.6, 4.5, 1, 2.6, 0.7], 50, ['dip', 'vegan'], null],
  ['salsa-dip', 'Salsa, tomato', '🍅', [36, 1.3, 5.9, 0.3, 1.3, 4.6, 0.1, 1.1], 50, ['dip', 'vegan'], null],
  ['taramasalata', 'Taramasalata', '🐟', [489, 3.2, 4.1, 50.6, 0.4, 2.5, 3.9, 1.4], 50, ['dip', 'fish'], null],
  ['sushi-selection', 'Sushi selection', '🍣', [142, 5.8, 26.4, 1.2, 1.4, 4.1, 0.3, 1], 200, ['meal', 'fish'], null],
  ['falafel-wrap', 'Falafel wrap', '🌯', [212, 7.2, 27.4, 8.1, 3.9, 3.1, 1.3, 1.1], 220, ['meal', 'vegan'], null],
  ['jacket-potato-beans', 'Jacket potato with beans', '🥔', [110, 4.2, 20.1, 0.6, 3.2, 3.1, 0.1, 0.4], 350, ['meal', 'vegan'], null],
];

export const DELI_DESSERT_FOODS = ROWS.map(foodRow);
