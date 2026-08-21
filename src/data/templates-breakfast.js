/**
 * Breakfast templates.
 *
 * A template names the component axes it varies over and how to word the
 * result; the generator walks those axes. Nothing here invents a number —
 * every figure a dish ends up with is computed from `recipe-parts.js`.
 */

import {
  BREAKFAST_BASES, EXTRAS, FRUITS, PROTEINS, SAUCES, TOPPINGS, VEG,
} from './recipe-parts.js';
import { all, low, pick, T } from './template-kit.js';

export const BREAKFAST_TEMPLATES = [
  T({
    meal: 'breakfast', take: 60, emoji: '🥣', cuisine: 'British', time: 10, prep: 5,
    axes: [all(FRUITS), all(TOPPINGS), [EXTRAS.milk, EXTRAS.oatmilk]],
    name: ([fruit, top, milk]) => `${fruit.name} & ${low(top.name)} porridge${milk === EXTRAS.oatmilk ? ' with oat milk' : ''}`,
    parts: ([fruit, top, milk]) => [BREAKFAST_BASES.oats, milk, fruit, top],
    tags: ['breakfast', 'quick'],
    steps: ([fruit, top]) => [
      { text: 'Tip the oats and milk into a pan over medium heat.' },
      { text: 'Stir until thick and creamy.', timerMins: 5 },
      { text: `Fold through the ${low(fruit.name)} and top with ${low(top.name)}.` },
    ],
  }),
  T({
    meal: 'breakfast', take: 40, emoji: '🫐', cuisine: 'British', time: 5, prep: 5,
    axes: [all(FRUITS), all(TOPPINGS), [EXTRAS.milk, EXTRAS.oatmilk]],
    name: ([fruit, top, milk]) => `${fruit.name} overnight oats with ${low(top.name)}${milk === EXTRAS.oatmilk ? ' & oat milk' : ''}`,
    parts: ([fruit, top, milk]) => [BREAKFAST_BASES.oats, milk, fruit, top],
    tags: ['breakfast', 'meal-prep', 'quick'],
    steps: ([fruit, top]) => [
      { text: 'Stir the oats and milk together in a jar.' },
      { text: `Ripple through the ${low(fruit.name)} and ${low(top.name)}.` },
      { text: 'Lid on, fridge overnight. Eat cold or warmed.' },
    ],
  }),
  T({
    meal: 'breakfast', take: 40, emoji: '🍦', cuisine: 'British', time: 5, prep: 5,
    axes: [all(FRUITS), all(TOPPINGS), [BREAKFAST_BASES.yogurt, BREAKFAST_BASES.coconutyog]],
    name: ([fruit, top, base]) => `${fruit.name} ${base === BREAKFAST_BASES.coconutyog ? 'coconut ' : ''}yogurt bowl with ${low(top.name)}`,
    parts: ([fruit, top, base]) => [base, fruit, top],
    tags: ['breakfast', 'quick', 'high-protein'],
    steps: ([fruit, top]) => [
      { text: 'Spoon the yogurt into a bowl and level it out.' },
      { text: `Pile on the ${low(fruit.name)} and scatter over the ${low(top.name)}.` },
    ],
  }),
  T({
    meal: 'breakfast', take: 25, emoji: '🍳', cuisine: 'British', time: 15, prep: 5,
    axes: [all(VEG), pick(BREAKFAST_BASES, ['toast', 'bagel'])],
    name: ([veg, base]) => `Eggs & ${low(veg.name)} on ${low(base.name)}`,
    parts: ([veg, base]) => [BREAKFAST_BASES.eggs, veg, base, EXTRAS.oil],
    tags: ['breakfast', 'high-protein', 'quick'],
    steps: ([veg, base]) => [
      { text: `Wilt the ${low(veg.name)} in a hot pan with the oil.`, timerMins: 3 },
      { text: 'Crack in the eggs and cook to your liking.', timerMins: 4 },
      { text: `Pile onto toasted ${low(base.name)} and season well.` },
    ],
  }),
  T({
    meal: 'breakfast', take: 20, emoji: '🥞', cuisine: 'American', time: 15, prep: 5,
    axes: [all(FRUITS), pick(TOPPINGS, ['peanut', 'honey', 'maple', 'choc', 'seeds', 'protein'])],
    name: ([fruit, top]) => `${fruit.name} protein pancakes`,
    parts: ([fruit, top]) => [BREAKFAST_BASES.pancakes, EXTRAS.milk, fruit, top],
    tags: ['breakfast', 'high-protein'],
    steps: ([fruit, top]) => [
      { text: 'Whisk the mix with the milk into a thick batter.' },
      { text: 'Fry small pancakes in batches, flipping once bubbles form.', timerMins: 8 },
      { text: `Stack with the ${low(fruit.name)} and ${low(top.name)}.` },
    ],
  }),
  T({
    meal: 'breakfast', take: 15, emoji: '🥤', cuisine: 'British', time: 5, prep: 5,
    axes: [all(FRUITS), pick(TOPPINGS, ['protein', 'peanut', 'seeds', 'chia', 'almond', 'coconutflakes']), [EXTRAS.milk, EXTRAS.oatmilk]],
    name: ([fruit, top, milk]) => `${fruit.name} & ${low(top.name)} smoothie bowl${milk === EXTRAS.oatmilk ? ' with oat milk' : ''}`,
    parts: ([fruit, top, milk]) => [BREAKFAST_BASES.oats, milk, fruit, top],
    tags: ['breakfast', 'quick'],
    steps: ([fruit]) => [
      { text: `Blend the ${low(fruit.name)} with the milk and oats until thick.` },
      { text: 'Pour into a bowl and add the toppings.' },
    ],
  }),

  /* ---------- Round two ----------
     Added to double the book. Deliberately new *forms* and new kitchens rather
     than wider axes on what was already here: another twenty variations of the
     same traybake is a longer list, not a bigger one. These also close a real
     gap — Preferences let you name Thai, Greek, Korean or Caribbean as a
     favourite cuisine when the book had not one dish from any of them. */
  T({
    meal: 'breakfast', take: 45, emoji: '🍳', cuisine: 'Middle Eastern', time: 20, prep: 8,
    axes: [
      pick(PROTEINS, ['eggs', 'chickpeas', 'feta', 'halloumi', 'lentils', 'butterbeans']),
      pick(VEG, ['peppers', 'spinach', 'tomatoes', 'courgette', 'mushrooms']),
      pick(SAUCES, ['harissa', 'tahini', 'yogurt']),
    ],
    name: ([p, v, s]) => `${p.name} shakshuka with ${low(v.name)} and ${low(s.name)}`,
    parts: ([p, v, s]) => [p, v, s, BREAKFAST_BASES.shakshuka, EXTRAS.onion, EXTRAS.garlic],
    tags: ['breakfast', 'brunch', 'one-pot'],
    steps: ([p, v, s]) => [
      { text: `Soften the onion, garlic and ${low(v.name)} in a wide pan.`, timerMins: 8 },
      { text: 'Add the tomatoes and let them thicken.', timerMins: 6 },
      { text: `Fold in the ${low(p.name)}, make wells and cook through.`, timerMins: 6 },
      { text: `Spoon over the ${low(s.name)} and eat from the pan.` },
    ],
  }),
  T({
    meal: 'breakfast', take: 40, emoji: '🥞', cuisine: 'American', time: 18, prep: 8,
    axes: [
      pick(FRUITS, ['berries', 'banana', 'peach', 'cherry', 'apple', 'plum']),
      pick(TOPPINGS, ['maple', 'peanut', 'walnut', 'choc', 'cinnamon', 'nutbutter', 'seeds']),
      pick(BREAKFAST_BASES, ['pancakes', 'crumpets', 'bagel']),
    ],
    name: ([f, t, b]) => `${f.name} & ${low(t.name)} ${low(b.name)} stack`,
    parts: ([f, t, b]) => [b, f, t, EXTRAS.milk],
    tags: ['breakfast', 'weekend'],
    steps: ([f, t, b]) => [
      { text: `Warm the ${low(b.name)} through.`, timerMins: 6 },
      { text: `Pile on the ${low(f.name)} and the ${low(t.name)}.` },
    ],
  }),
];
