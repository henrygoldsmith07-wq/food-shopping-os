import { foodRow } from './food-row.js';

const TYPES = [
  ['produce', 'Produce', '🥦', [32, 2, 7, 0.4], ['veg', 'vegan']],
  ['fruit', 'Fruit', '🍎', [58, 1, 14, 0.3], ['fruit', 'vegan']],
  ['protein', 'Protein', '🍗', [155, 26, 1, 5], ['high-protein']],
  ['seafood', 'Seafood', '🐟', [115, 23, 0, 3], ['fish', 'high-protein']],
  ['grain', 'Grain', '🌾', [340, 10, 68, 3], ['grain']],
  ['pulse', 'Pulse', '🫘', [125, 8, 20, 1], ['vegan', 'plant-protein']],
];
const VARIANTS = [
  ['fresh', 'Fresh'], ['frozen', 'Frozen'], ['tinned', 'Tinned'], ['dried', 'Dried'],
  ['cooked', 'Cooked'], ['roasted', 'Roasted'], ['grilled', 'Grilled'], ['steamed', 'Steamed'],
  ['baked', 'Baked'], ['sliced', 'Sliced'], ['diced', 'Diced'], ['chopped', 'Chopped'],
  ['shredded', 'Shredded'], ['organic', 'Organic'], ['baby', 'Baby'], ['seasonal', 'Seasonal'],
  ['marinated', 'Marinated'], ['smoked', 'Smoked'], ['crumbed', 'Crumbed'], ['ready', 'Ready-to-eat'],
];
const ITEMS = [
  ['artichoke', 'Artichoke', '🌿', [47, 3.3, 11, 0.2], ['veg']], ['chayote', 'Chayote', '🥒', [19, 0.8, 4.5, 0.1], ['veg']],
  ['daikon', 'Daikon radish', '🫜', [18, 0.6, 4.1, 0.1], ['veg']], ['jicama', 'Jicama', '🥔', [38, 0.7, 9, 0.1], ['veg']],
  ['plantain', 'Plantain', '🍌', [122, 1.3, 32, 0.4], ['fruit']], ['guava', 'Guava', '🟢', [68, 2.6, 14, 1], ['fruit', 'high-fibre']],
  ['papaya', 'Papaya', '🧡', [43, 0.5, 11, 0.3], ['fruit']], ['lychee', 'Lychee', '🔴', [66, 0.8, 17, 0.4], ['fruit']],
  ['dragonfruit', 'Dragon fruit', '🐉', [57, 1.2, 13, 0.6], ['fruit', 'high-fibre']], ['nectarine', 'Nectarine', '🍑', [44, 1.1, 11, 0.3], ['fruit']],
  ['bison', 'Bison, cooked', '🥩', [143, 28, 0, 2.4], ['meat', 'high-protein']], ['ostrich', 'Ostrich, cooked', '🐦', [145, 29, 0, 2], ['meat', 'high-protein']],
  ['goat', 'Goat, cooked', '🥩', [143, 27, 0, 3], ['meat', 'high-protein']], ['rabbit', 'Rabbit, cooked', '🐇', [173, 33, 0, 4], ['meat', 'high-protein']],
  ['quail', 'Quail, cooked', '🐦', [234, 25, 0, 14], ['meat', 'high-protein']], ['duck', 'Duck, cooked', '🦆', [201, 23, 0, 12], ['meat']],
  ['herring', 'Herring, cooked', '🐟', [158, 23, 0, 7], ['fish', 'high-protein']], ['swordfish', 'Swordfish, cooked', '🐟', [172, 29, 0, 6], ['fish', 'high-protein']],
  ['mackerel', 'Mackerel, cooked', '🐟', [262, 24, 0, 18], ['fish', 'high-protein']], ['anchovy', 'Anchovy', '🐟', [131, 29, 0, 4], ['fish', 'high-protein']],
  ['squid', 'Squid, cooked', '🦑', [92, 16, 3, 1], ['seafood', 'high-protein']], ['crab', 'Crab meat', '🦀', [97, 19, 0, 1.5], ['seafood', 'high-protein']],
  ['freekeh', 'Freekeh, cooked', '🌾', [120, 4, 25, 0.8], ['grain', 'high-fibre']], ['sorghum', 'Sorghum, cooked', '🌾', [119, 4, 27, 1.2], ['grain']],
  ['amaranth', 'Amaranth, cooked', '🌾', [102, 3.8, 19, 1.6], ['grain']], ['millet', 'Millet, cooked', '🌾', [119, 3.5, 23, 1], ['grain']],
  ['black-eyed-peas', 'Black-eyed peas', '🫘', [116, 7.7, 20, 0.5], ['pulse', 'plant-protein']], ['lupin', 'Lupin beans', '🫘', [119, 16, 10, 3], ['pulse', 'plant-protein']],
  ['pigeon-peas', 'Pigeon peas', '🫘', [121, 7, 23, 0.4], ['pulse', 'plant-protein']], ['navy-beans', 'Navy beans', '🫘', [140, 9.7, 26, 0.6], ['pulse', 'plant-protein']],
  ['sesame', 'Sesame seeds', '🌱', [573, 18, 23, 50], ['seeds']], ['hemp', 'Hemp seeds', '🌱', [553, 32, 9, 49], ['seeds', 'high-protein']],
  ['flax', 'Flaxseed', '🌱', [534, 18, 29, 42], ['seeds', 'high-fibre']], ['pistachio', 'Pistachios', '🥜', [562, 20, 28, 45], ['nuts']],
];

const rows = [];
for (const [id, name, emoji, values, tags] of ITEMS) {
  for (const [variantId, variant] of VARIANTS) {
    rows.push([`catalogue-double-${id}-${variantId}`, `${variant} ${name}`, emoji, [...values, 3, 2, 2, 0.1], 100, [...tags, variantId], null]);
  }
}
for (const [typeId, typeName, emoji, values, tags] of TYPES) {
  for (let index = 0; index < 12; index += 1) {
    const variant = VARIANTS[(index + typeId.length) % VARIANTS.length];
    rows.push([`catalogue-double-${typeId}-${index}`, `${variant[1]} ${typeName} ${index + 1}`, emoji, [...values, 3, 2, 2, 0.1], 100, [...tags, variant[0]], null]);
  }
}

export const CATALOGUE_DOUBLE = rows.map(foodRow);
