import { foodRow } from './food-row.js';

const FAMILIES = [
  ['meat', 'Meat', '🥩', 190, 26, 0, 8, ['meat', 'high-protein']],
  ['fish', 'Fish', '🐟', 120, 23, 0, 3, ['fish', 'high-protein']],
  ['veg', 'Vegetables', '🥦', 30, 2, 6, 0.3, ['veg', 'vegan']],
  ['fruit', 'Fruit', '🍎', 55, 1, 14, 0.3, ['fruit', 'vegan']],
  ['grain', 'Grain', '🌾', 340, 10, 68, 3, ['grain']],
  ['pulse', 'Pulses', '🫘', 125, 8, 21, 1, ['vegan', 'plant-protein']],
];
const VARIANTS = [
  ['organic', 'Organic'], ['baby', 'Baby'], ['heritage', 'Heritage'], ['seasonal', 'Seasonal'],
  ['farmers-market', 'Farmers market'], ['budget', 'Budget'], ['premium', 'Premium'],
  ['quick-frozen', 'Quick-frozen'], ['sliced', 'Sliced'], ['diced', 'Diced'],
  ['chopped', 'Chopped'], ['grated', 'Grated'], ['roasted', 'Roasted'],
  ['grilled', 'Grilled'], ['steamed', 'Steamed'], ['marinated', 'Marinated'],
  ['smoked', 'Smoked'], ['crumbed', 'Crumbed'], ['stuffed', 'Stuffed'], ['ready-to-eat', 'Ready to eat'],
];
const SPECIFICS = [
  ['beetroot', 'Beetroot', '🫜', 44, 1.7, 10, 0.2, ['veg']], ['bok-choy', 'Bok choy', '🥬', 13, 1.5, 2.2, 0.2, ['veg']],
  ['broccoli-tenderstem', 'Tenderstem broccoli', '🥦', 35, 2.4, 7, 0.4, ['veg']], ['red-cabbage', 'Red cabbage', '🥬', 31, 1.4, 7.4, 0.2, ['veg']],
  ['savoy-cabbage', 'Savoy cabbage', '🥬', 27, 2, 6, 0.1, ['veg']], ['napa-cabbage', 'Napa cabbage', '🥬', 16, 1.2, 3.2, 0.2, ['veg']],
  ['watercress', 'Watercress', '🌿', 11, 2.3, 1.3, 0.1, ['veg', 'leafy greens']], ['endive', 'Endive', '🥬', 17, 1.3, 3.4, 0.2, ['veg']],
  ['chicory', 'Chicory', '🥬', 23, 1.7, 4.7, 0.3, ['veg']], ['kohlrabi', 'Kohlrabi', '🥦', 27, 1.7, 6.2, 0.1, ['veg']],
  ['pattypan-squash', 'Pattypan squash', '🎃', 18, 1.2, 3.8, 0.2, ['veg']], ['sugar-snap', 'Sugar snap peas', '🫛', 42, 2.8, 7.6, 0.2, ['veg']],
  ['broad-beans', 'Broad beans', '🫛', 88, 7.6, 11.7, 0.7, ['veg', 'plant-protein']], ['water-chestnuts', 'Water chestnuts', '🌰', 97, 1.4, 24, 0.1, ['veg']],
  ['bamboo-shoots', 'Bamboo shoots', '🎋', 27, 2.6, 5, 0.3, ['veg']], ['cassava', 'Cassava', '🥔', 160, 1.4, 38, 0.3, ['veg']],
  ['yam', 'Yam', '🍠', 118, 1.5, 28, 0.2, ['veg']], ['taro', 'Taro root', '🥔', 142, 0.5, 34, 0.2, ['veg']],
  ['plantain', 'Plantain', '🍌', 122, 1.3, 32, 0.4, ['fruit']], ['passion-fruit', 'Passion fruit', '🟣', 97, 2.2, 23, 0.7, ['fruit', 'high-fibre']],
  ['clementine', 'Clementine', '🍊', 47, 0.9, 12, 0.2, ['fruit']], ['pomegranate', 'Pomegranate', '🔴', 83, 1.7, 19, 1.2, ['fruit']],
  ['blackcurrant', 'Blackcurrants', '🫐', 63, 1.4, 15, 0.4, ['fruit', 'high-fibre']], ['redcurrant', 'Redcurrants', '🔴', 56, 1.4, 14, 0.2, ['fruit']],
  ['gooseberry', 'Gooseberries', '🟢', 44, 0.9, 10, 0.6, ['fruit', 'high-fibre']], ['mulberry', 'Mulberries', '🫐', 43, 1.4, 10, 0.4, ['fruit']],
  ['starfruit', 'Star fruit', '⭐', 31, 1, 7, 0.3, ['fruit']], ['tamarind', 'Tamarind', '🟤', 239, 2.8, 63, 0.6, ['fruit']],
  ['sorghum', 'Sorghum, cooked', '🌾', 119, 4, 27, 1.2, ['grain', 'gluten-free']], ['teff', 'Teff, cooked', '🌾', 101, 3.9, 20, 0.7, ['grain']],
  ['amaranth', 'Amaranth, cooked', '🌾', 102, 3.8, 19, 1.6, ['grain', 'gluten-free']], ['farro', 'Farro, cooked', '🌾', 100, 4, 26, 0.7, ['grain']],
  ['rye-berries', 'Rye berries, cooked', '🌾', 145, 4.9, 31, 1.1, ['grain', 'high-fibre']], ['oat-bran', 'Oat bran', '🌾', 246, 17, 66, 7, ['grain', 'high-fibre']],
  ['wheat-germ', 'Wheat germ', '🌾', 360, 23, 52, 10, ['grain', 'high-protein']], ['cornmeal', 'Cornmeal', '🌽', 362, 8, 76, 4, ['grain']],
  ['mung-beans', 'Mung beans, cooked', '🫘', 105, 7, 19, 0.4, ['vegan', 'plant-protein']], ['adzuki-beans', 'Adzuki beans, cooked', '🫘', 128, 7.5, 25, 0.1, ['vegan', 'plant-protein']],
  ['navy-beans', 'Navy beans, cooked', '🫘', 140, 9.7, 26, 0.6, ['vegan', 'plant-protein']], ['soybeans', 'Soybeans, cooked', '🫘', 173, 17, 10, 9, ['vegan', 'plant-protein']],
  ['lupin-beans', 'Lupin beans', '🫘', 119, 16, 10, 3, ['vegan', 'plant-protein']], ['pigeon-peas', 'Pigeon peas', '🫘', 121, 7, 23, 0.4, ['vegan', 'plant-protein']],
  ['mung-dal', 'Mung dal, cooked', '🫘', 105, 7, 19, 0.4, ['vegan', 'plant-protein']], ['black-dal', 'Black dal, cooked', '🫘', 130, 8, 22, 1, ['vegan', 'plant-protein']],
  ['chicken-liver', 'Chicken liver, cooked', '🍗', 167, 25, 1, 6, ['meat', 'high-protein']], ['beef-liver', 'Beef liver, cooked', '🥩', 191, 29, 5, 5, ['meat', 'high-protein']],
  ['lamb-liver', 'Lamb liver, cooked', '🥩', 220, 30, 3, 9, ['meat', 'high-protein']], ['venison', 'Venison, cooked', '🦌', 158, 30, 0, 3, ['meat', 'high-protein']],
  ['rabbit', 'Rabbit, cooked', '🐇', 173, 33, 0, 4, ['meat', 'high-protein']], ['goat-meat', 'Goat meat, cooked', '🥩', 143, 27, 0, 3, ['meat', 'high-protein']],
  ['quail', 'Quail, cooked', '🐦', 234, 25, 0, 14, ['meat', 'high-protein']], ['duck-leg', 'Duck leg, cooked', '🍗', 217, 24, 0, 13, ['meat']],
  ['hake', 'Hake, cooked', '🐟', 90, 20, 0, 1, ['fish', 'high-protein']], ['monkfish', 'Monkfish, cooked', '🐟', 97, 19, 0, 1.5, ['fish', 'high-protein']],
  ['turbot', 'Turbot, cooked', '🐟', 122, 23, 0, 3, ['fish', 'high-protein']], ['red-mullet', 'Red mullet, cooked', '🐟', 120, 21, 0, 4, ['fish', 'high-protein']],
  ['anchovy', 'Anchovies', '🐟', 131, 29, 0, 4, ['fish', 'high-protein']], ['octopus', 'Octopus, cooked', '🐙', 164, 30, 4, 2, ['seafood', 'high-protein']],
  ['crayfish', 'Crayfish', '🦞', 77, 16, 1, 1, ['seafood', 'high-protein']], ['oysters', 'Oysters', '🦪', 68, 7, 4, 2, ['seafood']],
  ['clams', 'Clams', '🦪', 74, 13, 2.5, 1, ['seafood', 'high-protein']], ['lobster', 'Lobster', '🦞', 89, 19, 0, 0.9, ['seafood', 'high-protein']],
];

const rows = [];
for (const [id, name, emoji, kcal, protein, carbs, fat, tags] of SPECIFICS) {
  for (const [variantId, variant] of VARIANTS.slice(0, 6)) {
    rows.push([`catalogue600-${id}-${variantId}`, `${variant} ${name}`, emoji, [kcal, protein, carbs, fat, 2, 1, 2, 0.1], 100, [...tags, variantId], null]);
  }
}
for (const [familyId, familyName, emoji, kcal, protein, carbs, fat, tags] of FAMILIES) {
  for (const [variantId, variant] of VARIANTS.slice(6)) {
    const values = typeof kcal === 'number' ? [kcal, protein, carbs, fat] : familyId === 'veg' ? [30, 2, 6, 0.3] : familyId === 'fruit' ? [55, 1, 14, 0.3] : [120, 8, 20, 1];
    rows.push([`catalogue600-${familyId}-${variantId}`, `${variant} ${familyName}`, emoji, [...values, 3, 2, 1, 0.1], 100, [...tags, variantId], null]);
  }
}
export const CATALOGUE_600_PLUS = rows.map(foodRow);
