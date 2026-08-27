/**
 * Branded groceries people actually put in a trolley.
 *
 * The generic catalogue answers "baked beans"; this answers "Heinz Baked
 * Beans", which matters for two separate reasons:
 *
 *  - Nutrition differs by brand. Two tins of beans on the same shelf are not
 *    the same food, and a health grade built from a generic average is a
 *    grade for something nobody bought.
 *  - A retailer search for a named product finds it. A search for "beans"
 *    returns a wall of results the scraper cannot confidently price, so a
 *    specific name is the difference between a price and a shrug.
 *
 * Every row carries sugar, saturated fat and salt explicitly rather than
 * leaning on the generic micronutrient table. Those three drive the health
 * grade and the front-of-pack tags, and an unknown there is read as zero,
 * which would quietly grade a chocolate bar better than a bag of lentils.
 *
 * The figures are typical published per-100g label values. Manufacturers
 * reformulate — the pack in your hand is the authority, and the app says so
 * wherever these are shown.
 */

import { microsFor } from './micronutrients.js';

/**
 * `per100` is [kcal, protein, carbs, fat, fibre, sugar, satFat, saltGrams].
 * Salt is what a UK label prints; sodium in mg is what the scoring uses.
 */
const branded = ([
  id, name, brand, emoji, per100, portion, tags, micronutrientId = null, unit = 'g',
]) => {
  const [kcal, protein, carbs, fat, fibre = 0, sugar = 0, satFat = 0, salt = 0] = per100;
  return {
    id,
    name,
    brand,
    emoji,
    unit,
    source: 'branded',
    tags: [...tags, 'branded'],
    per100: {
      ...(micronutrientId ? microsFor(micronutrientId) : {}),
      kcal,
      protein,
      carbs,
      fat,
      fibre,
      sugar,
      satFat,
      sodium: Math.round((salt * 1000) / 2.5),
    },
    servings: [
      { label: `Serving (${portion} ${unit})`, grams: portion },
      { label: `100 ${unit}`, grams: 100 },
    ],
  };
};

const ROWS = [
  // ---- Store cupboard ----
  ['heinz-baked-beans-brand', 'Heinz Baked Beans', 'Heinz', '🥫', [78, 4.7, 12.5, 0.2, 3.7, 4.7, 0.1, 0.6], 207, ['tinned', 'store-cupboard'], 'baked-beans'],
  ['branston-baked-beans', 'Branston Baked Beans', 'Branston', '🥫', [81, 4.6, 13.4, 0.3, 3.6, 5.1, 0.1, 0.6], 207, ['tinned', 'store-cupboard'], 'baked-beans'],
  ['heinz-tomato-soup', 'Heinz Cream of Tomato Soup', 'Heinz', '🍲', [59, 0.9, 6.7, 3, 0.6, 5.2, 0.3, 0.6], 200, ['tinned', 'soup'], null],
  ['heinz-ketchup', 'Heinz Tomato Ketchup', 'Heinz', '🍅', [102, 1.2, 23.2, 0.1, 0.8, 22.8, 0.1, 1.8], 15, ['condiment'], null],
  ['hellmanns-mayo', "Hellmann's Real Mayonnaise", "Hellmann's", '🥄', [721, 1.1, 1.3, 79, 0, 1.3, 6, 1.3], 15, ['condiment'], null],
  ['hp-sauce', 'HP Brown Sauce', 'HP', '🍶', [122, 1, 28, 0.2, 0.9, 23, 0.1, 2.1], 15, ['condiment'], null],
  ['marmite', 'Marmite Yeast Extract', 'Marmite', '🍞', [258, 34, 24, 0.1, 3.5, 1, 0.1, 10.8], 8, ['spread'], null],
  ['nutella', 'Nutella Hazelnut Spread', 'Nutella', '🍫', [539, 6.3, 57.5, 30.9, 0, 56.3, 10.6, 0.107], 15, ['spread', 'treat', 'dairy'], null],
  ['napolina-chopped-tomatoes', 'Napolina Chopped Tomatoes', 'Napolina', '🍅', [21, 1.1, 3.3, 0.2, 1, 3.3, 0.1, 0.03], 200, ['tinned', 'store-cupboard'], null],
  ['dolmio-bolognese', 'Dolmio Bolognese Sauce', 'Dolmio', '🍝', [46, 1.4, 8, 0.6, 1.2, 6.4, 0.1, 0.9], 125, ['sauce'], null],

  // ---- Cereal and bakery ----
  ['kelloggs-corn-flakes', "Kellogg's Corn Flakes", "Kellogg's", '🥣', [378, 7, 84, 0.9, 3, 8, 0.2, 1.13], 30, ['breakfast', 'cereal'], null],
  ['kelloggs-special-k', "Kellogg's Special K", "Kellogg's", '🥣', [379, 15, 74, 1.5, 4.5, 15, 0.4, 1], 30, ['breakfast', 'cereal'], null],
  ['shreddies', 'Nestlé Shreddies', 'Nestlé', '🥣', [353, 10.4, 68.5, 1.9, 11.1, 12.9, 0.4, 0.4], 40, ['breakfast', 'cereal', 'high-fibre'], null],
  ['warburtons-toastie', 'Warburtons Toastie White', 'Warburtons', '🍞', [235, 8.9, 43.5, 1.9, 2.6, 3.4, 0.4, 1], 44, ['bread'], 'wholemeal-bread'],
  ['kingsmill-5050', 'Kingsmill 50/50', 'Kingsmill', '🍞', [231, 9.2, 41.4, 2.4, 4.3, 3.5, 0.5, 0.95], 40, ['bread'], 'wholemeal-bread'],

  // ---- Dairy and chilled ----
  ['cathedral-city-mature', 'Cathedral City Mature Cheddar', 'Cathedral City', '🧀', [416, 25, 0.1, 34.9, 0, 0.1, 21.7, 1.8], 30, ['dairy', 'cheese'], null],
  ['philadelphia-original', 'Philadelphia Original', 'Philadelphia', '🧀', [253, 5.6, 4.1, 23, 0, 4.1, 15.8, 0.85], 30, ['dairy', 'cheese'], null],
  ['babybel-original', 'Mini Babybel Original', 'Babybel', '🧀', [299, 22.7, 0, 23.4, 0, 0, 16.3, 1.7], 20, ['dairy', 'cheese', 'snack'], null],
  ['lurpak-slightly-salted', 'Lurpak Slightly Salted Butter', 'Lurpak', '🧈', [717, 0.6, 0.6, 79, 0, 0.6, 52, 1.2], 10, ['dairy', 'fat'], null],
  ['yeo-valley-natural', 'Yeo Valley Natural Yogurt', 'Yeo Valley', '🥛', [82, 4.6, 6.1, 4.2, 0, 6.1, 2.8, 0.17], 150, ['dairy'], 'greek-yogurt'],
  ['muller-corner', 'Müller Corner Strawberry', 'Müller', '🥛', [110, 3.8, 15.6, 3.2, 0.4, 14.4, 2.1, 0.15], 135, ['dairy', 'treat'], 'greek-yogurt'],

  // ---- Drinks ----
  ['robinsons-orange-squash', 'Robinsons Orange Squash (diluted)', 'Robinsons', '🥤', [2, 0, 0.2, 0, 0, 0.2, 0, 0.01], 250, ['drink'], null, 'ml'],
  ['tropicana-orange', 'Tropicana Smooth Orange Juice', 'Tropicana', '🍊', [44, 0.7, 9.4, 0.1, 0.2, 9.4, 0, 0.01], 250, ['drink', 'juice'], 'orange-juice', 'ml'],
  ['ribena-blackcurrant', 'Ribena Blackcurrant (diluted)', 'Ribena', '🥤', [17, 0, 4, 0, 0, 4, 0, 0.01], 250, ['drink'], null, 'ml'],
  ['lucozade-energy', 'Lucozade Energy Original', 'Lucozade', '🥤', [70, 0, 17, 0, 0, 17, 0, 0.06], 380, ['drink'], null, 'ml'],
  ['innocent-smoothie', 'Innocent Strawberry & Banana Smoothie', 'Innocent', '🍓', [56, 0.7, 12.2, 0.2, 1.3, 11.4, 0.1, 0.01], 250, ['drink', 'juice'], null, 'ml'],

  // ---- Snacks and confectionery ----
  ['cadbury-dairy-milk', 'Cadbury Dairy Milk', 'Cadbury', '🍫', [534, 7.3, 57, 30, 2.1, 56, 18, 0.24], 45, ['snack', 'treat', 'dairy'], 'dark-chocolate'],
  ['kitkat-four-finger', 'KitKat Four Finger', 'KitKat', '🍫', [518, 6.2, 59.2, 27.6, 2.4, 47.8, 15.9, 0.19], 45, ['snack', 'treat', 'dairy'], 'dark-chocolate'],
  ['maltesers', 'Maltesers', 'Maltesers', '🍫', [498, 7.7, 61.7, 24.1, 1.6, 55.4, 15.3, 0.35], 37, ['snack', 'treat', 'dairy'], 'dark-chocolate'],
  ['doritos-tangy-cheese', 'Doritos Tangy Cheese', 'Doritos', '🌮', [497, 6.9, 60.2, 24.8, 3.7, 3.4, 2.2, 1.5], 30, ['snack', 'dairy'], null],
  ['pringles-original', 'Pringles Original', 'Pringles', '🥔', [536, 4, 51, 34, 3.1, 1.4, 3.1, 1.4], 30, ['snack'], null],
  ['hula-hoops-original', 'Hula Hoops Original', 'Hula Hoops', '🥔', [512, 4.4, 57, 29, 3.2, 1.1, 2.6, 1.6], 24, ['snack'], null],
  ['jaffa-cakes', 'McVitie’s Jaffa Cakes', 'McVitie’s', '🍊', [370, 4.3, 71, 7.4, 2, 47, 3.7, 0.15], 12, ['snack', 'treat', 'egg'], null],
  ['hobnobs', 'McVitie’s Hobnobs', 'McVitie’s', '🍪', [464, 6.9, 63.7, 19.8, 4.6, 26.4, 9.7, 0.9], 15, ['snack', 'treat'], null],

  // ---- Meat, fish and meat-free ----
  ['richmond-sausages', 'Richmond Thick Pork Sausages', 'Richmond', '🌭', [270, 10.4, 11.4, 20.6, 1.2, 1.3, 7.4, 1.5], 57, ['meat'], null],
  ['quorn-mince', 'Quorn Meat Free Mince', 'Quorn', '🌱', [105, 14.5, 4.5, 2, 5.5, 0.8, 0.5, 0.6], 100, ['meat-free', 'high-protein', 'egg'], null],
  ['linda-mccartney-sausages', 'Linda McCartney Vegetarian Sausages', 'Linda McCartney', '🌱', [242, 19.6, 8.4, 14, 3.9, 1.5, 1.7, 1.6], 50, ['meat-free', 'high-protein', 'vegan'], null],
  ['birds-eye-fish-fingers', 'Birds Eye Cod Fish Fingers', 'Birds Eye', '🐟', [200, 12, 18, 8.9, 1.2, 0.9, 1, 0.7], 84, ['frozen', 'fish'], null],

  // ---- Frozen and quick ----
  ['mccain-home-chips', 'McCain Home Chips', 'McCain', '🍟', [161, 2.5, 25.2, 5.2, 2.6, 0.5, 0.5, 0.11], 150, ['frozen'], null],
  ['batchelors-super-noodles', 'Batchelors Chicken Super Noodles', 'Batchelors', '🍜', [451, 8.7, 58.6, 20.1, 3.1, 4.2, 9.4, 2.4], 100, ['store-cupboard'], null],
  ['bens-original-rice', "Ben's Original Long Grain Rice", "Ben's Original", '🍚', [149, 3.1, 30.8, 1.4, 1.1, 0.3, 0.2, 0.01], 125, ['store-cupboard'], 'white-rice'],
];

export const BRANDED_FOODS = ROWS.map(branded);

/** Every brand represented, for a filter or a picker. */
export const BRANDS = [...new Set(BRANDED_FOODS.map((food) => food.brand))].sort();
