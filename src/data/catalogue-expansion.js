import { foodRow, brandedRow } from './food-row.js';

// Common foods deliberately kept as separate rows so ingredient search and
// nutrition targets can distinguish preparation and dietary use.
const GENERIC_ROWS = [
  ['turkey-breast-slices', 'Turkey breast slices', '🍗', [104, 22, 1, 1.5, 0, 1, 0.5, 1.8], 60, ['meat', 'high-protein', 'deli'], null],
  ['chicken-mince', 'Chicken mince, cooked', '🍗', [143, 27, 0, 4, 0, 0, 1.2, 0.2], 125, ['meat', 'high-protein'], 'chicken-breast'],
  ['tinned-chicken', 'Chicken breast, tinned', '🥫', [122, 26, 0, 2, 0, 0, 0.6, 0.8], 100, ['meat', 'tinned', 'high-protein'], 'chicken-breast'],
  ['pollock', 'Pollock, cooked', '🐟', [111, 24, 0, 1, 0, 0, 0.2, 0.3], 140, ['fish', 'high-protein'], 'cod-fillet'],
  ['tinned-salmon', 'Salmon, tinned', '🐟', [139, 23, 0, 5, 0, 0, 1.2, 0.7], 100, ['fish', 'tinned', 'high-protein'], 'salmon-fillet'],
  ['calamari', 'Calamari, cooked', '🦑', [92, 15.6, 3.1, 1.4, 0, 0, 0.4, 0.5], 100, ['seafood', 'high-protein'], 'prawns'],
  ['egg-whites', 'Egg whites', '🥚', [52, 10.9, 0.7, 0.2, 0, 0.7, 0.1, 0.4], 150, ['egg', 'high-protein', 'low-calorie'], 'egg'],
  ['reduced-fat-cottage-cheese', 'Cottage cheese, reduced fat', '🧀', [72, 12.5, 3.5, 1.5, 0, 3.5, 1, 0.4], 150, ['dairy', 'high-protein', 'low-calorie'], 'cottage-cheese'],
  ['protein-pudding', 'High-protein pudding', '🥣', [76, 10, 6, 1.5, 0, 4.5, 1, 0.2], 200, ['dairy', 'high-protein', 'snack'], 'greek-yogurt'],
  ['soy-yogurt', 'Soya yogurt, plain', '🥣', [50, 4.5, 3.5, 2.5, 0.8, 2.5, 0.4, 0.1], 125, ['vegan', 'dairy-free'], 'greek-yogurt'],
  ['black-eyed-beans', 'Black-eyed beans, cooked', '🫘', [116, 7.7, 20, 0.5, 6.5, 1.2, 0.1, 0.02], 150, ['pulse', 'plant-protein', 'high-fibre'], 'chickpeas'],
  ['hummus-beetroot', 'Beetroot hummus', '🫙', [186, 5.5, 15, 11, 5, 3, 1.5, 1.1], 40, ['dip', 'vegan'], 'hummus'],
  ['seitan-slices', 'Seitan slices', '🌱', [141, 25, 12, 2, 0.6, 1, 0.4, 1.2], 100, ['vegan', 'plant-protein', 'high-protein'], 'tofu'],
  ['buckwheat', 'Buckwheat, cooked', '🌾', [92, 3.4, 19.9, 0.6, 2.7, 0.9, 0.1, 0.01], 150, ['grain', 'gluten-free'], 'quinoa'],
  ['oat-flour', 'Oat flour', '🌾', [404, 14.7, 65.7, 9.1, 6.5, 1, 1.5, 0.02], 40, ['baking', 'grain'], 'porridge-oats'],
  ['rice-paper', 'Rice paper wrappers', '🫓', [351, 5.8, 82, 0.6, 1.3, 0.2, 0.1, 0.03], 20, ['grain', 'world'], 'white-rice'],
  ['wholegrain-couscous', 'Wholegrain couscous, cooked', '🌾', [112, 4, 23, 0.5, 3.8, 0.4, 0.1, 0.02], 150, ['grain', 'high-fibre'], 'couscous'],
  ['green-lentils', 'Green lentils, cooked', '🫘', [116, 9, 20, 0.4, 8, 1.8, 0.1, 0.02], 150, ['pulse', 'plant-protein', 'high-fibre'], 'lentils'],
  ['broad-beans', 'Broad beans', '🫛', [88, 7.6, 11.7, 0.7, 7, 1.5, 0.1, 0.02], 100, ['veg', 'plant-protein'], 'peas'],
  ['edamame-spaghetti', 'Edamame spaghetti, cooked', '🍝', [145, 20, 11, 3.5, 8, 1.5, 0.5, 0.05], 150, ['pasta', 'plant-protein', 'high-protein'], 'tofu'],
  ['spinach-frozen', 'Spinach, frozen', '🥬', [23, 2.9, 3.6, 0.4, 2.2, 0.4, 0.1, 0.1], 80, ['veg', 'frozen'], 'spinach'],
  ['mixed-vegetables-frozen', 'Mixed vegetables, frozen', '🥦', [50, 3, 8, 0.5, 3.5, 3, 0.1, 0.1], 150, ['veg', 'frozen'], 'broccoli'],
  ['edamame-frozen', 'Edamame, frozen', '🫛', [121, 12, 9, 5.2, 5.2, 2.2, 0.8, 0.02], 100, ['veg', 'plant-protein', 'frozen'], 'tofu'],
  ['courgette-noodles', 'Courgette noodles', '🥒', [20, 1.5, 3.5, 0.3, 1.2, 2.5, 0.1, 0.02], 150, ['veg', 'low-calorie'], 'broccoli'],
  ['light-mayonnaise', 'Mayonnaise, light', '🫙', [335, 1, 8, 33, 0, 3, 5, 1.2], 15, ['sauce', 'low-calorie'], 'mayonnaise'],
  ['light-coconut-milk', 'Coconut milk, reduced fat', '🥥', [74, 1, 2.7, 7, 0.5, 1.5, 6, 0.03], 100, ['tinned', 'world'], 'coconut-milk-tinned', 'ml'],
];

const BRANDED_ROWS = [
  [['muller-protein', 'Müller Protein Yogurt', '🥣', [73, 10, 5.5, 0.2, 0, 5, 0.1, 0.2], 200, ['dairy', 'high-protein', 'branded'], 'greek-yogurt'], 'Müller'],
  [['fage-total-0', 'FAGE Total 0% Greek Yogurt', '🥣', [57, 10.3, 3.8, 0.2, 0, 3.8, 0.1, 0.1], 170, ['dairy', 'high-protein', 'branded'], 'greek-yogurt'], 'FAGE'],
  [['arla-skyr', 'Arla Skyr Natural', '🥣', [62, 11, 4, 0.2, 0, 4, 0.1, 0.1], 150, ['dairy', 'high-protein', 'branded'], 'greek-yogurt'], 'Arla'],
  [['weetabix-protein', 'Weetabix Protein', '🌾', [359, 17, 55, 7, 10, 4, 1, 0.45], 50, ['breakfast', 'high-protein', 'branded'], 'porridge-oats'], 'Weetabix'],
  [['warburtons-thins', 'Warburtons Sandwich Thins', '🍞', [244, 9.5, 42, 4, 5, 3, 0.8, 0.9], 50, ['bread', 'branded'], 'wholemeal-bread'], 'Warburtons'],
  [['kp-peanuts', 'KP Dry Roasted Peanuts', '🥜', [605, 26, 12, 50, 8, 4.5, 8, 1], 30, ['snack', 'high-protein', 'branded'], 'almonds'], 'KP'],
  [['princes-tuna', 'Princes Tuna in Spring Water', '🐟', [109, 25, 0, 0.8, 0, 0, 0.2, 0.8], 112, ['tinned', 'fish', 'high-protein', 'branded'], 'tuna-tinned'], 'Princes'],
  [['birds-eye-steamfresh', 'Birds Eye Steamfresh Mixed Vegetables', '🥦', [44, 2.8, 6.5, 0.5, 3.2, 2.5, 0.1, 0.1], 150, ['frozen', 'veg', 'branded'], 'broccoli'], 'Birds Eye'],
  [['heck-chicken-sausages', 'HECK Chicken Italia Sausages', '🌭', [183, 17, 3, 11, 0, 1, 3.5, 1.5], 75, ['meat', 'high-protein', 'branded'], 'chicken-breast'], 'HECK'],
  [['grenade-carb-killa', 'Grenade Carb Killa Protein Bar', '💪', [366, 33, 31, 14, 8, 2.5, 8, 0.5], 60, ['snack', 'high-protein', 'branded'], 'protein-bar'], 'Grenade'],
  [['huel-black', 'Huel Black Edition', '💪', [400, 40, 25, 18, 8, 3, 3.5, 0.9], 90, ['high-protein', 'vegan', 'branded'], 'whey-protein'], 'Huel'],
];

export const CATALOGUE_EXPANSION = GENERIC_ROWS.map(foodRow);
export const BRANDED_CATALOGUE_EXPANSION = BRANDED_ROWS.map(([row, brand]) => brandedRow(row, brand));
