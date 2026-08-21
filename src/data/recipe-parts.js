/**
 * Recipe building blocks.
 *
 * Every component carries its own per-100 g nutrition and a rough price, so a
 * generated recipe's calories, macros and cost are *computed* from what is
 * actually in it rather than made up per recipe. Figures are rounded reference
 * values for UK supermarket ingredients; prices are estimates that the app
 * only ever uses for planning, never as a claim about what you paid.
 *
 *   part(name, grams per serving, [kcal, protein, carbs, fat, fibre] /100 g,
 *        £ per 100 g, tags)
 */

const part = (name, grams, [kcal, protein, carbs, fat, fibre], price, tags = []) =>
  ({ name, grams, per100: { kcal, protein, carbs, fat, fibre }, price, tags });

/* ---------- Proteins ---------- */

export const PROTEINS = {
  chicken: part('Chicken breast', 150, [165, 31, 0, 3.6, 0], 0.75, ['meat', 'poultry']),
  thigh: part('Chicken thighs', 160, [209, 26, 0, 11, 0], 0.55, ['meat', 'poultry']),
  turkey: part('Turkey mince', 140, [150, 27, 0, 4.2, 0], 0.85, ['meat', 'poultry']),
  beef: part('Beef mince', 140, [217, 26, 0, 12, 0], 0.85, ['meat', 'red-meat']),
  lamb: part('Lamb steak', 140, [258, 25, 0, 17, 0], 1.4, ['meat', 'red-meat']),
  pork: part('Pork loin', 150, [198, 27, 0, 9.6, 0], 0.7, ['meat']),
  salmon: part('Salmon fillet', 130, [208, 20, 0, 13, 0], 2.2, ['fish']),
  cod: part('Cod fillet', 140, [82, 18, 0, 0.7, 0], 1.9, ['fish']),
  prawns: part('King prawns', 120, [99, 24, 0.2, 0.3, 0], 2.4, ['fish', 'seafood']),
  tuna: part('Tuna steak', 130, [132, 28, 0, 1.3, 0], 2.1, ['fish']),
  tofu: part('Firm tofu', 140, [144, 15, 3, 8, 2], 0.6, ['plant']),
  tempeh: part('Tempeh', 120, [193, 19, 9, 11, 5], 1.2, ['plant']),
  chickpeas: part('Chickpeas', 150, [119, 7.2, 16, 2.6, 6], 0.25, ['plant', 'pulse']),
  blackbeans: part('Black beans', 150, [132, 8.9, 24, 0.5, 8.7], 0.25, ['plant', 'pulse']),
  lentils: part('Lentils', 150, [116, 9, 20, 0.4, 8], 0.22, ['plant', 'pulse']),
  butterbeans: part('Butter beans', 150, [110, 7, 17, 0.5, 6], 0.24, ['plant', 'pulse']),
  halloumi: part('Halloumi', 90, [321, 22, 2.6, 25, 0], 1.5, ['dairy']),
  feta: part('Feta', 60, [264, 14, 4, 21, 0], 1.3, ['dairy']),
  eggs: part('Eggs', 120, [143, 13, 0.7, 9.5, 0], 0.45, ['egg']),
  paneer: part('Paneer', 100, [296, 18, 3.6, 23, 0], 1.4, ['dairy']),
};

/* ---------- Bases and carbohydrates ---------- */

export const BASES = {
  rice: part('White rice', 180, [130, 2.7, 28, 0.3, 0.4], 0.12, ['grain']),
  brown: part('Brown rice', 180, [123, 2.7, 26, 1, 1.8], 0.16, ['grain', 'wholegrain']),
  quinoa: part('Quinoa', 160, [120, 4.4, 21, 1.9, 2.8], 0.5, ['grain', 'wholegrain', 'gf']),
  couscous: part('Couscous', 160, [112, 3.8, 23, 0.2, 1.4], 0.22, ['grain']),
  bulgur: part('Bulgur wheat', 160, [83, 3.1, 19, 0.2, 4.5], 0.25, ['grain', 'wholegrain']),
  pasta: part('Pasta', 190, [158, 6, 31, 0.9, 1.8], 0.15, ['grain']),
  noodles: part('Egg noodles', 180, [138, 4.5, 25, 2.1, 1.2], 0.3, ['grain', 'egg']),
  ricenoodles: part('Rice noodles', 180, [109, 1.8, 25, 0.2, 0.9], 0.35, ['grain', 'gf']),
  potato: part('Potatoes', 200, [87, 1.9, 20, 0.1, 1.8], 0.11, ['veg', 'gf']),
  sweetpotato: part('Sweet potato', 200, [90, 2, 21, 0.2, 3.3], 0.18, ['veg', 'gf']),
  flatbread: part('Flatbread', 90, [280, 8.5, 50, 4.5, 3], 0.5, ['bread']),
  tortilla: part('Tortilla wraps', 120, [297, 8, 49, 7, 3], 0.45, ['bread']),
  sourdough: part('Sourdough', 90, [253, 9, 48, 1.8, 3.4], 0.45, ['bread']),
  polenta: part('Polenta', 180, [85, 2, 18, 0.4, 1, ], 0.2, ['grain', 'gf']),
};

/* ---------- Vegetables ---------- */

export const VEG = {
  broccoli: part('Broccoli', 90, [35, 2.4, 7, 0.4, 3.3], 0.28, ['veg', 'green']),
  spinach: part('Spinach', 80, [23, 2.9, 3.6, 0.4, 2.2], 0.6, ['veg', 'green']),
  kale: part('Kale', 80, [35, 2.9, 4.4, 1.5, 4.1], 0.4, ['veg', 'green']),
  courgette: part('Courgette', 100, [17, 1.2, 3.1, 0.3, 1], 0.25, ['veg']),
  peppers: part('Peppers', 100, [31, 1, 6, 0.3, 2.1], 0.35, ['veg']),
  mushrooms: part('Chestnut mushrooms', 100, [22, 3.1, 3.3, 0.3, 1], 0.4, ['veg']),
  aubergine: part('Aubergine', 110, [25, 1, 6, 0.2, 3], 0.3, ['veg']),
  tomatoes: part('Cherry tomatoes', 100, [18, 0.9, 3.9, 0.2, 1.2], 0.4, ['veg']),
  peas: part('Garden peas', 90, [81, 5.4, 14, 0.4, 5.1], 0.2, ['veg', 'green']),
  greenbeans: part('Green beans', 90, [31, 1.8, 7, 0.2, 3.4], 0.35, ['veg', 'green']),
  carrots: part('Carrots', 100, [41, 0.9, 10, 0.2, 2.8], 0.12, ['veg']),
  cauliflower: part('Cauliflower', 110, [25, 1.9, 5, 0.3, 2], 0.22, ['veg']),
  leek: part('Leeks', 100, [61, 1.5, 14, 0.3, 1.8], 0.25, ['veg']),
  butternut: part('Butternut squash', 150, [45, 1, 12, 0.1, 2], 0.2, ['veg']),
  asparagus: part('Asparagus', 90, [20, 2.2, 3.9, 0.1, 2.1], 1.1, ['veg', 'green']),
  cabbage: part('Red cabbage', 90, [31, 1.4, 7, 0.2, 2.1], 0.15, ['veg']),
};

/* ---------- Sauces, dressings and finishers ---------- */

export const SAUCES = {
  tomato: part('Tomato & basil sauce', 120, [56, 1.6, 8, 1.8, 1.5], 0.25, ['sauce']),
  coconut: part('Coconut milk', 100, [197, 2, 3, 20, 0], 0.4, ['sauce']),
  korma: part('Korma sauce', 100, [148, 2.4, 9, 11, 1.4], 0.45, ['sauce', 'dairy']),
  tikka: part('Tikka masala sauce', 100, [113, 2, 9.5, 7, 1.2], 0.42, ['sauce', 'dairy']),
  katsu: part('Katsu curry sauce', 110, [95, 1.6, 12, 4.4, 1.1], 0.5, ['sauce']),
  teriyaki: part('Teriyaki glaze', 35, [180, 3, 40, 0.1, 0], 0.9, ['sauce']),
  pesto: part('Pesto', 35, [431, 5, 5, 43, 2], 1.6, ['sauce', 'dairy']),
  harissa: part('Harissa', 25, [120, 3, 12, 6, 4], 1.2, ['sauce']),
  satay: part('Satay sauce', 45, [370, 13, 16, 29, 4], 1.1, ['sauce', 'nuts']),
  chimichurri: part('Chimichurri', 30, [280, 1, 3, 30, 1], 1.4, ['sauce']),
  yogurt: part('Herby yogurt', 60, [61, 5.3, 4.7, 2.6, 0], 0.35, ['sauce', 'dairy']),
  tahini: part('Tahini dressing', 30, [420, 13, 12, 38, 6], 1.3, ['sauce']),
  soy: part('Soy & ginger', 30, [70, 6, 8, 0.2, 0.5], 0.7, ['sauce']),
  blackbean: part('Black bean sauce', 60, [90, 3, 14, 2, 1.5], 0.5, ['sauce']),
  lemonherb: part('Lemon & herb butter', 20, [640, 0.8, 1, 70, 0], 1.1, ['sauce', 'dairy']),
  salsa: part('Tomato salsa', 60, [36, 1.3, 7, 0.3, 1.5], 0.5, ['sauce']),
  gravy: part('Red wine gravy', 80, [45, 1, 6, 1.5, 0.3], 0.3, ['sauce']),
  peri: part('Peri-peri marinade', 25, [110, 1.5, 9, 7, 1], 0.9, ['sauce']),
};

/* ---------- Breakfast components ---------- */

export const BREAKFAST_BASES = {
  oats: part('Porridge oats', 60, [379, 11, 60, 8, 9], 0.18, ['grain']),
  yogurt: part('Greek yogurt', 170, [57, 10, 4, 0.4, 0], 0.42, ['dairy']),
  coconutyog: part('Coconut yogurt', 170, [97, 1.4, 6, 7.5, 0.4], 0.75, ['plant']),
  eggs: part('Eggs', 120, [143, 13, 0.7, 9.5, 0], 0.45, ['egg']),
  toast: part('Wholemeal toast', 72, [247, 10, 41, 3.4, 6.5], 0.22, ['bread']),
  bagel: part('Bagel', 85, [275, 11, 53, 1.7, 2.3], 0.4, ['bread']),
  granola: part('Granola', 55, [471, 10, 61, 20, 7], 0.55, ['grain']),
  pancakes: part('Protein pancake mix', 80, [340, 24, 45, 6, 4], 0.9, ['grain', 'dairy']),
  smoothie: part('Milk & oats blend', 250, [78, 4.2, 11, 2, 1.2], 0.2, ['dairy']),
  crumpets: part('Crumpets', 90, [178, 5.7, 36, 0.9, 2], 0.3, ['bread']),
  shakshuka: part('Spiced tomato base', 200, [48, 1.6, 7, 1.6, 1.8], 0.3, ['veg']),
};

export const FRUITS = {
  berries: part('Mixed berries', 80, [45, 0.8, 9, 0.3, 2.6], 0.9, ['fruit']),
  banana: part('Banana', 100, [89, 1.1, 23, 0.3, 2.6], 0.14, ['fruit']),
  apple: part('Apple', 100, [52, 0.3, 14, 0.2, 2.4], 0.2, ['fruit']),
  pear: part('Pear', 110, [57, 0.4, 15, 0.1, 3.1], 0.25, ['fruit']),
  peach: part('Peach', 110, [39, 0.9, 10, 0.3, 1.5], 0.35, ['fruit']),
  mango: part('Mango', 100, [60, 0.8, 15, 0.4, 1.6], 0.4, ['fruit']),
  cherry: part('Cherries', 90, [63, 1.1, 16, 0.2, 2.1], 0.8, ['fruit']),
  fig: part('Figs', 80, [74, 0.8, 19, 0.3, 2.9], 1.1, ['fruit']),
  rhubarb: part('Roasted rhubarb', 90, [21, 0.9, 4.5, 0.2, 1.8], 0.5, ['fruit']),
  plum: part('Plums', 100, [46, 0.7, 11, 0.3, 1.4], 0.4, ['fruit']),
};

export const TOPPINGS = {
  peanut: part('Peanut butter', 20, [598, 25, 20, 50, 6], 0.5, ['nuts']),
  almond: part('Toasted almonds', 20, [579, 21, 22, 50, 12.5], 1.1, ['nuts']),
  walnut: part('Walnuts', 20, [654, 15, 14, 65, 6.7], 1.3, ['nuts']),
  seeds: part('Mixed seeds', 15, [559, 20, 18, 46, 9], 0.9, ['seeds']),
  chia: part('Chia seeds', 15, [486, 17, 42, 31, 34], 1.2, ['seeds']),
  honey: part('Honey', 15, [304, 0.3, 82, 0, 0.2], 0.6, ['sweet', 'honey']),
  maple: part('Maple syrup', 15, [260, 0, 67, 0.1, 0], 1.1, ['sweet']),
  choc: part('Dark chocolate', 15, [598, 7.8, 46, 43, 11], 1.2, ['sweet']),
  coconutflakes: part('Coconut flakes', 12, [660, 6.9, 24, 64, 16], 1.0, ['nuts']),
  protein: part('Whey protein', 25, [380, 76, 8, 5, 0], 1.6, ['supplement', 'dairy']),
  cinnamon: part('Cinnamon', 3, [247, 4, 81, 1.2, 53], 2.0, ['spice']),
  nutbutter: part('Almond butter', 20, [614, 21, 19, 56, 10], 1.4, ['nuts']),
};

/* ---------- Small extras that give a dish its character ---------- */

export const EXTRAS = {
  oil: part('Olive oil', 10, [884, 0, 0, 100, 0], 0.65, ['fat']),
  garlic: part('Garlic', 8, [149, 6.4, 33, 0.5, 2.1], 0.8, ['aromatic']),
  onion: part('Onion', 60, [40, 1.1, 9, 0.1, 1.7], 0.12, ['aromatic']),
  ginger: part('Ginger', 8, [80, 1.8, 18, 0.8, 2], 1.2, ['aromatic']),
  chilli: part('Red chilli', 8, [40, 1.9, 9, 0.4, 1.5], 1.5, ['aromatic']),
  herbs: part('Fresh herbs', 8, [40, 3, 6, 0.6, 3], 3.0, ['aromatic']),
  lemon: part('Lemon', 20, [29, 1.1, 9, 0.3, 2.8], 0.35, ['aromatic']),
  parmesan: part('Parmesan', 15, [431, 38, 4.1, 29, 0], 1.6, ['dairy']),
  yoghurtdrizzle: part('Yogurt', 40, [57, 10, 4, 0.4, 0], 0.42, ['dairy']),
  stock: part('Vegetable stock', 150, [4, 0.3, 0.5, 0.1, 0], 0.03, ['liquid']),
  milk: part('Semi-skimmed milk', 150, [50, 3.6, 4.8, 1.8, 0], 0.09, ['dairy']),
  oatmilk: part('Oat milk', 150, [46, 0.3, 6.7, 1.5, 0.8], 0.13, ['plant-milk']),
};

/**
 * Every component in one place, so anything that needs the nutrition behind an
 * ingredient name — substitutions, the recipe generator — can look it up.
 */
export const ALL_PARTS = [
  ...Object.values(PROTEINS), ...Object.values(BASES), ...Object.values(VEG),
  ...Object.values(SAUCES), ...Object.values(BREAKFAST_BASES), ...Object.values(FRUITS),
  ...Object.values(TOPPINGS), ...Object.values(EXTRAS),
].filter((p, i, all) => all.findIndex((q) => q.name === p.name) === i);

export const partByName = (name) => {
  const key = String(name || '').trim().toLowerCase();
  return ALL_PARTS.find((p) => p.name.toLowerCase() === key) || null;
};
