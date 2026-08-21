/**
 * Lunch templates.
 *
 * A template names the component axes it varies over and how to word the
 * result; the generator walks those axes. Nothing here invents a number —
 * every figure a dish ends up with is computed from `recipe-parts.js`.
 */

import {
  BASES, EXTRAS, PROTEINS, SAUCES, VEG,
} from './recipe-parts.js';
import { all, low, pick, T } from './template-kit.js';

export const LUNCH_TEMPLATES = [
  T({
    meal: 'lunch', take: 80, emoji: '🥗', cuisine: 'Mediterranean', time: 20, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'salmon', 'tofu', 'chickpeas', 'halloumi', 'feta', 'prawns', 'lentils', 'eggs', 'tempeh']),
      pick(BASES, ['quinoa', 'couscous', 'bulgur', 'brown', 'rice']),
      pick(SAUCES, ['tahini', 'pesto', 'harissa', 'yogurt']),
    ],
    name: ([p, b, s]) => `${p.name} & ${low(b.name)} bowl with ${low(s.name)}`,
    parts: ([p, b, s]) => [p, b, VEG.spinach, VEG.tomatoes, s, EXTRAS.lemon],
    tags: ['lunch', 'meal-prep'],
    steps: ([p, b, s]) => [
      { text: `Cook the ${low(b.name)} and let it steam dry.`, timerMins: 12 },
      { text: `Sear the ${low(p.name)} until golden and cooked through.`, timerMins: 8 },
      { text: `Build the bowl with the greens and tomatoes, spoon over the ${low(s.name)}.` },
    ],
  }),
  T({
    meal: 'lunch', take: 40, emoji: '🌯', cuisine: 'Mexican', time: 15, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'beef', 'tofu', 'blackbeans', 'halloumi', 'prawns', 'chickpeas', 'turkey']),
      pick(SAUCES, ['salsa', 'yogurt', 'harissa', 'satay', 'chimichurri']),
    ],
    name: ([p, s]) => `${p.name} wrap with ${low(s.name)}`,
    parts: ([p, s]) => [p, BASES.tortilla, VEG.peppers, VEG.spinach, s],
    tags: ['lunch', 'quick'],
    steps: ([p, s]) => [
      { text: `Cook the ${low(p.name)} with the peppers over a high heat.`, timerMins: 8 },
      { text: 'Warm the wraps.' },
      { text: `Fill, spoon over the ${low(s.name)}, roll tightly and slice.` },
    ],
  }),
  T({
    meal: 'lunch', take: 35, emoji: '🥬', cuisine: 'Mediterranean', time: 12, prep: 12,
    axes: [
      pick(PROTEINS, ['chicken', 'tuna', 'feta', 'halloumi', 'chickpeas', 'eggs', 'prawns']),
      pick(VEG, ['tomatoes', 'peppers', 'cabbage', 'asparagus', 'courgette']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} salad`,
    parts: ([p, v]) => [p, v, VEG.spinach, SAUCES.tahini, EXTRAS.lemon, EXTRAS.oil],
    tags: ['lunch', 'quick', 'healthy'],
    steps: ([p, v]) => [
      { text: `Prepare the ${low(p.name)} — griddle, poach or drain as it needs.`, timerMins: 8 },
      { text: `Toss the leaves, ${low(v.name)} and dressing together.` },
      { text: 'Top, season, and finish with lemon.' },
    ],
  }),
  T({
    meal: 'lunch', take: 25, emoji: '🍜', cuisine: 'British', time: 30, prep: 10,
    axes: [
      pick(VEG, ['butternut', 'leek', 'carrots', 'cauliflower', 'mushrooms', 'peas', 'broccoli', 'tomatoes']),
      pick(PROTEINS, ['lentils', 'butterbeans', 'chickpeas']),
    ],
    name: ([v, p]) => `${v.name} & ${low(p.name)} soup`,
    parts: ([v, p]) => [v, p, EXTRAS.onion, EXTRAS.garlic, EXTRAS.stock, EXTRAS.oil],
    tags: ['lunch', 'batch', 'freezer', 'one-pot'],
    steps: ([v, p]) => [
      { text: 'Soften the onion and garlic in the oil.', timerMins: 6 },
      { text: `Add the ${low(v.name)}, ${low(p.name)} and stock, then simmer.`, timerMins: 20 },
      { text: 'Blitz smooth or leave chunky, and season well.' },
    ],
  }),
  T({
    meal: 'lunch', take: 20, emoji: '🥪', cuisine: 'British', time: 10, prep: 8,
    axes: [
      pick(PROTEINS, ['tuna', 'chicken', 'halloumi', 'eggs', 'feta']),
      pick(SAUCES, ['pesto', 'yogurt', 'harissa', 'salsa']),
    ],
    name: ([p, s]) => `${p.name} sourdough sandwich with ${low(s.name)}`,
    parts: ([p, s]) => [p, BASES.sourdough, VEG.tomatoes, VEG.spinach, s],
    tags: ['lunch', 'quick', 'budget'],
    steps: ([p, s]) => [
      { text: 'Toast the sourdough if you like it crisp.' },
      { text: `Mix the ${low(p.name)} with the ${low(s.name)}.` },
      { text: 'Layer up with the tomatoes and leaves, then press together.' },
    ],
  }),

  /* ---------- Round two ----------
     Added to double the book. Deliberately new *forms* and new kitchens rather
     than wider axes on what was already here: another twenty variations of the
     same traybake is a longer list, not a bigger one. These also close a real
     gap — Preferences let you name Thai, Greek, Korean or Caribbean as a
     favourite cuisine when the book had not one dish from any of them. */
  T({
    meal: 'lunch', take: 45, emoji: '🥙', cuisine: 'Greek', time: 15, prep: 12,
    axes: [
      pick(PROTEINS, ['chicken', 'lamb', 'halloumi', 'feta', 'chickpeas', 'butterbeans', 'prawns']),
      pick(VEG, ['tomatoes', 'peppers', 'cabbage', 'courgette', 'asparagus']),
      pick(SAUCES, ['yogurt', 'tahini', 'lemonherb']),
    ],
    name: ([p, v, s]) => `${p.name} souvlaki wrap with ${low(v.name)}`,
    parts: ([p, v, s]) => [p, v, s, BASES.flatbread, EXTRAS.lemon, EXTRAS.herbs],
    tags: ['lunch', 'quick'],
    steps: ([p, v, s]) => [
      { text: `Griddle the ${low(p.name)} hard until it catches.`, timerMins: 8 },
      { text: 'Warm the flatbreads.' },
      { text: `Fill with the ${low(v.name)}, ${low(s.name)}, lemon and herbs.` },
    ],
  }),
  T({
    meal: 'lunch', take: 40, emoji: '🍲', cuisine: 'Vietnamese', time: 20, prep: 12,
    axes: [
      pick(PROTEINS, ['chicken', 'beef', 'prawns', 'tofu', 'tempeh', 'eggs']),
      pick(VEG, ['carrots', 'cabbage', 'peppers', 'greenbeans', 'spinach']),
      pick(SAUCES, ['soy', 'satay', 'chimichurri']),
    ],
    name: ([p, v, s]) => `${p.name} & ${low(v.name)} pho-style bowl`,
    parts: ([p, v, s]) => [p, v, s, BASES.ricenoodles, EXTRAS.stock, EXTRAS.ginger, EXTRAS.chilli],
    tags: ['lunch', 'quick', 'one-pot'],
    steps: ([p, v, s]) => [
      { text: 'Bring the stock, ginger and chilli to a bare simmer.', timerMins: 8 },
      { text: 'Soak the rice noodles until just soft.', timerMins: 4 },
      { text: `Add the ${low(p.name)} and ${low(v.name)} to the broth.`, timerMins: 5 },
      { text: `Ladle over the noodles and finish with the ${low(s.name)}.` },
    ],
  }),
  T({
    meal: 'lunch', take: 35, emoji: '🥔', cuisine: 'British', time: 55, prep: 5,
    axes: [
      pick(PROTEINS, ['tuna', 'chickpeas', 'butterbeans', 'blackbeans', 'eggs', 'feta', 'lentils']),
      pick(SAUCES, ['salsa', 'yogurt', 'pesto', 'harissa', 'tahini']),
    ],
    name: ([p, s]) => `Jacket potato with ${low(p.name)} and ${low(s.name)}`,
    parts: ([p, s]) => [BASES.potato, p, s, VEG.spinach, EXTRAS.oil],
    tags: ['lunch', 'budget', 'one-pot'],
    steps: ([p, s]) => [
      { text: 'Oil and salt the potato, then bake at 200°C fan.', timerMins: 50 },
      { text: `Mix the ${low(p.name)} with the ${low(s.name)}.` },
      { text: 'Split the potato and pile it in.' },
    ],
  }),
  T({
    meal: 'lunch', take: 30, emoji: '🍞', cuisine: 'Italian', time: 12, prep: 8,
    axes: [
      pick(PROTEINS, ['chicken', 'turkey', 'halloumi', 'feta', 'eggs', 'tuna']),
      pick(VEG, ['tomatoes', 'peppers', 'courgette', 'mushrooms', 'spinach']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} toastie`,
    parts: ([p, v]) => [BASES.sourdough, p, v, SAUCES.pesto, EXTRAS.parmesan],
    tags: ['lunch', 'quick'],
    steps: ([p, v]) => [
      { text: `Layer the ${low(p.name)}, ${low(v.name)} and pesto between the bread.` },
      { text: 'Press in a hot dry pan until the outside is crisp.', timerMins: 8 },
    ],
  }),
];
