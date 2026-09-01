import { compose, } from './recipe-gen.js';
import { PROTEINS, BASES, VEG, SAUCES, BREAKFAST_BASES, FRUITS, TOPPINGS, EXTRAS } from './recipe-parts.js';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const title = (text) => text.replace(/\b\w/g, (c) => c.toUpperCase());
const veganSafe = (parts) => parts.filter(Boolean).every((part) => !part.tags.some((tag) => ['dairy', 'egg', 'meat', 'fish', 'seafood'].includes(tag)));
const entries = [];
const add = (id, name, emoji, meal, cuisine, tags, parts, time = 25, servings = 2) => {
  const nutrition = compose(parts, servings);
  entries.push({
    id: `generated-${id}`, name, emoji, meal, cuisine,
    tags: [...new Set(tags)], time, prep: Math.min(15, time), difficulty: time > 40 ? 'Medium' : 'Easy', servings,
    ...nutrition,
    healthScore: Math.max(45, Math.min(98, 70 + (nutrition.fibre * 2) + (nutrition.protein > 25 ? 12 : 0))),
    proteinScore: Math.max(20, Math.min(99, Math.round(nutrition.protein * 2.5))),
    envScore: tags.includes('vegan') ? 94 : tags.includes('vegetarian') ? 82 : 65,
    steps: [
      { text: `Prepare the ${name.toLowerCase()} ingredients.` },
      { text: 'Cook until tender, fragrant and cooked through.', timerMins: time },
      { text: 'Season to taste, portion and serve.' },
    ],
  });
};

const proteinKeys = Object.keys(PROTEINS);
const baseKeys = Object.keys(BASES);
const vegKeys = Object.keys(VEG);
const sauceKeys = Object.keys(SAUCES);
const cuisines = ['Mediterranean', 'Indian', 'Mexican', 'Japanese', 'Italian', 'British', 'Thai', 'Middle Eastern'];
const emojis = ['🍲', '🥗', '🍛', '🍜', '🌮', '🍝', '🍱', '🥘'];

for (let i = 0; i < 192; i += 1) {
  const proteinKey = proteinKeys[i % proteinKeys.length];
  const baseKey = baseKeys[(i * 3) % baseKeys.length];
  const vegKey = vegKeys[(i * 5) % vegKeys.length];
  const sauceKey = sauceKeys[(i * 7) % sauceKeys.length];
  const protein = PROTEINS[proteinKey];
  const base = BASES[baseKey];
  const veg = VEG[vegKey];
  const sauce = SAUCES[sauceKey];
  if (!protein || !base || !veg || !sauce) continue;
  const cuisine = cuisines[i % cuisines.length];
  const tagSet = [...veganSafe([protein, base, veg, sauce, EXTRAS.garlic]) ? ['vegan', 'vegetarian'] : protein.tags.includes('dairy') || protein.tags.includes('egg') ? ['vegetarian'] : [], 'dinner'];
  if (i % 4 === 0) tagSet.push('meal-prep', 'reheatable');
  if (i % 7 === 0) tagSet.push('freezer');
  if (i % 5 === 0) tagSet.push('high-protein');
  add(`${proteinKey}-${baseKey}-${vegKey}-${sauceKey}-${i}`, `${title(sauce.name)} ${protein.name} with ${base.name}`, emojis[i % emojis.length], 'dinner', cuisine, tagSet, [protein, base, veg, sauce, EXTRAS.garlic].filter(Boolean), 18 + (i % 4) * 8, 2);
}

for (let i = 0; i < 120; i += 1) {
  const baseKey = Object.keys(BREAKFAST_BASES)[i % Object.keys(BREAKFAST_BASES).length];
  const fruitKey = Object.keys(FRUITS)[(i * 3) % Object.keys(FRUITS).length];
  const toppingKey = Object.keys(TOPPINGS)[(i * 5) % Object.keys(TOPPINGS).length];
  const base = BREAKFAST_BASES[baseKey];
  const fruit = FRUITS[fruitKey];
  const topping = TOPPINGS[toppingKey];
  if (!base || !fruit || !topping) continue;
  const id = `${baseKey}-${fruitKey}-${toppingKey}-${i}`;
  const tags = ['breakfast', 'quick', 'meal-prep'];
  if (topping.tags.includes('dairy')) tags.push('high-protein');
  if (veganSafe([base, fruit, topping, EXTRAS.cinnamon]) && !topping.tags.includes('honey')) tags.push('vegan', 'vegetarian');
  add(id, `${title(base.name)} with ${fruit.name} and ${topping.name}`, ['🥣', '🥞', '🍓', '🍌'][i % 4], 'breakfast', i % 2 ? 'British' : 'American', tags, [base, fruit, topping, EXTRAS.cinnamon].filter(Boolean), 5 + (i % 3) * 5, 1);
}

export const RECIPES_300_PLUS = entries.filter((recipe, index, all) => all.findIndex((other) => other.id === recipe.id) === index);
export const RECIPE_EXPANSION_COUNT = RECIPES_300_PLUS.length;
