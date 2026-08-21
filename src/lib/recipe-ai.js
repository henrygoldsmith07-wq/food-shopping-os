/**
 * The recipe generator: a dish invented for the ingredients you actually have.
 *
 * It works the way the recipe book does — pick a protein, a base, vegetables, a
 * sauce and a finisher from the component tables, then *compute* the calories,
 * macros, cost and scores from what went in. Nothing is imagined except the
 * combination and the wording of the method, and the same request with the same
 * seed always produces the same dish, so a recipe you liked can be found again.
 *
 * It runs entirely on-device: there is no model here, and it will say plainly
 * when your cupboard doesn't have enough to build something from.
 */

import {
  BASES, EXTRAS, PROTEINS, SAUCES, VEG, ALL_PARTS,
} from '../data/recipe-parts.js';
import { compose } from '../data/recipe-gen.js';
import { recipeAllowed } from './goals.js';
import { seasonScore } from '../data/seasons.js';
import { dietTagsFor } from './recipe-tools.js';
import { seededPick } from './utils.js';

const low = (s) => s.toLowerCase();
/** "Tomato & basil sauce" reads better in a dish name as "tomato & basil". */
const short = (s) => low(s).replace(/\s+(sauce|glaze|dressing|marinade)$/, '');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Components whose name matches something in your kitchen. */
export const partsYouHave = (names = []) => {
  const have = names.map((n) => String(n).toLowerCase()).filter(Boolean);
  return ALL_PARTS.filter((p) => {
    const name = p.name.toLowerCase();
    return have.some((h) => h.includes(name) || name.includes(h));
  });
};

const inGroup = (group, parts) => parts.filter((p) => Object.values(group).some((g) => g.name === p.name));

/** Four ways to put a dish together, each with its own method and character. */
const METHODS = [
  {
    id: 'traybake', emoji: '🍽️', name: ([p, b, v]) => `${p.name} traybake with ${low(b.name)} & ${low(v.name)}`,
    time: 35, prep: 10, tags: ['one-pot'],
    steps: ([p, b, v, s]) => [
      { text: 'Heat the oven to 200°C fan and get your largest roasting tin out.' },
      { text: `Toss the ${low(b.name)} and ${low(v.name)} with oil, salt and pepper.` },
      { text: `Nestle the ${low(p.name)} amongst them and roast until cooked through.`, timerMins: 30 },
      { text: `Spoon over the ${low(s.name)} and serve straight from the tin.` },
    ],
  },
  {
    id: 'pan', emoji: '🍲', name: ([p, b, v, s]) => `${p.name} in ${short(s.name)} with ${low(b.name)}`,
    time: 25, prep: 10, tags: ['quick', 'one-pot'],
    steps: ([p, b, v, s]) => [
      { text: `Get the ${low(b.name)} on — it can look after itself.` },
      { text: `Brown the ${low(p.name)} in a hot pan, then set it aside.`, timerMins: 6 },
      { text: `Soften the ${low(v.name)} in the same pan with the onion and garlic.`, timerMins: 5 },
      { text: `Return the ${low(p.name)}, pour in the ${low(s.name)} and simmer until glossy.`, timerMins: 8 },
      { text: `Season, and serve over the ${low(b.name)}.` },
    ],
  },
  {
    id: 'bowl', emoji: '🥗', name: ([p, b, v, s]) => `${p.name} bowl with ${low(v.name)} & ${short(s.name)}`,
    time: 20, prep: 12, tags: ['quick', 'healthy'],
    steps: ([p, b, v, s]) => [
      { text: `Cook the ${low(b.name)} and let it cool a little — a warm bowl, not a hot one.`, timerMins: 12 },
      { text: `Griddle or fry the ${low(p.name)} until it takes some colour.`, timerMins: 8 },
      { text: `Keep the ${low(v.name)} raw or barely blanched for crunch.` },
      { text: `Build the bowl and finish with the ${low(s.name)}.` },
    ],
  },
  {
    id: 'stirfry', emoji: '🥘', name: ([p, b, v, s]) => `${short(s.name)} ${low(p.name)} stir-fry with ${low(b.name)}`,
    time: 18, prep: 10, tags: ['quick'],
    steps: ([p, b, v, s]) => [
      { text: `Have everything chopped before you start — this cooks fast.` },
      { text: `Cook the ${low(b.name)} and drain it.`, timerMins: 10 },
      { text: `Sear the ${low(p.name)} in a very hot pan, then add ginger, garlic and chilli.`, timerMins: 5 },
      { text: `Throw in the ${low(v.name)} and keep everything moving.`, timerMins: 3 },
      { text: `Pour the ${low(s.name)} down the side of the pan and toss through the ${low(b.name)}.` },
    ],
  },
];

const AXES = [
  { key: 'protein', group: PROTEINS, label: 'protein' },
  { key: 'base', group: BASES, label: 'base to serve it on' },
  { key: 'veg', group: VEG, label: 'vegetable' },
  { key: 'sauce', group: SAUCES, label: 'sauce or dressing' },
];

/**
 * What the generator can and can't build from a given kitchen. Returns the
 * candidates per axis, and which axes came up empty — so the UI can say
 * "you have no sauce" rather than shrugging.
 */
export const generatorInputs = (names = []) => {
  const have = partsYouHave(names);
  return AXES.map((axis) => ({ ...axis, options: inGroup(axis.group, have) }));
};

const fallback = { protein: PROTEINS.chickpeas, base: BASES.rice, veg: VEG.broccoli, sauce: SAUCES.tomato };

/**
 * Invent a dish. `have` is the names in your kitchen; anything an axis is
 * missing is filled from the store cupboard and listed in `bought`, so the
 * shopping list knows what the dish assumes you'll pick up.
 */
export function inventRecipe({
  have = [], diets = [], servings = 2, maxTime = null, month = null, seed = 1, meal = 'dinner',
} = {}) {
  const inputs = generatorInputs(have);
  const missing = [];

  const chosen = inputs.map((axis, i) => {
    let pool = axis.options;
    if (diets.length) {
      // A component is allowed if a one-ingredient dish of it would be.
      const fits = pool.filter((p) => recipeAllowed({ name: p.name, tags: [], ingredients: [{ name: p.name }] }, diets));
      if (fits.length) pool = fits;
    }
    if (month && pool.length > 2) {
      const seasonal = pool.filter((p) => seasonScore({ ingredients: [{ name: p.name }] }, month) > 0);
      if (seasonal.length) pool = seasonal;
    }
    if (!pool.length) {
      missing.push(axis.key);
      return fallback[axis.key];
    }
    return seededPick(pool, 1, seed + i * 31)[0];
  });

  const methodPool = maxTime ? METHODS.filter((m) => m.time <= maxTime) : METHODS;
  const method = seededPick(methodPool.length ? methodPool : METHODS, 1, seed + 7)[0];

  const parts = [...chosen, EXTRAS.onion, EXTRAS.garlic, EXTRAS.oil];
  const nutrition = compose(parts, servings);
  const name = sentence(method.name(chosen));
  const tags = [...new Set([
    ...method.tags,
    ...dietTagsFor(nutrition.ingredients),
    ...(nutrition.protein >= 30 ? ['high-protein'] : []),
    ...(nutrition.costPerServing <= 1.5 ? ['budget'] : []),
    ...(nutrition.kcal <= 450 ? ['light'] : []),
  ])];

  return {
    id: `ai-${slug(name)}-${seed}`,
    name,
    emoji: method.emoji,
    meal,
    cuisine: 'Yours',
    tags,
    time: method.time,
    prep: method.prep,
    difficulty: 'Easy',
    servings,
    ...nutrition,
    ...scoreOf(parts, nutrition),
    steps: method.steps(chosen),
    generated: true,
    /** The parts you already had, and the ones the dish assumes you'll buy. */
    fromPantry: chosen.filter((p) => partsYouHave(have).some((h) => h.name === p.name)).map((p) => p.name),
    bought: missing.map((key) => fallback[key].name),
  };
}

/** The same scoring the recipe book uses, so a generated dish is comparable. */
const scoreOf = (parts, n) => {
  const per100kcal = n.kcal ? 100 / n.kcal : 0;
  const has = (tag) => parts.some((p) => p.tags.includes(tag));
  return {
    healthScore: Math.max(20, Math.min(98, Math.round(
      55 + n.fibre * 3 + n.protein * per100kcal * 1.2 - n.fat * per100kcal * 1.5
      + (has('veg') ? 8 : 0) + (has('green') ? 5 : 0) + (has('wholegrain') ? 4 : 0),
    ))),
    proteinScore: Math.max(10, Math.min(99, Math.round(n.protein * per100kcal * 14))),
    envScore: Math.max(15, Math.min(99, Math.round(
      92 - (has('red-meat') ? 55 : 0) - (has('meat') ? 20 : 0) - (has('fish') ? 14 : 0)
      - (has('dairy') ? 10 : 0) - (has('egg') ? 6 : 0),
    ))),
  };
};
