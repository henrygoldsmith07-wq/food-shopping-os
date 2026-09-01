import { compose } from './recipe-gen.js';
import { PROTEINS, BASES, VEG, SAUCES, BREAKFAST_BASES, FRUITS, TOPPINGS, EXTRAS } from './recipe-parts.js';

const entries = [];
const safe = (parts) => parts.filter(Boolean);
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const vegan = (parts) => safe(parts).every((part) => !part.tags.some((tag) => ['dairy', 'egg', 'meat', 'fish', 'seafood', 'honey'].includes(tag)));
const add = (id, name, emoji, meal, cuisine, tags, parts, time, servings) => {
  const nutrition = compose(safe(parts), servings);
  entries.push({
    id: `generated-double-${id}`, name, emoji, meal, cuisine, tags: [...new Set(tags)],
    time, prep: Math.min(15, time), difficulty: time > 40 ? 'Medium' : 'Easy', servings, ...nutrition,
    healthScore: Math.max(45, Math.min(98, Math.round(68 + nutrition.fibre * 2 + (nutrition.protein >= 25 ? 12 : 0)))),
    proteinScore: Math.max(20, Math.min(99, Math.round(nutrition.protein * 2.4))),
    envScore: tags.includes('vegan') ? 94 : tags.includes('vegetarian') ? 82 : 63,
    steps: [{ text: `Prepare the ${name.toLowerCase()} ingredients.` }, { text: 'Cook until tender and fragrant.', timerMins: time }, { text: 'Season, portion and serve.' }],
  });
};
const proteins = Object.values(PROTEINS);
const bases = Object.values(BASES);
const vegetables = Object.values(VEG);
const sauces = Object.values(SAUCES);
const cuisines = ['Mediterranean', 'Indian', 'Mexican', 'Japanese', 'Italian', 'British', 'Thai', 'Korean', 'Moroccan', 'Greek', 'Caribbean', 'Turkish', 'Spanish', 'Vietnamese', 'Lebanese'];
const emojis = ['🍲', '🥗', '🍛', '🍜', '🌮', '🍝', '🍱', '🥘', '🥙', '🍚', '🫕', '🍳'];

for (let i = 0; i < 720; i += 1) {
  const protein = proteins[(i * 7) % proteins.length];
  const base = bases[(i * 11) % bases.length];
  const vegetable = vegetables[(i * 13) % vegetables.length];
  const sauce = sauces[(i * 17) % sauces.length];
  const parts = [protein, base, vegetable, sauce, i % 2 ? EXTRAS.garlic : EXTRAS.onion, i % 3 ? EXTRAS.lemon : EXTRAS.ginger];
  const tags = ['dinner'];
  if (vegan(parts)) tags.push('vegan', 'vegetarian');
  else if (protein.tags.includes('dairy') || protein.tags.includes('egg')) tags.push('vegetarian');
  if (i % 3 === 0) tags.push('meal-prep', 'reheatable');
  if (i % 8 === 0) tags.push('freezer');
  if (i % 5 === 0) tags.push('high-protein');
  if (i % 4 === 0) tags.push('one-pot');
  if (i % 6 === 0) tags.push('family');
  add(`${i}-${slug(protein.name)}-${slug(base.name)}-${slug(vegetable.name)}-${slug(sauce.name)}`, `${sauce.name} ${protein.name} with ${base.name} and ${vegetable.name}`, emojis[i % emojis.length], 'dinner', cuisines[i % cuisines.length], tags, parts, 18 + (i % 6) * 6, 2);
}

const breakfastBases = Object.values(BREAKFAST_BASES);
const fruits = Object.values(FRUITS);
const toppings = Object.values(TOPPINGS);
for (let i = 0; i < 360; i += 1) {
  const base = breakfastBases[(i * 5) % breakfastBases.length];
  const fruit = fruits[(i * 7) % fruits.length];
  const topping = toppings[(i * 11) % toppings.length];
  const parts = [base, fruit, topping, EXTRAS.cinnamon];
  const tags = ['breakfast', 'quick', 'meal-prep'];
  if (vegan(parts)) tags.push('vegan', 'vegetarian');
  else if (topping.tags.includes('dairy') || topping.tags.includes('supplement')) tags.push('high-protein');
  if (i % 4 === 0) tags.push('kid-friendly');
  add(`${i}-${slug(base.name)}-${slug(fruit.name)}-${slug(topping.name)}`, `${base.name} with ${fruit.name} and ${topping.name}`, ['🥣', '🥞', '🍓', '🍌', '🍳', '🥯'][i % 6], 'breakfast', cuisines[i % cuisines.length], tags, parts, 5 + (i % 4) * 5, 1);
}

export const RECIPES_DOUBLE = entries.filter((recipe, index, all) => all.findIndex((other) => other.id === recipe.id) === index);
