/**
 * Forq product positioning — single source of truth.
 *
 * Primary promise (what the product is for):
 *   Tell Forq what you are eating; it works out what to buy; it helps you waste less.
 *
 * Everything else (nutrition diary, health, exercise, analytics, budgets,
 * sustainability) supports that loop. It must not compete as a second
 * primary product.
 */

export const PRODUCT = {
  name: 'Forq',
  /** Short brand line for headers / PWA */
  shortName: 'Forq',
  /** One-sentence promise — use this before any feature list */
  promise: 'Tell Forq what you are eating; it works out what to buy; it helps you waste less.',
  /** Slightly longer for meta / about */
  promiseLong:
    'Forq is a meal-planning and shopping app: tell Forq what you are eating; it works out what to buy; it helps you waste less. Nutrition, health and analytics support the plan — they are not a separate product.',
  /** Meta description (≤ ~155 chars) */
  metaDescription:
    'Tell Forq what you are eating; it works out what to buy; it helps you waste less. Local-first meal planning and shopping.',
  /** Document / install title */
  title: 'Forq — Tell Forq what you are eating',
  /** Tag used in older copy; do not use — kept only so old imports do not break */
  legacySubtitle: 'Food Shopping OS',
};

/** Core product loop — order is intentional */
export const PRIMARY_LOOP = [
  {
    id: 'plan',
    name: 'Plan meals',
    summary: 'Decide what you will cook this week, using recipes you already like and food you already have.',
  },
  {
    id: 'shop',
    name: 'Buy exactly what you need',
    summary: 'Turn the plan into one shopping list, reduced by your pantry and leftovers — not a second inventory app.',
  },
  {
    id: 'waste',
    name: 'Waste less food',
    summary: 'Use what is about to expire, cook what you planned, and see the cost when something is binned.',
  },
];

/**
 * Supporting capabilities. UI and docs should introduce these after the
 * primary loop, never as equal top-level product definitions.
 */
export const SUPPORTING_PILLARS = [
  {
    id: 'cook',
    name: 'Cooking & recipes',
    role: 'support',
    summary: 'Recipe library, import and cook mode so the plan is edible, not aspirational.',
  },
  {
    id: 'pantry',
    name: 'Pantry awareness',
    role: 'support',
    summary: 'Know what is already in the kitchen so the list does not rebuy it.',
  },
  {
    id: 'budget',
    name: 'Spending awareness',
    role: 'support',
    summary: 'Weekly budget and receipt logging so “buy only what you need” stays affordable.',
  },
  {
    id: 'nutrition',
    name: 'Nutrition diary',
    role: 'support',
    summary: 'Optional logging so planned meals fit your energy and macro targets.',
  },
  {
    id: 'health',
    name: 'Health context',
    role: 'support',
    summary: 'Body stats, cycle and vault fields that adjust targets — not a clinical product.',
  },
  {
    id: 'exercise',
    name: 'Activity context',
    role: 'support',
    summary: 'Light activity logging that may raise energy needs; not a fitness coach app.',
  },
  {
    id: 'analytics',
    name: 'Insights',
    role: 'support',
    summary: 'Reports from your own plan, shops and diary — evidence, not a dashboard product.',
  },
  {
    id: 'sustainability',
    name: 'Footprint estimates',
    role: 'support',
    summary: 'Rough category-level carbon/water estimates; secondary to waste reduction.',
  },
];

/** Bottom-nav / primary surfaces mapped to the promise */
export const SURFACE_POSITIONING = {
  home: {
    title: null,
    eyebrow: null,
    role: 'hub',
    blurb: 'Today’s plan, what to use up, and the list that follows.',
  },
  plan: {
    title: 'Meal planner',
    eyebrow: 'Decide what you will cook',
    role: 'primary',
    blurb: 'Build the week first — shopping and waste follow from this.',
  },
  shop: {
    title: 'Shop',
    eyebrow: 'Buy only what the plan needs',
    role: 'primary',
    blurb: 'One list from your meals, reduced by the pantry.',
  },
  recipes: {
    title: 'Recipes',
    eyebrow: 'Fuel for the plan',
    role: 'support',
    blurb: 'Find dishes worth putting on the plan — not a separate cookbook app.',
  },
  log: {
    title: 'Food diary',
    eyebrow: 'Optional nutrition check-in',
    role: 'support',
    blurb: 'Log meals when you want targets; the plan still comes first.',
  },
};

export default PRODUCT;
