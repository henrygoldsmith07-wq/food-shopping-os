/**
 * Estimated nutrition and ingredients for discovery recipe shells.
 *
 * The recipe book's principle (see `recipe-gen.js`) is that nutrition is
 * *computed* from what a dish actually contains — never invented per recipe.
 * The discovery shells carry names and metadata, and this module fills in
 * their missing half the same way the generator does: by composing a plausible
 * dish from the shared building blocks in `recipe-parts.js` and deriving
 * calories, macros, cost, steps and the health/planet/protein scores from
 * those parts. `nutritionStatus` on the shells stays honest about it.
 *
 * Matching is keyword-based and deliberately rough — these are discovery
 * estimates for planning and ranking, not lab figures. Anything the keywords
 * cannot identify falls back to a balanced plate rather than to zeros.
 */

import { compose, scores } from './recipe-gen.js';
import {
  PROTEINS, BASES, VEG, SAUCES, BREAKFAST_BASES, FRUITS, TOPPINGS, EXTRAS,
} from './recipe-parts.js';

/* Parts only the estimator needs, declared in the same shape as recipe-parts. */
const local = (name, grams, [kcal, protein, carbs, fat, fibre = 0], price, tags = []) =>
  ({ name, grams, per100: { kcal, protein, carbs, fat, fibre }, price, tags });

const STEAK = local('Beef steak', 200, [271, 26, 0, 18, 0], 1.8, ['meat', 'red-meat']);
const SAUSAGES = local('Sausages', 120, [301, 12, 2, 27, 0], 0.8, ['meat']);
const BACON = local('Bacon', 90, [246, 13, 0, 21, 0], 1.0, ['meat']);
const BURGER = local('Beef burger', 170, [295, 17, 24, 15, 1], 1.1, ['meat', 'red-meat']);
const MEATBALLS = local('Beef meatballs', 150, [248, 20, 6, 16, 0.5], 1.0, ['meat', 'red-meat']);
const CHICKEN_WINGS = local('Chicken wings', 200, [290, 27, 0, 20, 0], 0.7, ['meat', 'poultry']);
const DUCK = local('Duck breast', 160, [337, 19, 0, 28, 0], 2.0, ['meat']);
const HADDOCK = local('Haddock fillet', 140, [90, 20, 0, 0.6, 0], 1.6, ['fish']);
const MACKEREL = local('Mackerel fillet', 130, [262, 19, 0, 21, 0], 1.2, ['fish']);
const SARDINES = local('Sardines', 100, [208, 25, 0, 11, 0], 0.9, ['fish']);
const FALAFEL = local('Falafel', 120, [333, 13, 32, 18, 5], 0.7, ['plant', 'pulse']);
const JACKFRUIT = local('Jackfruit', 150, [95, 1.2, 23, 0.6, 2.6], 0.9, ['plant']);
const SEITAN = local('Seitan', 130, [370, 75, 14, 1.9, 1.2], 1.4, ['plant']);
const CHEESE = local('Cheddar', 40, [402, 25, 0, 33, 0], 0.9, ['dairy']);
const CHIPS = local('Oven chips', 160, [312, 3.5, 41, 15, 3], 0.3, ['veg', 'gf']);
const BUN = local('Burger bun', 120, [290, 9, 50, 4, 2], 0.35, ['bread']);
const PASTRY = local('Puff pastry', 120, [551, 7, 45, 38, 2], 0.6, ['baking']);
const ICE_CREAM = local('Ice cream', 120, [207, 3.5, 24, 11, 0], 0.5, ['dessert', 'dairy']);
const SPONGE = local('Sponge cake', 120, [410, 5, 50, 20, 1], 0.4, ['dessert']);
const CHEESECAKE = local('Baked cheesecake', 130, [320, 6, 25, 21, 0], 0.7, ['dessert', 'dairy']);
const CRUMBLE = local('Crumble topping', 90, [380, 4, 55, 16, 3], 0.4, ['dessert']);
const BROWNIE = local('Chocolate brownie', 90, [466, 6, 55, 25, 2], 0.5, ['dessert']);
const COOKIE = local('Cookie', 70, [480, 5, 64, 22, 2], 0.4, ['dessert']);
const SCONE = local('Scone', 80, [340, 7, 45, 14, 1.5], 0.35, ['dessert']);
const FLAPJACK = local('Flapjack', 80, [430, 6, 60, 18, 3], 0.35, ['dessert']);
const TART = local('Shortcrust tart', 120, [390, 5, 45, 20, 1.5], 0.5, ['dessert']);
const MOUSSE = local('Chocolate mousse', 90, [250, 4, 22, 16, 0.5], 0.5, ['dessert', 'dairy']);
const CORONATION_SAUCE = local('Coronation sauce', 60, [290, 8, 4, 26, 0], 0.8, ['sauce', 'dairy']);
const VEGAN_SAUSAGES = local('Vegan sausages', 120, [172, 16, 7, 9, 3], 0.9, ['plant']);

const wordsOf = (name) => name.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);

const singular = (word) => (word.endsWith('s') ? word.slice(0, -1) : word);

const firstMatch = (words, mappings) => {
  for (const [word, part] of mappings) {
    if (words.some((w) => w === word || singular(w) === word)) return part;
  }
  return null;
};

const PROTEIN_MAP = [
  ['chicken', PROTEINS.chicken], ['thigh', PROTEINS.thigh], ['turkey', PROTEINS.turkey],
  ['steak', STEAK], ['beef', PROTEINS.beef], ['burger', BURGER], ['meatball', MEATBALLS],
  ['lamb', PROTEINS.lamb], ['sausage', SAUSAGES], ['bacon', BACON], ['pork', PROTEINS.pork],
  ['duck', DUCK], ['wing', CHICKEN_WINGS],
  ['salmon', PROTEINS.salmon], ['cod', PROTEINS.cod], ['haddock', HADDOCK],
  ['tuna', PROTEINS.tuna], ['prawn', PROTEINS.prawns], ['mackerel', MACKEREL],
  ['sardine', SARDINES], ['squid', PROTEINS.prawns], ['crab', PROTEINS.prawns], ['lobster', PROTEINS.prawns],
  ['tofu', PROTEINS.tofu], ['tempeh', PROTEINS.tempeh], ['seitan', SEITAN], ['jackfruit', JACKFRUIT],
  ['paneer', PROTEINS.paneer], ['halloumi', PROTEINS.halloumi], ['feta', PROTEINS.feta],
  ['cheese', CHEESE], ['egg', PROTEINS.eggs], ['falafel', FALAFEL],
  ['bean', PROTEINS.blackbeans], ['chickpea', PROTEINS.chickpeas], ['lentil', PROTEINS.lentils],
  ['bhaji', PROTEINS.chickpeas], ['pakora', PROTEINS.chickpeas],
];

const BASE_MAP = [
  ['rice', BASES.rice], ['biryani', BASES.rice], ['pilau', BASES.rice], ['sushi', BASES.rice],
  ['risotto', BASES.rice], ['paella', BASES.rice], ['noodle', BASES.noodles], ['ramen', BASES.noodles],
  ['udon', BASES.noodles], ['soba', BASES.noodles], ['chow', BASES.noodles],
  ['pasta', BASES.pasta], ['spaghetti', BASES.pasta], ['linguine', BASES.pasta],
  ['tagliatelle', BASES.pasta], ['lasagne', BASES.pasta], ['macaroni', BASES.pasta], ['mac', BASES.pasta],
  ['orzo', BASES.pasta], ['noodles', BASES.noodles],
  ['chips', CHIPS], ['fries', CHIPS], ['potato', BASES.potato], ['potatoes', BASES.potato],
  ['couscous', BASES.couscous], ['quinoa', BASES.quinoa], ['bulgur', BASES.bulgur],
  ['polenta', BASES.polenta], ['wrap', BASES.tortilla], ['tortilla', BASES.tortilla],
  ['flatbread', BASES.flatbread], ['naan', BASES.flatbread], ['bread', BASES.sourdough],
  ['toast', BREAKFAST_BASES.toast], ['bagel', BREAKFAST_BASES.bagel], ['crumpet', BREAKFAST_BASES.crumpets],
  ['oats', BREAKFAST_BASES.oats], ['porridge', BREAKFAST_BASES.oats], ['granola', BREAKFAST_BASES.granola],
  ['muesli', BREAKFAST_BASES.granola], ['pancake', BREAKFAST_BASES.pancakes], ['crepe', BREAKFAST_BASES.pancakes],
  ['bun', BUN], ['bap', BUN], ['pastry', PASTRY], ['pie', PASTRY], ['pasty', PASTRY],
];

const VEG_MAP = [
  ['broccoli', VEG.broccoli], ['spinach', VEG.spinach], ['kale', VEG.kale],
  ['mushroom', VEG.mushrooms], ['cauliflower', VEG.cauliflower], ['leek', VEG.leek],
  ['pepper', VEG.peppers], ['courgette', VEG.courgette], ['aubergine', VEG.aubergine],
  ['tomato', VEG.tomatoes], ['carrot', VEG.carrots], ['pea', VEG.peas],
  ['squash', VEG.butternut], ['cabbage', VEG.cabbage], ['asparagus', VEG.asparagus],
  ['avocado', local('Avocado', 80, [160, 2, 9, 15, 7], 1.0, ['veg'])],
  ['vegetable', VEG.peppers], ['salad', VEG.spinach], ['greens', VEG.greenbeans], ['saag', VEG.spinach],
];

const SAUCE_MAP = [
  ['katsu', SAUCES.katsu], ['tikka', SAUCES.tikka], ['masala', SAUCES.tikka],
  ['korma', SAUCES.korma], ['massaman', SAUCES.korma], ['panang', SAUCES.korma], ['makhani', SAUCES.korma],
  ['curry', SAUCES.tikka], ['jalfrezi', SAUCES.tikka], ['madras', SAUCES.tikka], ['vindaloo', SAUCES.tikka],
  ['dhansak', SAUCES.tikka], ['balti', SAUCES.tikka], ['rogan', SAUCES.tikka],
  ['teriyaki', SAUCES.teriyaki], ['pesto', SAUCES.pesto], ['satay', SAUCES.satay],
  ['peri', SAUCES.peri], ['chimichurri', SAUCES.chimichurri], ['tahini', SAUCES.tahini],
  ['harissa', SAUCES.harissa], ['salsa', SAUCES.salsa], ['gravy', SAUCES.gravy],
  ['black', SAUCES.blackbean], ['soy', SAUCES.soy], ['gochujang', SAUCES.soy],
  ['carbonara', local('Carbonara sauce', 80, [220, 9, 6, 18, 0], 0.9, ['sauce', 'dairy'])],
  ['alfredo', local('Alfredo sauce', 80, [210, 8, 5, 18, 0], 0.9, ['sauce', 'dairy'])],
  ['cacio', local('Pecorino sauce', 60, [280, 13, 3, 24, 0], 1.2, ['sauce', 'dairy'])],
  ['bolognese', local('Bolognese ragu', 130, [98, 8, 6, 5, 1.2], 0.5, ['sauce'])],
  ['ragu', local('Bolognese ragu', 130, [98, 8, 6, 5, 1.2], 0.5, ['sauce'])],
  ['tomato', SAUCES.tomato], ['marinara', SAUCES.tomato], ['arrabbiata', SAUCES.tomato],
  ['napolitana', SAUCES.tomato], ['puttanesca', SAUCES.tomato], ['amatriciana', SAUCES.tomato],
  ['honey', TOPPINGS.honey], ['bbq', local('BBQ sauce', 50, [170, 0.6, 39, 0.8, 0.3], 0.5, ['sauce'])],
  ['buffalo', local('Buffalo sauce', 40, [210, 1.5, 3, 21, 0], 0.7, ['sauce'])],
  ['sweet', local('Sweet & sour sauce', 70, [130, 1, 30, 1, 0.5], 0.5, ['sauce'])],
  ['coronation', CORONATION_SAUCE], ['hummus', local('Hummus', 70, [232, 8, 18, 15, 6], 0.6, ['sauce'])],
  ['pad', local('Pad Thai sauce', 60, [190, 4, 32, 5, 1], 0.7, ['sauce'])],
  ['ramen', local('Ramen broth', 300, [35, 2, 4, 1, 0.3], 0.2, ['sauce'])],
  ['miso', local('Miso broth', 300, [25, 2, 3, 0.7, 0.4], 0.2, ['sauce'])],
  ['soup', local('Soup base', 300, [38, 1.6, 6, 1, 1.2], 0.2, ['sauce'])],
  ['broth', local('Soup base', 300, [38, 1.6, 6, 1, 1.2], 0.2, ['sauce'])],
  ['chowder', local('Chowder base', 300, [68, 3, 8, 3, 0.8], 0.35, ['sauce', 'dairy'])],
  ['stew', local('Rich stew base', 200, [72, 4, 8, 2.8, 1.5], 0.3, ['sauce'])],
  ['casserole', local('Rich stew base', 200, [72, 4, 8, 2.8, 1.5], 0.3, ['sauce'])],
  ['kung', SAUCES.soy], ['teriyaki-glaze', SAUCES.teriyaki],
];

const DESSERT_MAP = [
  ['ice', ICE_CREAM], ['sundae', ICE_CREAM], ['affogato', ICE_CREAM], ['gelato', ICE_CREAM],
  ['cake', SPONGE], ['fondant', SPONGE], ['trifle', SPONGE], ['baklava', SPONGE], ['delight', SPONGE],
  ['cheesecake', CHEESECAKE], ['crumble', CRUMBLE], ['brownie', BROWNIE], ['blondie', BROWNIE],
  ['cookie', COOKIE], ['biscuit', COOKIE], ['scone', SCONE], ['flapjack', FLAPJACK],
  ['tart', TART], ['pie', TART], ['mousse', MOUSSE], ['panna', local('Panna cotta', 120, [210, 3, 20, 13, 0], 0.5, ['dessert', 'dairy'])],
  ['doughnut', local('Doughnut', 90, [452, 6, 51, 25, 1.4], 0.45, ['dessert'])], ['donut', local('Doughnut', 90, [452, 6, 51, 25, 1.4], 0.45, ['dessert'])],
  ['milkshake', ICE_CREAM], ['waffle', local('Waffle', 110, [291, 7, 33, 14, 1.6], 0.4, ['dessert'])],
];

const isDessert = (words) => DESSERT_MAP.some(([word]) => words.includes(word))
  || words.some((w) => ['pudding', 'sundae', 'mess', 'jelly', 'brittle'].includes(w));

/* ---------- Assembly ---------- */

const CORE_DESSERT = (words) => {
  const base = firstMatch(words, DESSERT_MAP) || SPONGE;
  const fruit = firstMatch(words, [
    ['apple', FRUITS.apple], ['banana', FRUITS.banana], ['berry', FRUITS.berries],
    ['cherry', FRUITS.cherry], ['lemon', FRUITS.apple], ['pumpkin', VEG.butternut],
    ['pecan', TOPPINGS.walnut], ['rhubarb', FRUITS.rhubarb], ['mango', FRUITS.mango],
    ['plum', FRUITS.plum], ['pear', FRUITS.pear], ['peach', FRUITS.peach], ['fig', FRUITS.fig],
  ]);
  return [base, ...(fruit ? [fruit] : []), TOPPINGS.honey, EXTRAS.milk];
};

const assemble = (name) => {
  const words = wordsOf(name);
  const fried = words.some((w) => ['fried', 'fry', 'katsu', 'schnitzel', 'tempura', 'bhaji', 'goujon', 'crispy'].includes(w));
  const roasted = words.some((w) => ['roast', 'baked', 'traybake', 'oven', 'grilled', 'air'].includes(w));
  const word = (list) => words.some((w) => list.includes(w));

  if (isDessert(words)) {
    return { parts: CORE_DESSERT(words), steps: dessertSteps(words) };
  }

  let protein = firstMatch(words, PROTEIN_MAP);
  /* 'Vegan sausages' names a plant product, not a meat one. */
  const wantsPlant = words.includes('vegan');
  if (wantsPlant && protein && protein.tags.some((t) => ['meat', 'poultry', 'fish', 'seafood'].includes(t))) {
    protein = words.includes('sausage') ? VEGAN_SAUSAGES : PROTEINS.tofu;
  }
  const base = firstMatch(words, BASE_MAP);
  const veg = firstMatch(words, VEG_MAP);
  const sauce = firstMatch(words, SAUCE_MAP);
  const parts = [
    ...(protein ? [protein] : []),
    ...(base ? [base] : []),
    ...(veg ? [veg] : []),
    ...(sauce ? [sauce] : []),
    ...(word(['soup', 'broth', 'stew', 'curry', 'chowder', 'chilli']) && !sauce ? [local('Rich stew base', 200, [72, 4, 8, 2.8, 1.5], 0.3, ['sauce'])] : []),
    ...(fried ? [EXTRAS.oil] : []),
    ...(roasted ? [EXTRAS.oil] : []),
    EXTRAS.onion,
    ...(word(['garlic', 'kung', 'chilli', 'linguine', 'prawn']) ? [EXTRAS.garlic] : []),
    ...(word(['burger', 'wrap', 'taco', 'burrito', 'sandwich', 'bagel', 'toast', 'bun']) && !base ? [BASES.sourdough] : []),
  ];
  /* Fallbacks stay plant-based so an unmatched dish is never given meat it
     never named — diet tags are read off the ingredients, after all. */
  if (parts.length < 2) parts.push(base || BREAKFAST_BASES.toast);
  if (parts.length < 3) parts.push(veg || VEG.broccoli);
  if (parts.length < 3) parts.push(BASES.rice);
  return { parts, steps: dishSteps(words, { fried, roasted }) };
};

function dessertSteps(words) {
  const baked = words.some((w) => ['cake', 'tart', 'pie', 'crumble', 'brownie', 'cookie', 'scone', 'flapjack', 'cheesecake', 'blondie', 'bread'].includes(w));
  return [
    { text: 'Weigh out the ingredients and prepare the tin or dishes.' },
    { text: baked ? 'Bake until just set and golden, then cool on a rack.' : 'Chill until thickened and serving-cold.' },
    { text: 'Finish with the honey and milk components and serve.' },
  ];
}

function dishSteps(words, { fried, roasted }) {
  const simmered = words.some((w) => ['soup', 'broth', 'stew', 'curry', 'casserole', 'chilli', 'ragu', 'bolognese', 'congee'].includes(w));
  const cook = fried
    ? 'Fry in a hot pan, turning once, until golden and cooked through.'
    : roasted
      ? 'Roast or grill until browned at the edges and cooked through.'
      : simmered
        ? 'Simmer gently until everything is tender and the sauce has body.'
        : 'Cook through over a medium heat, seasoning as you go.';
  return [
    { text: 'Prep the vegetables and measure everything out.' },
    { text: cook },
    { text: 'Rest briefly, plate up and serve while hot.' },
  ];
}

/* Keep every estimate inside the same plausible band the tests guard. */
const trim = (parts) => {
  if (compose(parts).kcal < 120) parts.push(BASES.sourdough);
  if (compose(parts).kcal < 120) parts.push(EXTRAS.milk);
  while (compose(parts).kcal > 1150 && parts.length > 3) {
    let idx = -1;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (parts[i].tags.includes('sauce') || parts[i].tags.includes('fat')) { idx = i; break; }
    }
    parts.splice(idx >= 0 ? idx : parts.length - 1, 1);
  }
  return parts;
};

/* Diet tags read off the parts, the same rules recipe-gen applies. */
const dietTagsOf = (parts) => {
  const animal = ['meat', 'red-meat', 'poultry', 'fish', 'seafood'];
  const anyAnimal = parts.some((p) => p.tags.some((t) => animal.includes(t)));
  const anyAnimalProduct = parts.some((p) => p.tags.some((t) => ['dairy', 'egg', 'honey'].includes(t)));
  if (!anyAnimal && !anyAnimalProduct) return ['vegan', 'vegetarian'];
  if (!anyAnimal) return ['vegetarian'];
  return [];
};

/**
 * Estimate a dish from its name: per-serving nutrition, cost, ingredients,
 * steps and the three derived scores — all computed from the composed parts,
 * never asserted per dish. `dietTags` recomputes vegan/vegetarian from those
 * same parts so a keyword-guessed tag can never contradict the ingredients.
 */
export const estimateRecipe = (name) => {
  const { parts: raw, steps } = assemble(name);
  const parts = trim([...raw]);
  const n = compose(parts, 4);
  return {
    ...n,
    ...scores(parts, n),
    dietTags: dietTagsOf(parts),
    steps,
  };
};
