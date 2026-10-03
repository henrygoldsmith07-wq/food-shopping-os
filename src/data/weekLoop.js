/**
 * The Forq week loop: what the user sees, and the work each stage contains.
 *
 * The visible loop is four stages — Prepare, Shop, Put away, Cook. The ten
 * hand-offs the domain logic walks (plan → portions → pantry → list → prices →
 * shop → stock → cook → leftovers → reuse) still exist as TASKS grouped under
 * those stages: the user makes the decisions that need a human, and the
 * machinery between them runs automatically and is summarised, not stepped
 * through. Tasks marked `optional` never hold a stage open.
 */

export const WEEK_LOOP_STAGES = [
  {
    id: 'prepare',
    n: 1,
    title: 'Prepare',
    short: 'Prepare',
    blurb: 'Choose meals. Forq subtracts the pantry and works out what you actually need.',
    cta: 'Add what’s needed to the list',
    doneHint: 'Meals chosen and list ready',
  },
  {
    id: 'shop',
    n: 2,
    title: 'Shop',
    short: 'Shop',
    blurb: 'One aisle-ready list. Tick items as you go — prices are there when they help.',
    cta: 'Finish shopping',
    doneHint: 'Items ticked off',
  },
  {
    id: 'putAway',
    n: 3,
    title: 'Put away',
    short: 'Put away',
    blurb: 'Record the shop and Forq moves what you bought into the pantry.',
    cta: 'Record shop & stock pantry',
    doneHint: 'Shop recorded',
  },
  {
    id: 'cook',
    n: 4,
    title: 'Cook',
    short: 'Cook',
    blurb: 'Cook the planned meals, save what’s left over — and Forq plans a better week next time.',
    cta: 'Done',
    doneHint: 'Meal cooked',
  },
];

/**
 * The internal hand-offs, grouped by the stage whose screen they serve.
 * Order matters: it is the order the domain walks and the order each
 * stage's panels stack in.
 */
export const WEEK_LOOP_TASKS = [
  { id: 'plan', stage: 'prepare', title: 'Select meals', doneHint: 'At least one meal planned' },
  { id: 'portions', stage: 'prepare', title: 'Adjust portions', doneHint: 'Portions set' },
  { id: 'pantry', stage: 'prepare', title: 'Check the pantry', doneHint: 'Reviewed pantry cover' },
  { id: 'list', stage: 'prepare', title: 'Generate the list', doneHint: 'List on your shopping tab' },
  { id: 'prices', stage: 'shop', title: 'Compare prices', doneHint: 'Prices checked (optional)', optional: true },
  { id: 'shop', stage: 'shop', title: 'Shop the aisles', doneHint: 'Items ticked off' },
  { id: 'stock', stage: 'putAway', title: 'Stock the pantry', doneHint: 'Shop recorded' },
  { id: 'cook', stage: 'cook', title: 'Cook a planned meal', doneHint: 'Meal cooked' },
  { id: 'leftovers', stage: 'cook', title: 'Save leftovers', doneHint: 'Leftovers saved or skipped', optional: true },
  { id: 'reuse', stage: 'cook', title: 'Use leftovers next', doneHint: 'Leftovers scheduled', optional: true },
];

export const WEEK_LOOP_IDS = WEEK_LOOP_STAGES.map((s) => s.id);
export const WEEK_LOOP_TASK_IDS = WEEK_LOOP_TASKS.map((s) => s.id);

export const weekLoopStageBy = Object.fromEntries(WEEK_LOOP_STAGES.map((s) => [s.id, s]));
export const weekLoopTaskBy = Object.fromEntries(WEEK_LOOP_TASKS.map((s) => [s.id, s]));

/**
 * Accepts any legacy step id (and any task id) and answers with the stage
 * that now hosts it — so guidance targets, deep links and old bookmarks land
 * in the right place instead of falling back to the start.
 */
export const weekLoopStageOf = (id) => {
  if (weekLoopStageBy[id]) return id;
  const task = weekLoopTaskBy[id];
  return task ? task.stage : WEEK_LOOP_IDS[0];
};

/** Tasks grouped for one stage, in walk order. */
export const weekLoopTasksFor = (stageId) => WEEK_LOOP_TASKS.filter((t) => t.stage === stageId);

export const WEEK_LOOP_PROMISE =
  'Plan meals, shop only what you need, cook, and let what happened feed the next plan.';
