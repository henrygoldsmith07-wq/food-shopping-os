import { compose } from './recipe-gen.js';
import { PROTEINS, BASES, VEG, SAUCES, BREAKFAST_BASES, FRUITS, TOPPINGS, EXTRAS } from './recipe-parts.js';

const entries = [];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const safe = (parts) => parts.filter(Boolean);
const vegan = (parts) => safe(parts).every((p) => !p.tags.some((t) => ['dairy', 'egg', 'meat', 'fish', 'seafood', 'honey'].includes(t)));
const add = (id, name, emoji, meal, cuisine, tags, parts, time, servings = 2) => {
  const ingredients = safe(parts);
  const nutrition = compose(ingredients, servings);
  entries.push({
    id: `generated600-${id}`, name, emoji, meal, cuisine,
    tags: [...new Set(tags)], time, prep: Math.min(15, time), difficulty: time > 40 ? 'Medium' : 'Easy', servings,
    ...nutrition,
    healthScore: Math.max(45, Math.min(98, 68 + nutrition.fibre * 2 + (nutrition.protein >= 25 ? 12 : 0))),
    proteinScore: Math.max(20, Math.min(99, Math.round(nutrition.protein * 2.4))),
    envScore: tags.includes('vegan') ? 94 : tags.includes('vegetarian') ? 82 : 63,
    steps: [
      { text: `Prepare the ${name.toLowerCase()} ingredients.` },
      { text: 'Cook until tender, fragrant and safely cooked through.', timerMins: time },
      { text: 'Season, portion and serve.' },
    ],
  });
};

const proteins = Object.values(PROTEINS);
const bases = Object.values(BASES);
const vegetables = Object.values(VEG);
const sauces = Object.values(SAUCES);
const cuisines = ['Mediterranean', 'Indian', 'Mexican', 'Japanese', 'Italian', 'British', 'Thai', 'Korean', 'Moroccan', 'Greek'];
const dinnerEmoji = ['🍲', '🥗', '🍛', '🍜', '🌮', '🍝', '🍱', '🥘', '🥙', '🍚'];

for (let i = 0; i < 240; i += 1) {
  const protein = proteins[(i * 5) % proteins.length];
  const base = bases[(i * 7) % bases.length];
  const veg = vegetables[(i * 11) % vegetables.length];
  const sauce = sauces[(i * 13) % sauces.length];
  const parts = [protein, base, veg, sauce, EXTRAS.garlic, i % 3 === 0 ? EXTRAS.onion : EXTRAS.lemon];
  const tags = ['dinner'];
  if (vegan(parts)) tags.push('vegan', 'vegetarian');
  else if (protein.tags.includes('dairy') || protein.tags.includes('egg')) tags.push('vegetarian');
  if (i % 3 === 0) tags.push('meal-prep', 'reheatable');
  if (i % 6 === 0) tags.push('freezer');
  if (i % 5 === 0) tags.push('high-protein');
  if (i % 4 === 0) tags.push('one-pot');
  add(`${i}-${slug(protein.name)}-${slug(base.name)}-${slug(veg.name)}-${slug(sauce.name)}`, `${title(sauce.name)} ${protein.name} with ${base.name}`, dinnerEmoji[i % dinnerEmoji.length], 'dinner', cuisines[i % cuisines.length], tags, parts, 18 + (i % 5) * 7, 2);
}

const breakfastBases = Object.values(BREAKFAST_BASES);
const fruits = Object.values(FRUITS);
const toppings = Object.values(TOPPINGS);
const breakfastEmoji = ['🥣', '🥞', '🍓', '🍌', '🍳', '🥯'];
for (let i = 0; i < 120; i += 1) {
  const base = breakfastBases[(i * 3) % breakfastBases.length];
  const fruit = fruits[(i * 7) % fruits.length];
  const topping = toppings[(i * 11) % toppings.length];
  const parts = [base, fruit, topping, EXTRAS.cinnamon];
  const tags = ['breakfast', 'quick', 'meal-prep'];
  if (vegan(parts)) tags.push('vegan', 'vegetarian');
  if (topping.tags.includes('dairy') || topping.tags.includes('supplement')) tags.push('high-protein');
  add(`${i}-${slug(base.name)}-${slug(fruit.name)}-${slug(topping.name)}`, `${title(base.name)} with ${fruit.name} and ${topping.name}`, breakfastEmoji[i % breakfastEmoji.length], 'breakfast', i % 2 ? 'British' : 'American', tags, parts, 5 + (i % 4) * 5, 1);
}

export const RECIPES_600_PLUS = entries.filter((recipe, index, all) => all.findIndex((other) => other.id === recipe.id) === index);
