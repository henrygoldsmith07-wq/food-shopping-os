/**
 * Goals come in two independent halves:
 *
 *   • a **body goal** — what you're asking your body to do, which sets the
 *     energy delta and the protein/fat priorities;
 *   • zero or more **dietary patterns** — how you'd like to eat, which cap or
 *     floor macros and rule ingredients in or out.
 *
 * They compose: "muscle gain" + "vegan" + "gluten-free" is a coherent set.
 * Nothing here decides anything on its own — `lib/goals.js` turns these
 * definitions into the actual daily targets, and every number stays editable.
 */

/** Energy factor is applied to your maintenance calories. */
export const BODY_GOALS = [
  {
    id: 'lose',
    label: 'Weight loss',
    blurb: 'A moderate deficit, with protein kept high so what you lose is fat.',
    kcalFactor: 0.8,
    proteinPerKg: 2.0,
    proteinPct: 0.32,
    fatPct: 0.3,
  },
  {
    id: 'gain',
    label: 'Weight gain',
    blurb: 'A steady surplus — enough to gain, not so much that it’s all fat.',
    kcalFactor: 1.15,
    proteinPerKg: 1.8,
    proteinPct: 0.22,
    fatPct: 0.27,
  },
  {
    id: 'maintain',
    label: 'Maintenance',
    blurb: 'Eat at your maintenance level and keep things where they are.',
    kcalFactor: 1,
    proteinPerKg: 1.6,
    proteinPct: 0.25,
    fatPct: 0.3,
  },
  {
    id: 'muscle',
    label: 'Muscle gain',
    blurb: 'A small surplus with the protein a training week actually needs.',
    kcalFactor: 1.1,
    proteinPerKg: 2.0,
    proteinPct: 0.28,
    fatPct: 0.25,
  },
  {
    id: 'recomp',
    label: 'Body recomposition',
    blurb: 'Near maintenance, protein high — build while you lean out.',
    kcalFactor: 0.95,
    proteinPerKg: 2.2,
    proteinPct: 0.33,
    fatPct: 0.25,
  },
];

export const bodyGoal = (id) => BODY_GOALS.find((g) => g.id === id) || BODY_GOALS[2];

/**
 * Dietary patterns. `macro` patterns reshape the split; `exclude` patterns
 * rule foods and recipes out. `targetPatch` nudges the micronutrient targets
 * where the pattern genuinely implies a different intake.
 */
export const DIET_PATTERNS = [
  {
    id: 'keto',
    label: 'Keto',
    kind: 'macro',
    blurb: 'Carbs held very low so fat carries the energy.',
    carbCap: 30,
    fatFloorPct: 0.55,
    targetPatch: { fibre: 25, sugar: 25 },
  },
  {
    id: 'low-carb',
    label: 'Low-carb',
    kind: 'macro',
    blurb: 'Carbs kept modest without going full keto.',
    carbCap: 100,
    targetPatch: { sugar: 45 },
  },
  {
    id: 'high-protein',
    label: 'High-protein',
    kind: 'macro',
    blurb: 'A protein floor of 2.2 g per kg, whatever else you’re doing.',
    proteinPerKgFloor: 2.2,
    proteinPctFloor: 0.3,
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    kind: 'style',
    blurb: 'More fibre and unsaturated fat, less saturated fat and red meat.',
    fatPct: 0.35,
    targetPatch: { fibre: 35, satFat: 15 },
    prefer: (r) => ['Mediterranean', 'Italian', 'Japanese'].includes(r.cuisine)
      || r.tags.includes('healthy') || r.envScore >= 80,
    discourage: /beef|pork|bacon|sausage|steak|lamb|mince/i,
  },
  {
    id: 'vegan',
    label: 'Vegan',
    kind: 'exclude',
    blurb: 'No animal products at all.',
    excludes: /chicken|beef|pork|lamb|bacon|sausage|steak|mince|ham|turkey|fish|salmon|tuna|prawn|anchov|egg|milk|cheese|cheddar|parmesan|halloumi|feta|yogurt|yoghurt|butter|cream|honey|gelatin|whey/i,
    recipeTag: (r) => r.tags.includes('vegan'),
  },
  {
    id: 'vegetarian',
    label: 'Vegetarian',
    kind: 'exclude',
    blurb: 'No meat or fish; dairy and eggs are fine.',
    excludes: /chicken|beef|pork|lamb|bacon|sausage|steak|mince|ham|turkey|fish|salmon|tuna|prawn|anchov|gelatin/i,
    recipeTag: (r) => r.tags.includes('vegan') || r.tags.includes('vegetarian'),
  },
  {
    id: 'pescatarian',
    label: 'Pescatarian',
    kind: 'exclude',
    blurb: 'Fish and seafood yes, other meat no.',
    excludes: /chicken|beef|pork|lamb|bacon|sausage|steak|mince|ham|turkey|gelatin/i,
    recipeTag: (r) => r.tags.includes('vegan') || r.tags.includes('vegetarian')
      || r.ingredients.some((i) => /fish|salmon|tuna|prawn/i.test(i.name)),
  },
  {
    id: 'gluten-free',
    label: 'Gluten-free',
    kind: 'exclude',
    blurb: 'No wheat, barley or rye.',
    excludes: /wheat|bread|loaf|pasta|pappardelle|penne|noodle|tortilla|wrap|panko|breadcrumb|croissant|barley|couscous|oats|granola|biscuit|digestive|cake|pastry|baguette|bun|roll/i,
  },
  {
    id: 'dairy-free',
    label: 'Dairy-free',
    kind: 'exclude',
    blurb: 'No milk, cheese, butter, yogurt or cream.',
    excludes: /(?<!coconut )milk|cheese|cheddar|parmesan|halloumi|feta|yogurt|yoghurt|butter(?!\s*bean)|cream|ghee|whey|custard|ice cream/i,
  },
];

export const dietPattern = (id) => DIET_PATTERNS.find((d) => d.id === id) || null;

/** Harris-style activity multipliers, applied to BMR. */
export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary', blurb: 'Desk job, little exercise', factor: 1.2 },
  { id: 'light', label: 'Lightly active', blurb: 'Exercise 1–3 days a week', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active', blurb: 'Exercise 3–5 days a week', factor: 1.55 },
  { id: 'active', label: 'Very active', blurb: 'Hard exercise 6–7 days a week', factor: 1.725 },
  { id: 'athlete', label: 'Athlete', blurb: 'Training twice a day', factor: 1.9 },
];

export const activityLevel = (id) => ACTIVITY_LEVELS.find((a) => a.id === id) || ACTIVITY_LEVELS[1];

export const SEXES = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'unspecified', label: 'Rather not say' },
];

/** Energy per gram, for turning macros into calories and back. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
