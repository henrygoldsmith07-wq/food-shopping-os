/**
 * Recipe generation.
 *
 * Rather than 600 hand-written recipes with 600 sets of invented nutrition,
 * dishes are composed from the building blocks in `recipe-parts.js` — and
 * their calories, macros, cost and scores are computed from what is in them.
 * Change a component's data once and every dish using it stays correct.
 *
 * Each template lists the component axes it varies over; the generator walks
 * those combinations in order and takes as many as the template asks for.
 */

import { TEMPLATES } from './recipe-templates.js';

export { TEMPLATES };

const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * A readable amount: spoons for the small stuff, grams for everything else.
 * Amounts are for the whole dish, so they scale with how many it serves;
 * nutrition and cost stay per serving.
 */
const qtyLabel = (p, servings = 1) => {
  if (p.grams <= 5) return servings > 1 ? `${servings} tsp` : '1 tsp';
  if (p.grams <= 20 && p.tags.some((t) => ['fat', 'sweet', 'spice', 'sauce', 'aromatic'].includes(t))) {
    return servings > 1 ? `${servings} tbsp` : '1 tbsp';
  }
  return `${p.grams * servings} g`;
};

/** Nutrition and cost per serving, with ingredients for `servings` of them. */
export const compose = (parts, servings = 1) => {
  const totals = parts.reduce((acc, p) => {
    const k = p.grams / 100;
    acc.kcal += p.per100.kcal * k;
    acc.protein += p.per100.protein * k;
    acc.carbs += p.per100.carbs * k;
    acc.fat += p.per100.fat * k;
    acc.fibre += (p.per100.fibre || 0) * k;
    acc.cost += (p.price || 0) * k;
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, cost: 0 });

  return {
    kcal: Math.round(totals.kcal),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
    fibre: round1(totals.fibre),
    costPerServing: Math.max(0.35, Math.round(totals.cost * 100) / 100),
    ingredients: parts.map((p) => ({ name: p.name, qty: qtyLabel(p, servings) })),
  };
};

/* ---------- Derived scores (no invented ratings) ---------- */

const has = (parts, tag) => parts.some((p) => p.tags.includes(tag));

const scores = (parts, n) => {
  const per100kcal = n.kcal ? (100 / n.kcal) : 0;
  const health = Math.max(20, Math.min(98, Math.round(
    55
    + n.fibre * 3
    + (n.protein * per100kcal) * 1.2
    - (n.fat * per100kcal) * 1.5
    + (has(parts, 'veg') ? 8 : 0)
    + (has(parts, 'green') ? 5 : 0)
    + (has(parts, 'wholegrain') ? 4 : 0)
    - (has(parts, 'sweet') ? 4 : 0),
  )));
  const protein = Math.max(10, Math.min(99, Math.round(n.protein * per100kcal * 14)));
  const env = Math.max(15, Math.min(99, Math.round(
    92
    - (has(parts, 'red-meat') ? 55 : 0)
    - (has(parts, 'meat') ? 20 : 0)
    - (has(parts, 'fish') ? 14 : 0)
    - (has(parts, 'dairy') ? 10 : 0)
    - (has(parts, 'egg') ? 6 : 0),
  )));
  return { healthScore: health, proteinScore: protein, envScore: env };
};

/** Diet tags are read off the components, so filters can trust them. */
const dietTags = (parts) => {
  const animal = ['meat', 'red-meat', 'poultry', 'fish', 'seafood'];
  const tags = [];
  const anyAnimal = parts.some((p) => p.tags.some((t) => animal.includes(t)));
  // Vegan rules out dairy, eggs and honey too; vegetarian only meat and fish.
  const anyAnimalProduct = has(parts, 'dairy') || has(parts, 'egg') || has(parts, 'honey');
  if (!anyAnimal && !anyAnimalProduct) tags.push('vegan', 'vegetarian');
  else if (!anyAnimal) tags.push('vegetarian');
  return tags;
};

/* ---------- Generation ---------- */

/**
 * Walk the cartesian product diagonally rather than odometer-style, so the
 * first dishes out of a template vary every axis — ten berry variants in a row
 * is a worse list than berries, banana, apple with different toppings.
 */
const combos = (axes) => {
  const indexes = axes.reduce(
    (acc, axis) => acc.flatMap((prefix) => axis.map((_, i) => [...prefix, i])),
    [[]],
  );
  const weight = (tuple) => tuple.reduce((sum, i) => sum + i, 0);
  return indexes
    .sort((a, b) => weight(a) - weight(b) || a.join().localeCompare(b.join()))
    .map((tuple) => tuple.map((i, axis) => axes[axis][i]));
};

/**
 * How many dishes each meal gets.
 *
 * Raised from 200 alongside the second round of templates. The two go
 * together: the quota can only be met by combinations that exist, and pushing
 * it past what the templates can supply would just walk further down the same
 * diagonals — a longer list of the same dish rather than a bigger book.
 */
export const PER_MEAL = 400;

const buildOne = (tpl, combo) => {
  const name = sentence(tpl.name(combo));
  const parts = tpl.parts(combo);
  const servings = tpl.meal === 'dinner' ? 2 : 1;
  const n = compose(parts, servings);
  const tags = [...new Set([
    ...tpl.tags,
    ...dietTags(parts),
    ...(tpl.time <= 25 ? ['quick'] : []),
    ...(n.protein >= 30 ? ['high-protein'] : []),
    ...(n.costPerServing <= 1.5 ? ['budget'] : []),
    ...(n.kcal <= 450 ? ['light'] : []),
  ])];

  return {
    id: slug(name),
    name,
    emoji: tpl.emoji,
    meal: tpl.meal,
    cuisine: tpl.cuisine,
    tags,
    time: tpl.time,
    prep: tpl.prep,
    difficulty: tpl.time <= 20 ? 'Easy' : tpl.time <= 40 ? 'Medium' : 'Easy',
    servings,
    ...n,
    ...scores(parts, n),
    steps: tpl.steps(combo),
  };
};

/**
 * Fill each meal to its quota, cycling the templates so a meal is a spread of
 * dish types rather than 200 variations of the first one. Names are unique.
 */
export const generateRecipes = (perMeal = PER_MEAL) => {
  const out = [];
  const seen = new Set();

  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    const queues = TEMPLATES
      .filter((t) => t.meal === meal)
      .map((tpl) => ({ tpl, rows: combos(tpl.axes), i: 0 }));

    let made = 0;
    let exhausted = false;
    while (made < perMeal && !exhausted) {
      exhausted = true;
      for (const q of queues) {
        if (made >= perMeal) break;
        // One dish per template per pass, skipping names already taken.
        while (q.i < q.rows.length) {
          const recipe = buildOne(q.tpl, q.rows[q.i]);
          q.i += 1;
          if (seen.has(recipe.id)) continue;
          seen.add(recipe.id);
          out.push(recipe);
          made += 1;
          exhausted = false;
          break;
        }
      }
    }
  }
  return out;
};
