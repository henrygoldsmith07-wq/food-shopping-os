/**
 * Dinner templates.
 *
 * A template names the component axes it varies over and how to word the
 * result; the generator walks those axes. Nothing here invents a number —
 * every figure a dish ends up with is computed from `recipe-parts.js`.
 */

import {
  BASES, EXTRAS, PROTEINS, SAUCES, VEG,
} from './recipe-parts.js';
import { all, low, pick, T } from './template-kit.js';

export const DINNER_TEMPLATES = [
  T({
    meal: 'dinner', take: 30, emoji: '🍗', cuisine: 'British', time: 45, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'thigh', 'salmon', 'cod', 'halloumi', 'tofu']),
      pick(VEG, ['broccoli', 'peppers', 'courgette', 'butternut', 'carrots']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} traybake`,
    parts: ([p, v]) => [p, v, BASES.potato, EXTRAS.oil, EXTRAS.garlic, EXTRAS.herbs],
    tags: ['dinner', 'one-pot', 'family'],
    steps: ([p, v]) => [
      { text: 'Heat the oven to 200°C fan.' },
      { text: `Toss the potatoes and ${low(v.name)} with oil, garlic and herbs.` },
      { text: `Nestle in the ${low(p.name)} and roast until golden.`, timerMins: 35 },
    ],
  }),
  T({
    meal: 'dinner', take: 26, emoji: '🍛', cuisine: 'Indian', time: 30, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'chickpeas', 'paneer', 'tofu', 'prawns', 'lentils']),
      pick(SAUCES, ['tikka', 'korma', 'coconut', 'katsu']),
    ],
    name: ([p, s]) => `${p.name} ${low(s.name).replace(' sauce', '')}`,
    parts: ([p, s]) => [p, s, BASES.rice, VEG.spinach, EXTRAS.onion, EXTRAS.ginger],
    tags: ['dinner', 'one-pot', 'family'],
    steps: ([p, s]) => [
      { text: 'Soften the onion and ginger in a wide pan.', timerMins: 6 },
      { text: `Add the ${low(p.name)} and colour it all over.`, timerMins: 5 },
      { text: `Pour in the ${low(s.name)} and simmer until thick.`, timerMins: 15 },
      { text: 'Fold the spinach through and serve over rice.' },
    ],
  }),
  T({
    meal: 'dinner', take: 24, emoji: '🥡', cuisine: 'Chinese', time: 20, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'beef', 'tofu', 'prawns', 'tempeh', 'pork']),
      pick(SAUCES, ['soy', 'blackbean', 'satay', 'teriyaki']),
    ],
    name: ([p, s]) => `${p.name} stir-fry with ${low(s.name)}`,
    parts: ([p, s]) => [p, s, BASES.noodles, VEG.peppers, VEG.greenbeans, EXTRAS.ginger],
    tags: ['dinner', 'quick'],
    steps: ([p, s]) => [
      { text: 'Get the wok as hot as it will go.' },
      { text: `Sear the ${low(p.name)}, then lift it out.`, timerMins: 5 },
      { text: 'Fry the vegetables hard for two minutes.', timerMins: 2 },
      { text: `Return everything with the noodles and ${low(s.name)}, toss and serve.` },
    ],
  }),
  T({
    meal: 'dinner', take: 24, emoji: '🍝', cuisine: 'Italian', time: 25, prep: 10,
    axes: [
      pick(SAUCES, ['tomato', 'pesto', 'chimichurri', 'lemonherb']),
      pick(PROTEINS, ['beef', 'chicken', 'lentils', 'prawns', 'feta', 'tofu']),
    ],
    name: ([s, p]) => `${p.name} pasta with ${low(s.name)}`,
    parts: ([s, p]) => [BASES.pasta, p, s, VEG.tomatoes, EXTRAS.garlic, EXTRAS.parmesan],
    tags: ['dinner', 'quick', 'family'],
    steps: ([s, p]) => [
      { text: 'Get the pasta on in well-salted water.', timerMins: 10 },
      { text: `Cook the ${low(p.name)} with the garlic until done.`, timerMins: 8 },
      { text: `Stir in the ${low(s.name)} and a splash of pasta water.` },
      { text: 'Toss everything together and finish with parmesan.' },
    ],
  }),
  T({
    meal: 'dinner', take: 20, emoji: '🌶️', cuisine: 'Mexican', time: 40, prep: 10,
    axes: [
      pick(PROTEINS, ['beef', 'turkey', 'blackbeans', 'lentils', 'butterbeans']),
      pick(VEG, ['peppers', 'aubergine', 'mushrooms', 'carrots']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} chilli`,
    parts: ([p, v]) => [p, v, SAUCES.tomato, BASES.rice, EXTRAS.onion, EXTRAS.chilli],
    tags: ['dinner', 'batch', 'freezer', 'one-pot', 'family'],
    steps: ([p, v]) => [
      { text: 'Sweat the onion, chilli and vegetables until soft.', timerMins: 8 },
      { text: `Brown the ${low(p.name)} and toast the spices for a minute.`, timerMins: 5 },
      { text: 'Add the tomato sauce and simmer low and slow.', timerMins: 25 },
      { text: 'Season, rest five minutes and serve over rice.' },
    ],
  }),
  T({
    meal: 'dinner', take: 24, emoji: '🍱', cuisine: 'Japanese', time: 25, prep: 10,
    axes: [
      pick(PROTEINS, ['salmon', 'tuna', 'chicken', 'tofu', 'prawns', 'tempeh']),
      pick(SAUCES, ['teriyaki', 'soy', 'katsu', 'satay']),
    ],
    name: ([p, s]) => `${low(s.name).replace(' glaze', '').replace(' sauce', '')} ${low(p.name)} rice bowl`,
    parts: ([p, s]) => [p, s, BASES.rice, VEG.broccoli, VEG.cabbage, EXTRAS.ginger],
    tags: ['dinner', 'quick', 'high-protein'],
    steps: ([p, s]) => [
      { text: 'Rinse and cook the rice; steam the greens above it.', timerMins: 12 },
      { text: `Sear the ${low(p.name)} until just cooked.`, timerMins: 6 },
      { text: `Add the ${low(s.name)} and let it bubble to a shine.`, timerMins: 2 },
      { text: 'Build the bowl and spoon the pan juices over.' },
    ],
  }),
  T({
    meal: 'dinner', take: 15, emoji: '🌮', cuisine: 'Mexican', time: 20, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'beef', 'blackbeans', 'prawns', 'tofu']),
      pick(SAUCES, ['salsa', 'chimichurri', 'harissa']),
    ],
    name: ([p, s]) => `${p.name} tacos with ${low(s.name)}`,
    parts: ([p, s]) => [p, s, BASES.tortilla, VEG.cabbage, VEG.tomatoes, EXTRAS.lemon],
    tags: ['dinner', 'quick', 'family'],
    steps: ([p, s]) => [
      { text: `Season and cook the ${low(p.name)} hard and fast.`, timerMins: 8 },
      { text: 'Shred the cabbage and dress it with lime.' },
      { text: `Warm the tortillas, then build with the ${low(s.name)}.` },
    ],
  }),
  T({
    meal: 'dinner', take: 20, emoji: '🍲', cuisine: 'British', time: 50, prep: 15,
    axes: [
      pick(PROTEINS, ['lamb', 'beef', 'thigh', 'butterbeans', 'lentils']),
      pick(VEG, ['carrots', 'leek', 'mushrooms', 'peas']),
    ],
    name: ([p, v]) => `Slow ${low(p.name)} & ${low(v.name)} stew`,
    parts: ([p, v]) => [p, v, BASES.potato, SAUCES.gravy, EXTRAS.onion, EXTRAS.stock],
    tags: ['dinner', 'batch', 'one-pot', 'comfort', 'freezer'],
    steps: ([p, v]) => [
      { text: `Brown the ${low(p.name)} in batches and set aside.`, timerMins: 8 },
      { text: 'Soften the onion and vegetables in the same pan.', timerMins: 8 },
      { text: 'Return everything with the stock and gravy, then simmer.', timerMins: 35 },
      { text: 'Season and serve with the potatoes.' },
    ],
  }),
  T({
    meal: 'dinner', take: 20, emoji: '🍄', cuisine: 'Italian', time: 35, prep: 10,
    axes: [
      pick(VEG, ['mushrooms', 'asparagus', 'peas', 'butternut', 'courgette']),
      pick(PROTEINS, ['chicken', 'prawns', 'feta', 'halloumi']),
    ],
    name: ([v, p]) => `${v.name} risotto with ${low(p.name)}`,
    parts: ([v, p]) => [BASES.rice, v, p, EXTRAS.stock, EXTRAS.onion, EXTRAS.parmesan],
    tags: ['dinner', 'comfort', 'one-pot'],
    steps: ([v, p]) => [
      { text: `Fry the ${low(v.name)} hard until golden; set aside.`, timerMins: 6 },
      { text: 'Soften the onion, then toast the rice for a minute.', timerMins: 4 },
      { text: 'Add hot stock a ladle at a time, stirring, until creamy.', timerMins: 18 },
      { text: `Beat in the parmesan and fold through the ${low(p.name)}.` },
    ],
  }),
  T({
    meal: 'dinner', take: 20, emoji: '🍜', cuisine: 'Japanese', time: 25, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'prawns', 'tofu', 'pork', 'eggs']),
      pick(VEG, ['cabbage', 'mushrooms', 'greenbeans', 'spinach']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} ramen`,
    parts: ([p, v]) => [p, v, BASES.ricenoodles, EXTRAS.stock, SAUCES.soy, EXTRAS.ginger],
    tags: ['dinner', 'quick', 'one-pot'],
    steps: ([p, v]) => [
      { text: 'Bring the stock, soy and ginger to a gentle simmer.', timerMins: 8 },
      { text: `Poach the ${low(p.name)} in the broth until cooked.`, timerMins: 6 },
      { text: 'Add the noodles and greens for the last two minutes.', timerMins: 2 },
      { text: 'Ladle into deep bowls and serve immediately.' },
    ],
  }),

  /* ---------- Round two ----------
     Added to double the book. Deliberately new *forms* and new kitchens rather
     than wider axes on what was already here: another twenty variations of the
     same traybake is a longer list, not a bigger one. These also close a real
     gap — Preferences let you name Thai, Greek, Korean or Caribbean as a
     favourite cuisine when the book had not one dish from any of them. */
  T({
    meal: 'dinner', take: 30, emoji: '🍯', cuisine: 'Middle Eastern', time: 50, prep: 15,
    axes: [
      pick(PROTEINS, ['lamb', 'chicken', 'chickpeas', 'butterbeans', 'lentils', 'tofu']),
      pick(VEG, ['butternut', 'aubergine', 'carrots', 'courgette', 'peppers']),
      pick(BASES, ['couscous', 'bulgur', 'quinoa']),
    ],
    name: ([p, v, b]) => `${p.name} & ${low(v.name)} tagine with ${low(b.name)}`,
    parts: ([p, v, b]) => [p, v, b, EXTRAS.onion, EXTRAS.garlic, EXTRAS.ginger, EXTRAS.stock],
    tags: ['dinner', 'one-pot', 'batch', 'family'],
    steps: ([p, v, b]) => [
      { text: 'Soften the onion, garlic and ginger in a heavy pot.', timerMins: 8 },
      { text: `Brown the ${low(p.name)}, then add the ${low(v.name)} and stock.`, timerMins: 6 },
      { text: 'Lid on, low heat, until everything gives.', timerMins: 30 },
      { text: `Steam the ${low(b.name)} and serve alongside.` },
    ],
  }),
  T({
    meal: 'dinner', take: 30, emoji: '🥘', cuisine: 'Spanish', time: 40, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'prawns', 'cod', 'chickpeas', 'butterbeans', 'thigh']),
      pick(VEG, ['peppers', 'peas', 'greenbeans', 'tomatoes', 'asparagus']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} paella`,
    parts: ([p, v]) => [p, v, BASES.rice, EXTRAS.onion, EXTRAS.garlic, EXTRAS.stock, EXTRAS.oil],
    tags: ['dinner', 'one-pot', 'family'],
    steps: ([p, v]) => [
      { text: 'Soften the onion and garlic in a wide shallow pan.', timerMins: 8 },
      { text: 'Stir in the rice until it turns glassy.', timerMins: 2 },
      { text: `Add the stock, ${low(v.name)} and ${low(p.name)}; do not stir again.`, timerMins: 22 },
      { text: 'Rest off the heat so the base crisps.', timerMins: 5 },
    ],
  }),
  T({
    meal: 'dinner', take: 28, emoji: '🌿', cuisine: 'Thai', time: 25, prep: 10,
    axes: [
      pick(PROTEINS, ['chicken', 'prawns', 'tofu', 'tempeh', 'salmon', 'chickpeas']),
      pick(VEG, ['aubergine', 'greenbeans', 'peppers', 'broccoli', 'courgette']),
      pick(SAUCES, ['coconut', 'satay']),
    ],
    name: ([p, v, s]) => `${p.name} Thai green curry with ${low(v.name)}`,
    parts: ([p, v, s]) => [p, v, s, BASES.rice, EXTRAS.ginger, EXTRAS.chilli, EXTRAS.garlic],
    tags: ['dinner', 'one-pot', 'quick'],
    steps: ([p, v, s]) => [
      { text: 'Fry the ginger, garlic and chilli until fragrant.', timerMins: 3 },
      { text: `Add the ${low(s.name)} and bring to a simmer.`, timerMins: 5 },
      { text: `Poach the ${low(p.name)} and ${low(v.name)} in it.`, timerMins: 12 },
      { text: 'Serve over rice.' },
    ],
  }),
  T({
    meal: 'dinner', take: 28, emoji: '🍚', cuisine: 'Korean', time: 30, prep: 12,
    axes: [
      pick(PROTEINS, ['beef', 'chicken', 'tofu', 'eggs', 'tempeh', 'pork']),
      pick(VEG, ['spinach', 'carrots', 'mushrooms', 'courgette', 'cabbage']),
    ],
    name: ([p, v]) => `${p.name} bibimbap with ${low(v.name)}`,
    parts: ([p, v]) => [p, v, BASES.rice, SAUCES.soy, EXTRAS.garlic, EXTRAS.ginger, EXTRAS.chilli],
    tags: ['dinner', 'one-pot'],
    steps: ([p, v]) => [
      { text: 'Cook the rice and keep it hot.', timerMins: 15 },
      { text: `Sear the ${low(p.name)} hard with garlic and ginger.`, timerMins: 8 },
      { text: `Wilt the ${low(v.name)} separately so it keeps its own flavour.`, timerMins: 4 },
      { text: 'Arrange in sections over the rice and mix at the table.' },
    ],
  }),
  T({
    meal: 'dinner', take: 26, emoji: '🧅', cuisine: 'French', time: 45, prep: 15,
    axes: [
      pick(PROTEINS, ['thigh', 'chicken', 'butterbeans', 'lentils', 'cod', 'tempeh']),
      pick(VEG, ['mushrooms', 'carrots', 'leek', 'peas', 'greenbeans']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} casserole`,
    parts: ([p, v]) => [p, v, BASES.potato, EXTRAS.onion, EXTRAS.garlic, EXTRAS.stock, EXTRAS.herbs],
    tags: ['dinner', 'one-pot', 'batch', 'family'],
    steps: ([p, v]) => [
      { text: `Brown the ${low(p.name)} in a heavy casserole and set it aside.`, timerMins: 8 },
      { text: `Soften the onion, garlic and ${low(v.name)} in the same pot.`, timerMins: 8 },
      { text: 'Return everything with the stock and herbs; low and slow.', timerMins: 28 },
    ],
  }),
  T({
    meal: 'dinner', take: 24, emoji: '🏝️', cuisine: 'Caribbean', time: 35, prep: 12,
    axes: [
      pick(PROTEINS, ['thigh', 'chicken', 'blackbeans', 'butterbeans', 'cod', 'tofu']),
      pick(VEG, ['peppers', 'butternut', 'cabbage', 'carrots']),
      pick(SAUCES, ['peri', 'coconut']),
    ],
    name: ([p, v, s]) => `Jerk ${low(p.name)} with ${low(v.name)} and rice`,
    parts: ([p, v, s]) => [p, v, s, BASES.rice, PROTEINS.blackbeans, EXTRAS.chilli, EXTRAS.ginger],
    tags: ['dinner', 'family'],
    steps: ([p, v, s]) => [
      { text: `Rub the ${low(p.name)} with the chilli, ginger and ${low(s.name)}.` },
      { text: 'Cook the rice with the beans so it takes on the colour.', timerMins: 20 },
      { text: `Roast or griddle the ${low(p.name)} and ${low(v.name)} until charred.`, timerMins: 20 },
    ],
  }),
  T({
    meal: 'dinner', take: 22, emoji: '🧆', cuisine: 'Greek', time: 55, prep: 15,
    axes: [
      pick(PROTEINS, ['lamb', 'beef', 'lentils', 'chickpeas', 'feta', 'turkey']),
      pick(VEG, ['aubergine', 'courgette', 'peppers', 'spinach']),
    ],
    name: ([p, v]) => `${p.name} & ${low(v.name)} bake`,
    parts: ([p, v]) => [p, v, SAUCES.tomato, BASES.potato, PROTEINS.feta, EXTRAS.onion, EXTRAS.garlic],
    tags: ['dinner', 'batch', 'family'],
    steps: ([p, v]) => [
      { text: 'Heat the oven to 190°C fan.' },
      { text: `Cook the ${low(p.name)} down with the onion, garlic and tomato.`, timerMins: 15 },
      { text: `Layer with the ${low(v.name)} and potato, crumble the feta over.` },
      { text: 'Bake until the top is blistered.', timerMins: 35 },
    ],
  }),
];
