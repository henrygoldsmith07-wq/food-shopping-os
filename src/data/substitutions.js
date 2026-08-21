/**
 * Ingredient substitutions.
 *
 * Each swap names a replacement that exists in `recipe-parts.js`, so when one
 * is applied the dish's calories, macros, cost and diet tags are *recomputed*
 * from the new ingredient rather than guessed. `for` lists the dietary patterns
 * a swap satisfies, which is what lets "make this vegan" work: the app looks at
 * what a dish actually contains and applies only the swaps it needs.
 *
 * `ratio` is how much of the replacement stands in for the original by weight —
 * 1 unless the replacement is markedly richer or drier.
 */

const sub = (match, options) => ({ match, options });

export const SUBSTITUTIONS = [
  /* Dairy */
  sub(/^semi-skimmed milk$|^milk$/i, [
    { name: 'Oat milk', ratio: 1, for: ['vegan', 'dairy-free'], why: 'Dairy-free, a shade sweeter, behaves the same in a pan.' },
    { name: 'Coconut milk', ratio: 0.7, for: ['vegan', 'dairy-free'], why: 'Much richer — good in curries and porridge, heavy elsewhere.' },
  ]),
  sub(/^greek yogurt$|^yogurt$/i, [
    { name: 'Coconut yogurt', ratio: 1, for: ['vegan', 'dairy-free'], why: 'Dairy-free, but far less protein.' },
  ]),
  sub(/^herby yogurt$/i, [
    { name: 'Tahini dressing', ratio: 0.6, for: ['vegan', 'dairy-free'], why: 'Keeps the cooling role without dairy; richer, so use less.' },
  ]),
  sub(/^halloumi$|^feta$|^paneer$/i, [
    { name: 'Firm tofu', ratio: 1.3, for: ['vegan', 'dairy-free'], why: 'Takes a marinade and fries the same; season it harder.' },
  ]),
  sub(/^parmesan$/i, [
    { name: 'Toasted almonds', ratio: 0.8, for: ['vegan', 'dairy-free'], why: 'Blitzed with salt it gives the same savoury dust.' },
  ]),
  sub(/^lemon & herb butter$/i, [
    { name: 'Olive oil', ratio: 0.9, for: ['vegan', 'dairy-free'], why: 'Same job, no dairy; add lemon and herbs to taste.' },
  ]),
  sub(/^korma sauce$|^tikka masala sauce$/i, [
    { name: 'Coconut milk', ratio: 1, for: ['vegan', 'dairy-free'], why: 'The creaminess without the dairy — add your own spice.' },
  ]),
  sub(/^pesto$/i, [
    { name: 'Chimichurri', ratio: 1, for: ['vegan', 'dairy-free'], why: 'Herb-led and dairy-free; sharper, less nutty.' },
  ]),
  sub(/^whey protein$/i, [
    { name: 'Peanut butter', ratio: 1, for: ['vegan', 'dairy-free'], why: 'Plant protein and fat instead of whey; less protein per gram.' },
  ]),

  /* Meat and fish */
  sub(/^chicken breast$|^chicken thighs$|^turkey mince$/i, [
    { name: 'Firm tofu', ratio: 1, for: ['vegan', 'vegetarian'], why: 'Press it, cube it, brown it hard.' },
    { name: 'Chickpeas', ratio: 1, for: ['vegan', 'vegetarian'], why: 'Cheapest way to keep the dish filling.' },
  ]),
  sub(/^beef mince$|^lamb steak$|^pork loin$/i, [
    { name: 'Lentils', ratio: 1.1, for: ['vegan', 'vegetarian'], why: 'Holds a ragù together and costs a fraction.' },
    { name: 'Tempeh', ratio: 0.9, for: ['vegan', 'vegetarian'], why: 'Firmer and nuttier, with more protein than lentils.' },
  ]),
  sub(/^salmon fillet$|^tuna steak$|^cod fillet$|^king prawns$/i, [
    { name: 'Firm tofu', ratio: 1, for: ['vegan', 'vegetarian'], why: 'Marinate it in the same glaze.' },
    { name: 'Tempeh', ratio: 0.9, for: ['vegan', 'vegetarian'], why: 'Meatier bite; steam it first if it tastes bitter.' },
  ]),
  sub(/^eggs$/i, [
    { name: 'Firm tofu', ratio: 1.2, for: ['vegan'], why: 'Crumbled and turmeric-seasoned it scrambles convincingly.' },
  ]),

  /* Gluten */
  sub(/^pasta$|^egg noodles$/i, [
    { name: 'Rice noodles', ratio: 1, for: ['gluten-free'], why: 'Gluten-free and egg-free; they cook faster, so watch them.' },
  ]),
  sub(/^couscous$|^bulgur wheat$/i, [
    { name: 'Quinoa', ratio: 1, for: ['gluten-free'], why: 'Gluten-free with more protein and fibre.' },
  ]),
  sub(/^flatbread$|^sourdough$|^tortilla wraps$/i, [
    { name: 'Potatoes', ratio: 2, for: ['gluten-free'], why: 'A different dish, but it carries the same meal without wheat.' },
  ]),
  sub(/^rice$|^white rice$|^basmati rice$/i, [
    { name: 'Brown rice', ratio: 1, for: [], why: 'More fibre for the same money; twice the cooking time.' },
    { name: 'Quinoa', ratio: 0.9, for: [], why: 'More protein, nuttier.' },
  ]),

  /* Other */
  sub(/^honey$/i, [
    { name: 'Maple syrup', ratio: 1, for: ['vegan'], why: 'Vegan, and it dissolves more easily when cold.' },
  ]),
  sub(/^peanut butter$|^almond butter$|^satay sauce$/i, [
    { name: 'Mixed seeds', ratio: 0.8, for: ['nut-free'], why: 'Nut-free, and it keeps the crunch and the fat.' },
  ]),
  sub(/^toasted almonds$|^walnuts$|^coconut flakes$/i, [
    { name: 'Mixed seeds', ratio: 1, for: ['nut-free'], why: 'Nut-free with a similar toast and crunch.' },
  ]),
  sub(/^olive oil$/i, [
    { name: 'Vegetable stock', ratio: 3, for: [], why: 'Sweat aromatics in stock instead of oil to cut the fat.' },
  ]),
];

/** The swaps offered for one ingredient line. */
export const substitutesFor = (name) => {
  const entry = SUBSTITUTIONS.find((s) => s.match.test(String(name || '').trim()));
  return entry ? entry.options : [];
};

/** Which patterns any swap in the table can satisfy. */
export const SWAPPABLE_DIETS = [...new Set(SUBSTITUTIONS.flatMap((s) => s.options.flatMap((o) => o.for)))];
