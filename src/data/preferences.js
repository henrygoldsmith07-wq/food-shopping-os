/**
 * Who you are to the app: what you can't eat, what you won't eat, what you'd
 * rather eat, and how you want numbers shown.
 *
 * The distinction that matters here is between an **allergy** and a
 * **preference**. An allergy is a hard line — a recipe that trips it is removed
 * rather than ranked down, everywhere. A preference nudges an order. They are
 * kept apart in the data because conflating them is how apps end up "gently
 * suggesting" someone eat a peanut.
 *
 * Nothing here is user data; your choices start empty.
 */

const allergen = (id, label, match, also = []) => ({ id, label, match, also });

/**
 * The fourteen allergens UK and EU labelling law requires to be declared.
 * `match` is what to look for in an ingredient line; `also` names the usual
 * hidden sources, because "milk" rarely appears on a label as the word milk.
 */
export const ALLERGENS = [
  allergen('gluten', 'Cereals with gluten', /\b(wheat|barley|rye|oats?|spelt|semolina|couscous|bulgur|flour|bread|pasta|noodle|seitan)\b/i, ['soy sauce', 'stock cubes']),
  allergen('crustaceans', 'Crustaceans', /\b(prawns?|shrimps?|crabs?|lobsters?|langoustines?|crayfish)\b/i, ['fish sauce', 'laksa paste']),
  allergen('eggs', 'Eggs', /\b(eggs?|mayonnaise|meringue|albumen)\b/i, ['fresh pasta', 'glazed pastry']),
  allergen('fish', 'Fish', /\b(fish|salmon|tuna|cod|haddock|anchov(y|ies)|sardines?|mackerel|trout|pollock)\b/i, ['worcestershire sauce', 'caesar dressing']),
  allergen('peanuts', 'Peanuts', /\b(peanuts?|groundnuts?|satay)\b/i, ['satay sauce', 'some curry pastes']),
  allergen('soya', 'Soya', /\b(soy|soya|tofu|edamame|tempeh|miso)\b/i, ['soy sauce', 'many sauces']),
  allergen('milk', 'Milk', /\b(milk|butter|cheese|cream|yogh?urt|ghee|whey|casein|parmesan|mozzarella|feta|halloumi)\b/i, ['baked goods', 'mashed potato']),
  allergen('nuts', 'Tree nuts', /\b(almonds?|hazelnuts?|walnuts?|cashews?|pecans?|pistachios?|macadamias?|brazil nuts?)\b/i, ['pesto', 'praline']),
  allergen('celery', 'Celery', /\b(celery|celeriac)\b/i, ['stock', 'soups']),
  allergen('mustard', 'Mustard', /\b(mustard)\b/i, ['dressings', 'marinades']),
  allergen('sesame', 'Sesame', /\b(sesame|tahini|hummus)\b/i, ['burger buns', 'falafel']),
  allergen('sulphites', 'Sulphites', /\b(sulphites?|sulfites?|wine|dried fruit)\b/i, ['dried apricots', 'some vinegars']),
  allergen('lupin', 'Lupin', /\b(lupin)\b/i, ['some gluten-free flours']),
  allergen('molluscs', 'Molluscs', /\b(mussels?|clams?|oysters?|squid|calamari|octopus|scallops?|snails?)\b/i, ['oyster sauce']),
];

export const allergenBy = Object.fromEntries(ALLERGENS.map((a) => [a.id, a]));

/**
 * Intolerances are dose-dependent and personal in a way allergies aren't, so
 * they rank a recipe down and flag it rather than removing it outright — the
 * amount is the point, and only you know your threshold.
 */
export const INTOLERANCES = [
  { id: 'lactose', label: 'Lactose', match: /\b(milk|cream|yogh?urt|cheese|butter|ice cream)\b/i },
  { id: 'fructose', label: 'Fructose', match: /\b(apples?|pears?|honey|mango|agave|high.fructose)\b/i },
  { id: 'fodmap', label: 'High-FODMAP foods', match: /\b(onions?|garlic|beans?|lentils?|chickpeas?|cauliflower|wheat)\b/i },
  { id: 'caffeine', label: 'Caffeine', match: /\b(coffee|espresso|tea|matcha|cocoa|chocolate)\b/i },
  { id: 'histamine', label: 'Histamine', match: /\b(aged cheese|wine|vinegar|fermented|sauerkraut|kimchi|cured)\b/i },
];

export const intoleranceBy = Object.fromEntries(INTOLERANCES.map((i) => [i.id, i]));

/**
 * Religious and cultural observance. These are rules people keep, so they are
 * treated as hard lines like allergies — and the app states plainly that it is
 * matching ingredient text, not certifying anything.
 */
export const RELIGIOUS_DIETS = [
  { id: 'halal', label: 'Halal', match: /\b(pork|bacon|ham|gammon|lard|pancetta|chorizo|prosciutto|wine|beer|rum|brandy)\b/i },
  { id: 'kosher', label: 'Kosher', match: /\b(pork|bacon|ham|gammon|lard|shellfish|prawns?|crabs?|lobsters?|mussels?|clams?|oysters?|squid|scallops?)\b/i },
  { id: 'hinduVeg', label: 'Hindu vegetarian', match: /\b(beef|steak|veal|pork|bacon|ham|chicken|turkey|lamb|mutton|fish|prawns?)\b/i },
  { id: 'jain', label: 'Jain', match: /\b(onions?|garlic|potatoes?|carrots?|beetroot|radish|meat|chicken|fish|eggs?)\b/i },
  { id: 'buddhistVeg', label: 'Buddhist vegetarian', match: /\b(meat|beef|pork|chicken|lamb|fish|prawns?|onions?|garlic|leeks?|chives)\b/i },
];

export const religiousBy = Object.fromEntries(RELIGIOUS_DIETS.map((r) => [r.id, r]));

/** The disclaimer every hard-filter surface carries. */
export const MATCH_CAVEAT =
  'This matches the words in a recipe’s ingredient list. It is a filter, not a guarantee — a real label, and your own eyes, are what actually keep you safe.';

/* ---------- Taste and circumstance ---------- */

export const CUISINES = [
  'British', 'Italian', 'Indian', 'Chinese', 'Thai', 'Japanese', 'Mexican',
  'Middle Eastern', 'Greek', 'French', 'Spanish', 'Korean', 'Vietnamese', 'Caribbean',
];

export const SKILL_LEVELS = [
  { id: 'beginner', label: 'Just starting', blurb: 'Short methods, few steps', maxSteps: 6 },
  { id: 'confident', label: 'Confident', blurb: 'Most things are fine', maxSteps: 12 },
  { id: 'keen', label: 'Keen cook', blurb: 'Bring on the long ones', maxSteps: Infinity },
];

export const skillBy = Object.fromEntries(SKILL_LEVELS.map((s) => [s.id, s]));

export const TIME_BUDGETS = [
  { id: 'rushed', label: '15 minutes', minutes: 15 },
  { id: 'quick', label: '30 minutes', minutes: 30 },
  { id: 'normal', label: '45 minutes', minutes: 45 },
  { id: 'unhurried', label: 'As long as it takes', minutes: Infinity },
];

export const timeBudgetBy = Object.fromEntries(TIME_BUDGETS.map((t) => [t.id, t]));

/* ---------- How numbers are shown ---------- */

export const UNIT_CHOICES = [
  { key: 'weight', label: 'Body weight', options: [['kg', 'Kilograms'], ['lb', 'Pounds'], ['st', 'Stone & pounds']] },
  { key: 'height', label: 'Height', options: [['cm', 'Centimetres'], ['ftin', 'Feet & inches']] },
  { key: 'energy', label: 'Energy', options: [['kcal', 'Calories'], ['kJ', 'Kilojoules']] },
  { key: 'volume', label: 'Liquid', options: [['ml', 'Millilitres'], ['floz', 'Fluid ounces']] },
  { key: 'clock', label: 'Time', options: [['24h', '24-hour'], ['12h', '12-hour']] },
];

export const DEFAULT_UNITS = { weight: 'kg', height: 'cm', energy: 'kcal', volume: 'ml', clock: '24h' };

/* ---------- Home widgets ---------- */

/**
 * Which cards Home shows, and in what order. Every one of them reads real
 * data, so turning one off hides a panel — it never changes a number.
 */
export const WIDGETS = [
  { id: 'rings', label: 'Calories & macros', fixed: true },
  { id: 'setup', label: 'Guidance', fixed: true },
  { id: 'reminders', label: 'Reminders due' },
  { id: 'goals', label: 'Today’s goals' },
  { id: 'log', label: 'Log what you ate' },
  { id: 'meals', label: 'Today’s meals' },
  { id: 'water', label: 'Water & shopping list' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'leftovers', label: 'Leftovers to use' },
  { id: 'recipe', label: 'Recipe of the day' },
];

export const DEFAULT_WIDGETS = WIDGETS.map((w) => w.id);
