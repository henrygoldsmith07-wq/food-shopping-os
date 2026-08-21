/**
 * Product modes — what you're actually here for.
 *
 * Forq does meal planning, shopping, waste, a food diary, nutrition targets,
 * health records and a shared household. Almost nobody wants all of it, and an
 * app that shows everything to everybody is one where the thing you came for
 * is the fifth card down.
 *
 * A mode is a *statement of intent*, not a plan or a licence. Choosing one
 * hides the modules it doesn't need. It never deletes a record, never stops a
 * number being counted, and never changes what an existing record means — turn
 * the mode off and everything is where you left it, still totalled. That
 * guarantee is the whole design: hiding is a view, not a migration.
 *
 * Choosing nothing shows everything, which is what a new install does.
 */

/**
 * The parts of the app a mode can hide, and where each one surfaces.
 *
 * `tab` is a bottom-bar screen; `widgets` are the Home cards it owns. A module
 * marked `always` is never hidden by any mode — Home, setup guidance and your
 * own profile are how you get back to everything else, so they stay.
 */
export const MODULES = [
  { id: 'home', label: 'Home', tab: 'home', widgets: ['rings', 'setup'], always: true },
  { id: 'plan', label: 'Meal planner', tab: 'plan', widgets: ['meals'] },
  { id: 'shop', label: 'Shopping', tab: 'shop', widgets: ['water'] },
  { id: 'recipes', label: 'Recipes', tab: 'recipes', widgets: ['recipe'] },
  { id: 'log', label: 'Food diary', tab: 'log', widgets: ['log'] },
  { id: 'pantry', label: 'Pantry & leftovers', widgets: ['pantry', 'leftovers'] },
  { id: 'nutrition', label: 'Nutrition targets', widgets: ['goals'] },
  { id: 'waste', label: 'Waste & spending' },
  { id: 'household', label: 'Household' },
  { id: 'health', label: 'Health & training' },
  { id: 'progress', label: 'Streaks & achievements' },
  { id: 'reminders', label: 'Reminders', widgets: ['reminders'] },
];

export const moduleBy = Object.fromEntries(MODULES.map((module) => [module.id, module]));

/** Modules no mode can hide, whatever is selected. */
export const ALWAYS_ON = MODULES.filter((module) => module.always).map((module) => module.id);

/**
 * The five modes.
 *
 * `needs` is written as what the mode genuinely uses, not as everything that
 * could conceivably relate to it — a mode that needs nine of twelve modules
 * has not made a decision. Selecting several unions their needs, so a person
 * who plans, shops and tracks nutrition ends up with most of the app back, by
 * having asked for it.
 */
export const PRODUCT_MODES = [
  {
    id: 'plan-shop',
    label: 'Plan and shop',
    blurb: 'Decide the week, get one list, buy it once.',
    needs: ['plan', 'shop', 'recipes', 'pantry'],
  },
  {
    id: 'reduce-waste',
    label: 'Reduce waste',
    blurb: 'Cook what you already have before it goes off.',
    needs: ['pantry', 'waste', 'recipes', 'plan'],
  },
  {
    id: 'consistency',
    label: 'Eat more consistently',
    blurb: 'Fewer decisions, a repeatable week, and a streak worth keeping.',
    needs: ['log', 'plan', 'recipes', 'reminders', 'progress'],
  },
  {
    id: 'nutrition',
    label: 'Track nutrition',
    blurb: 'Calories, macros and micronutrients against targets you set.',
    needs: ['log', 'nutrition', 'health', 'progress'],
  },
  {
    id: 'household',
    label: 'Manage a household',
    blurb: 'Shared lists, portions for everyone, and who is doing what.',
    needs: ['household', 'shop', 'plan', 'pantry', 'waste'],
  },
];

export const modeBy = Object.fromEntries(PRODUCT_MODES.map((mode) => [mode.id, mode]));

export const MODE_IDS = PRODUCT_MODES.map((mode) => mode.id);

/**
 * The promise, in the words the UI uses. Stated wherever a module is hidden,
 * because "hidden" and "deleted" are the same thing to a worried person.
 */
export const MODE_CAVEAT =
  'Hiding a module hides its screens, not its records. Everything you logged, bought, planned or '
  + 'threw away is still stored and still counted, and turning the module back on shows all of it.';
