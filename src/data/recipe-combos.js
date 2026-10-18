/**
 * Turning a protein + base + vegetable + sauce combination into a dish a
 * person would recognise — or refusing to.
 *
 * The combinatorial shelves (recipes-300/600/900-plus, recipes-double) used to
 * take every pairing their index walk landed on, title-case the sauce onto the
 * front ("Tikka Masala Sauce Black beans with Polenta"), give every dish the
 * same three-line method ("Prepare the … ingredients. Cook until tender."),
 * and hand out cuisines in rotation, so a korma could be filed as Japanese.
 *
 * Here each sauce says how it is used (cooked into the dish, or spooned on at
 * the end), which bases it actually goes with, and which cuisine it belongs
 * to. A pairing outside that is skipped rather than published.
 */

const RICE = ['White rice', 'Brown rice'];
const NOODLES = ['Egg noodles', 'Rice noodles'];
const GRAINS = ['Quinoa', 'Couscous', 'Bulgur wheat'];
const POTATOES = ['Potatoes', 'Sweet potato'];

/** How each sauce is used, what it goes with, and where it is from. */
const SAUCE_PROFILE = {
  'Tomato & basil sauce': { cook: true, cuisine: 'Italian', bases: ['Pasta', 'Polenta', 'Sourdough', 'Potatoes', ...GRAINS] },
  'Coconut milk': { cook: true, cuisine: 'Thai', bases: [...RICE, 'Rice noodles', 'Quinoa'] },
  'Korma sauce': { cook: true, cuisine: 'Indian', bases: [...RICE, 'Flatbread', 'Potatoes'] },
  'Tikka masala sauce': { cook: true, cuisine: 'Indian', bases: [...RICE, 'Flatbread', 'Potatoes'] },
  'Katsu curry sauce': { cook: true, cuisine: 'Japanese', bases: RICE },
  'Teriyaki glaze': { cook: true, cuisine: 'Japanese', bases: [...RICE, ...NOODLES, 'Quinoa'] },
  'Soy & ginger': { cook: true, cuisine: 'Chinese', bases: [...RICE, ...NOODLES] },
  'Black bean sauce': { cook: true, cuisine: 'Chinese', bases: [...RICE, ...NOODLES] },
  'Satay sauce': { cook: true, cuisine: 'Thai', bases: [...RICE, ...NOODLES] },
  'Red wine gravy': { cook: true, cuisine: 'British', bases: [...POTATOES, 'Polenta', 'Sourdough'] },
  'Peri-peri marinade': { cook: true, cuisine: 'Mediterranean', bases: [...POTATOES, ...RICE, 'Flatbread', 'Tortilla wraps'] },
  Pesto: { cook: false, cuisine: 'Italian', bases: ['Pasta', 'Potatoes', 'Sourdough', 'Quinoa', 'Couscous', 'Polenta'] },
  Harissa: { cook: false, cuisine: 'Moroccan', bases: [...GRAINS, 'Flatbread', ...POTATOES] },
  Chimichurri: { cook: false, cuisine: 'Mediterranean', bases: [...POTATOES, ...RICE, 'Quinoa', 'Flatbread'] },
  'Herby yogurt': { cook: false, cuisine: 'Turkish', bases: ['Flatbread', ...GRAINS, ...POTATOES] },
  'Tahini dressing': { cook: false, cuisine: 'Mediterranean', bases: ['Flatbread', ...GRAINS, 'Sweet potato'] },
  'Lemon & herb butter': { cook: false, cuisine: 'British', bases: [...POTATOES, 'White rice', 'Quinoa', 'Couscous', 'Sourdough'] },
  'Tomato salsa': { cook: false, cuisine: 'Mexican', bases: ['Tortilla wraps', 'White rice', 'Sweet potato', 'Quinoa'] },
};

/** Gravy on fish, or cheese in a Japanese glaze, is not a dish anyone makes. */
const clashes = (protein, sauce) => {
  const tags = protein.tags || [];
  if (sauce.name === 'Red wine gravy' && (tags.includes('fish') || tags.includes('egg') || tags.includes('dairy'))) return true;
  if (['Katsu curry sauce', 'Teriyaki glaze', 'Soy & ginger', 'Black bean sauce', 'Satay sauce'].includes(sauce.name)
    && (tags.includes('dairy') || protein.name === 'Lentils' || protein.name === 'Butter beans')) return true;
  if (protein.name === 'Eggs' && !['Tomato & basil sauce', 'Harissa', 'Tomato salsa', 'Herby yogurt'].includes(sauce.name)) return true;
  return false;
};

/** Lower-case a part name for mid-sentence use, keeping proper adjectives. */
const PROPER = /\b(greek|thai|indian|japanese|korean|mexican|italian|moroccan|jamaican|cajun|cheddar)\b/gi;
export const low = (name) => String(name).toLowerCase().replace(PROPER, (word) => word[0].toUpperCase() + word.slice(1));
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** How the base is cooked, as one method line. */
const baseStep = (base) => {
  const name = low(base.name);
  if (/rice/.test(name) && !/noodles/.test(name)) return { text: `Rinse and simmer the ${name} until tender, then leave it covered.`, timerMins: /brown/.test(name) ? 25 : 12 };
  if (/noodles|pasta/.test(name)) return { text: `Cook the ${name} in salted boiling water as the pack says, then drain.`, timerMins: /pasta/.test(name) ? 10 : 4 };
  if (/couscous/.test(name)) return { text: 'Pour just-boiled water over the couscous, cover and leave to swell, then fork it through.', timerMins: 5 };
  if (/quinoa|bulgur/.test(name)) return { text: `Simmer the ${name} until tender and drain.`, timerMins: 12 };
  if (/potato/.test(name)) return { text: `Cut the ${name} into chunks and roast with a little oil until golden.`, timerMins: 30 };
  if (/polenta/.test(name)) return { text: 'Whisk the polenta into simmering water and stir until thick.', timerMins: 8 };
  return { text: `Warm the ${name} just before serving.` };
};

/** How the protein is cooked. */
const proteinStep = (protein) => {
  const name = low(protein.name);
  const tags = protein.tags || [];
  if (/mince/.test(name)) return { text: `Brown the ${name} in a hot pan, breaking it up, until no pink remains.`, timerMins: 8 };
  if (tags.includes('seafood')) return { text: `Cook the ${name} in a hot pan until pink all the way through.`, timerMins: 4 };
  if (tags.includes('fish')) return { text: `Season the ${name} and cook in a hot pan until it just flakes.`, timerMins: 6 };
  if (tags.includes('poultry')) return { text: `Cook the ${name} in a hot pan until golden and cooked through, with no pink inside.`, timerMins: 12 };
  if (tags.includes('meat')) return { text: `Season and sear the ${name} to your liking, then rest it for a few minutes and slice.`, timerMins: 8 };
  if (tags.includes('pulse')) return { text: `Drain and rinse the ${name}, then warm them through in the pan.`, timerMins: 4 };
  if (name === 'eggs') return { text: 'Crack in the eggs and cook gently until the whites are set.', timerMins: 6 };
  if (tags.includes('dairy')) return { text: `Slice the ${name} and fry until golden on both sides.`, timerMins: 4 };
  return { text: `Pat the ${name} dry, cut it into pieces and fry until crisp.`, timerMins: 8 };
};

/**
 * The dish for a combination, or null when the parts do not go together.
 * @returns {{ name: string, cuisine: string, steps: Array<{ text: string, timerMins?: number }> } | null}
 */
export const dinnerCombo = ({ protein, base, veg, sauce }, { withVeg = false } = {}) => {
  const profile = SAUCE_PROFILE[sauce?.name];
  if (!protein || !base || !profile || !profile.bases.includes(base.name) || clashes(protein, sauce)) return null;
  const vegPart = withVeg && veg ? `, ${low(veg.name)}` : '';
  const name = profile.cook
    ? `${cap(low(protein.name))}${vegPart} in ${low(sauce.name)} with ${low(base.name)}`
    : `${cap(low(protein.name))}${vegPart} with ${low(base.name)} and ${low(sauce.name)}`;
  const steps = [
    baseStep(base),
    proteinStep(protein),
    veg ? { text: `Add the ${low(veg.name)} with the garlic and cook until just tender.`, timerMins: 5 } : null,
    profile.cook
      ? { text: `Stir in the ${low(sauce.name)}, simmer until hot through, and check the seasoning.`, timerMins: 4 }
      : { text: `Spoon over the ${low(sauce.name)} to serve.` },
    { text: `Serve with the ${low(base.name)}.` },
  ].filter(Boolean);
  return { name, cuisine: profile.cuisine, steps, time: methodTime(steps) };
};

/**
 * Minutes on the table, from the method itself: the base cooks alongside the
 * rest, plus five minutes of prep, rounded up to five. The shelves used to
 * hand out times in rotation, whatever the dish.
 */
const methodTime = ([base, ...rest]) => {
  const alongside = rest.reduce((sum, step) => sum + (step.timerMins || 0), 0);
  return Math.ceil((Math.max(base.timerMins || 0, alongside) + 5) / 5) * 5;
};

/** Breakfast bases that take fruit; savoury ones (eggs, a tomato base) do not. */
const SWEET_BASES = new Set([
  'Porridge oats', 'Greek yogurt', 'Coconut yogurt', 'Wholemeal toast', 'Bagel', 'Granola',
  'Protein pancake mix', 'Milk & oats blend', 'Crumpets',
]);

const breakfastStep = (base) => {
  const name = low(base.name);
  if (/porridge|oats/.test(name)) return { text: `Simmer the ${name} with the milk, stirring, until creamy.`, timerMins: 5 };
  if (/pancake/.test(name)) return { text: 'Whisk the pancake mix with water and cook small pancakes in a hot pan, turning once.', timerMins: 8 };
  if (/toast/.test(name)) return { text: 'Toast two slices of wholemeal bread.', timerMins: 3 };
  if (/bagel|crumpet/.test(name)) return { text: `Toast the ${name}.`, timerMins: 3 };
  return { text: `Spoon the ${name} into a bowl.` };
};

/**
 * A sweet breakfast for a combination, or null where the base is savoury.
 * @returns {{ name: string, steps: Array<{ text: string, timerMins?: number }> } | null}
 */
export const breakfastCombo = ({ base, fruit, topping }) => {
  if (!base || !fruit || !topping || !SWEET_BASES.has(base.name)) return null;
  return {
    name: `${cap(low(base.name))} with ${low(fruit.name)} and ${low(topping.name)}`,
    steps: [
      breakfastStep(base),
      { text: `Top with the ${low(fruit.name)} and finish with the ${low(topping.name)}${topping.name === 'Cinnamon' ? '' : ' and a pinch of cinnamon'}.` },
    ],
    time: Math.max(5, Math.ceil(((breakfastStep(base).timerMins || 0) + 3) / 5) * 5),
  };
};
