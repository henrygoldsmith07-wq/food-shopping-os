/**
 * The one perfect Forq end-to-end workflow: plan → list → shop → pantry → cook → leftovers → next plan.
 *
 * Steps are ordered hand-offs. Each has a clear “done when” so the UI can advance
 * without dumping the user onto an unrelated tab.
 */

export const WEEK_LOOP_STEPS = [
  {
    id: 'plan',
    n: 1,
    title: 'Select meals',
    short: 'Plan',
    blurb: 'Pick dinners for the week. Leftovers already in the fridge are called out.',
    doneHint: 'At least one meal planned',
  },
  {
    id: 'portions',
    n: 2,
    title: 'Adjust portions',
    short: 'Portions',
    blurb: 'How many people you cook for. This scales the shopping list quantities.',
    doneHint: 'Portions set',
  },
  {
    id: 'pantry',
    n: 3,
    title: 'Check the pantry',
    short: 'Pantry',
    blurb: 'See what the plan already covers and what you still need to buy.',
    doneHint: 'Reviewed pantry cover',
  },
  {
    id: 'list',
    n: 4,
    title: 'Generate the list',
    short: 'List',
    blurb: 'One deduplicated list from the plan, minus pantry and leftover-covered meals.',
    doneHint: 'List on your shopping tab',
  },
  {
    id: 'prices',
    n: 5,
    title: 'Compare prices',
    short: 'Prices',
    blurb: 'Where you’ve actually paid less for the same items — from your own shops.',
    doneHint: 'Prices checked (optional)',
    optional: true,
  },
  {
    id: 'shop',
    n: 6,
    title: 'Shop the aisles',
    short: 'Shop',
    blurb: 'Tick items in aisle order as you walk the store.',
    doneHint: 'Items ticked off',
  },
  {
    id: 'stock',
    n: 7,
    title: 'Stock the pantry',
    short: 'Stock',
    blurb: 'Record the shop and put bought items into the pantry automatically.',
    doneHint: 'Shop recorded',
  },
  {
    id: 'cook',
    n: 8,
    title: 'Cook a planned meal',
    short: 'Cook',
    blurb: 'Start cooking mode for a meal on the plan.',
    doneHint: 'Meal cooked',
  },
  {
    id: 'leftovers',
    n: 9,
    title: 'Save leftovers',
    short: 'Leftovers',
    blurb: 'Spare portions go in the fridge with a use-by, ready for the next plan.',
    doneHint: 'Leftovers saved or skipped',
    optional: true,
  },
  {
    id: 'reuse',
    n: 10,
    title: 'Use leftovers next',
    short: 'Reuse',
    blurb: 'Slot fridge leftovers into upcoming days so the next list buys less.',
    doneHint: 'Leftovers scheduled',
    optional: true,
  },
];

export const weekLoopStepBy = Object.fromEntries(WEEK_LOOP_STEPS.map((s) => [s.id, s]));
export const WEEK_LOOP_IDS = WEEK_LOOP_STEPS.map((s) => s.id);

export const WEEK_LOOP_PROMISE =
  'One loop: plan meals, shop only what you need, cook, save leftovers, plan again.';
