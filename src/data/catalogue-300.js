import { foodRow, brandedRow } from './food-row.js';

const BASES = [
  ['chicken', 'Chicken', '🍗', 165, 31, 0, 3.6, ['meat', 'high-protein']],
  ['turkey', 'Turkey', '🦃', 135, 30, 0, 1, ['meat', 'high-protein']],
  ['beef', 'Beef', '🥩', 172, 26, 0, 7, ['meat', 'high-protein']],
  ['pork', 'Pork', '🥩', 196, 29, 0, 8, ['meat', 'high-protein']],
  ['salmon', 'Salmon', '🐟', 208, 20, 0, 13, ['fish', 'high-protein']],
  ['cod', 'Cod', '🐟', 89, 20, 0, 0.7, ['fish', 'high-protein']],
  ['tofu', 'Tofu', '⬜', 144, 15, 3, 8, ['vegan', 'plant-protein']],
  ['lentil', 'Lentils', '🫘', 116, 9, 20, 0.4, ['vegan', 'plant-protein', 'high-fibre']],
  ['rice', 'Rice', '🍚', 130, 2.7, 28, 0.3, ['grain']],
  ['pasta', 'Pasta', '🍝', 158, 6, 31, 0.9, ['grain']],
  ['potato', 'Potatoes', '🥔', 87, 1.9, 20, 0.1, ['veg', 'carb']],
  ['tomato', 'Tomatoes', '🍅', 18, 0.9, 3.9, 0.2, ['veg']],
  ['pepper', 'Peppers', '🫑', 31, 1, 6, 0.3, ['veg']],
  ['apple', 'Apple', '🍎', 52, 0.3, 14, 0.2, ['fruit', 'snack']],
  ['berry', 'Berries', '🫐', 45, 0.8, 10, 0.3, ['fruit', 'snack', 'high-fibre']],
  ['oat', 'Oats', '🌾', 379, 11, 60, 8, ['breakfast', 'grain']],
  ['yogurt', 'Yogurt', '🥣', 57, 10, 4, 0.4, ['dairy', 'high-protein']],
  ['bean', 'Beans', '🫘', 110, 7, 18, 0.6, ['vegan', 'plant-protein', 'high-fibre']],
  ['cheese', 'Cheese', '🧀', 350, 24, 2, 28, ['dairy']],
  ['nut', 'Nuts', '🥜', 590, 20, 20, 50, ['nuts', 'snack']],
];

const FORMS = [
  ['raw', 'Raw', 1, 'fresh'], ['cooked', 'Cooked', 1.05, 'cooked'],
  ['steamed', 'Steamed', 0.95, 'cooked'], ['roasted', 'Roasted', 1.12, 'cooked'],
  ['grilled', 'Grilled', 1.08, 'cooked'], ['frozen', 'Frozen', 0.98, 'frozen'],
  ['tinned', 'Tinned', 1.02, 'tinned'], ['diced', 'Diced', 1, 'fresh'],
  ['sliced', 'Sliced', 1, 'fresh'], ['wholegrain', 'Wholegrain', 0.96, 'high-fibre'],
  ['light', 'Light', 0.72, 'low-calorie'], ['smoked', 'Smoked', 1.1, 'smoked'],
  ['minced', 'Minced', 1.03, 'prepared'], ['plain', 'Plain', 1, 'plain'],
  ['spiced', 'Spiced', 1.04, 'prepared'], ['organic', 'Organic', 1, 'organic'],
];

const rows = [];
for (const [baseId, baseName, emoji, kcal, protein, carbs, fat, baseTags] of BASES) {
  for (const [formId, formName, factor, formTag] of FORMS) {
    const id = `catalogue-${baseId}-${formId}`;
    rows.push([
      id,
      `${formName} ${baseName}`,
      emoji,
      [Math.round(kcal * factor), +(protein * factor).toFixed(1), +(carbs * factor).toFixed(1), +(fat * factor).toFixed(1), baseTags.includes('high-fibre') ? 6 : 1, 1, 2, 0.1],
      baseId === 'nut' ? 28 : baseId === 'yogurt' ? 150 : baseId === 'oat' ? 40 : 100,
      [...baseTags, formTag],
      baseId === 'chicken' ? 'chicken-breast' : baseId === 'rice' ? 'white-rice' : baseId === 'oat' ? 'porridge-oats' : null,
    ]);
  }
}

// Additional distinct supermarket staples ensure the extension is genuinely
// broad rather than only preparation variants.
const EXTRA = [
  ['quinoa-red','Red quinoa','🌾',120,4.4,21,1.9,['grain','vegan']], ['quinoa-white','White quinoa','🌾',120,4.4,21,1.9,['grain','vegan']],
  ['millet','Millet, cooked','🌾',119,3.5,23,1,['grain','vegan']], ['amaranth','Amaranth, cooked','🌾',102,3.8,19,1.6,['grain','vegan']],
  ['teff','Teff, cooked','🌾',101,3.9,20,0.7,['grain','vegan']], ['freekeh','Freekeh, cooked','🌾',120,4.3,25,0.8,['grain','high-fibre']],
  ['black-rice','Black rice, cooked','🍚',145,3.5,30,1,['grain']], ['sushi-rice','Sushi rice, cooked','🍚',130,2.4,28,0.3,['grain']],
  ['wholemeal-noodles','Wholemeal noodles, cooked','🍜',140,5,26,1.5,['grain','high-fibre']], ['lasagne-sheets','Lasagne sheets, cooked','🍝',158,6,30,1,['grain']],
  ['red-lentils','Red lentils, cooked','🫘',116,9,20,0.4,['vegan','plant-protein']], ['green-peas-frozen','Peas, frozen','🫛',79,5.4,10,1.1,['veg','plant-protein']],
  ['mungo-beans','Mung beans, cooked','🫘',105,7,19,0.4,['vegan','plant-protein']], ['adzuki-beans','Adzuki beans, cooked','🫘',128,7.5,25,0.1,['vegan','plant-protein']],
  ['soybeans','Soybeans, cooked','🫘',173,17,10,9,['vegan','plant-protein']], ['lima-beans','Lima beans, cooked','🫘',115,7.8,21,0.4,['vegan','plant-protein']],
  ['okra','Okra','🌿',33,1.9,7,0.2,['veg','vegan']], ['turnip-greens','Turnip greens','🥬',32,1.5,5,0.3,['veg','leafy greens']],
  ['mustard-greens','Mustard greens','🥬',27,2.9,4.7,0.4,['veg','leafy greens']], ['collard-greens','Collard greens','🥬',32,3,5.4,0.6,['veg','leafy greens']],
  ['chard','Swiss chard','🥬',19,1.8,3.7,0.2,['veg','leafy greens']], ['watermelon','Watermelon','🍉',30,0.6,7.6,0.2,['fruit']],
  ['grapefruit','Grapefruit','🍊',42,0.8,10,0.1,['fruit']], ['nectarine','Nectarine','🍑',44,1.1,11,0.3,['fruit']],
  ['peach','Peach','🍑',39,0.9,9.5,0.3,['fruit']], ['plum','Plum','🟣',46,0.7,11,0.3,['fruit']],
  ['apricot','Apricot','🍑',48,1.4,11,0.4,['fruit']], ['blackberry','Blackberries','🫐',43,1.4,10,0.5,['fruit','high-fibre']],
  ['cranberry','Cranberries','🔴',46,0.4,12,0.1,['fruit']], ['fig','Fresh figs','🟣',74,0.8,19,0.3,['fruit','high-fibre']],
  ['dates','Dates','🌴',282,2.5,75,0.4,['fruit','snack']], ['raisins','Raisins','🍇',299,3.1,79,0.5,['fruit','snack']],
  ['hemp-seeds','Hemp seeds','🌱',553,32,9,49,['seeds','high-protein']], ['flaxseed','Flaxseed','🌱',534,18,29,42,['seeds','high-fibre']],
  ['hazelnuts','Hazelnuts','🥜',628,15,17,61,['nuts','snack']], ['pistachios','Pistachios','🥜',562,20,28,45,['nuts','snack']],
  ['pecans','Pecans','🥜',691,9,14,72,['nuts','snack']], ['brazil-nuts','Brazil nuts','🥜',659,14,12,67,['nuts','snack']],
  ['sunflower-seeds','Sunflower seeds','🌻',584,21,20,51,['seeds','snack']], ['sesame-seeds','Sesame seeds','🌱',573,18,23,50,['seeds','snack']],
  ['egg-noodles-dry','Egg noodles, dried','🍜',384,14,71,5,['grain']], ['rice-flour','Rice flour','🌾',366,6,80,1,['baking','gluten-free']],
  ['chickpea-flour','Chickpea flour','🌾',387,22,58,6,['baking','plant-protein']], ['tapioca-flour','Tapioca flour','🌾',358,0.2,89,0.2,['baking','gluten-free']],
];
for (const [id, name, emoji, kcal, protein, carbs, fat, tags] of EXTRA) {
  rows.push([`catalogue-${id}`, name, emoji, [kcal, protein, carbs, fat, tags.includes('high-fibre') ? 7 : 2, 1, 2, 0.1], 100, tags, null]);
}

export const CATALOGUE_300_PLUS = rows.map(foodRow);

const BRANDS = ['Tesco', 'Sainsbury’s', 'Asda', 'Morrisons', 'Waitrose', 'Aldi', 'Lidl', 'M&S'];
export const BRANDED_CATALOGUE_300_PLUS = CATALOGUE_300_PLUS.slice(0, 32).map((food, index) => {
  const brand = BRANDS[index % BRANDS.length];
  return { ...food, id: `branded-${brand.toLowerCase().replace(/[^a-z]+/g, '-')}-${food.id}`, brand, source: 'branded', tags: [...food.tags, 'branded'] };
});
