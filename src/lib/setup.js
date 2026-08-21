/**
 * Getting started: the handful of things that make the rest of the app work.
 *
 * Not a tutorial and not a to-do list. Every step here is a *gate* — something
 * a real feature is waiting on. Set a calorie target and the diary can tell you
 * where you are; log one day and the reports have something to average; record
 * a shop and the price comparison has prices. A step that unlocked nothing
 * would just be a chore with a tick next to it.
 *
 * Each one is read from the same records as everything else, so it ticks itself
 * the moment you do the thing, and unticks if you undo it.
 */

import { orderSetupSteps } from '../data/productModes.js';

const step = (id, label, why, done, go) => ({ id, label, why, done, go });

/**
 * `go` names the tab a step is done on, so the checklist can take you there
 * rather than describing where to look.
 */
export const setupSteps = (state = {}) => [
  step(
    'targets',
    'Set what you’re aiming at',
    'Everything the diary says about your day is measured against this.',
    Boolean(state.targets?.kcal) && (state.targetMode === 'custom' || Boolean(state.maintenanceKcalResolved)),
    'profile',
  ),
  step(
    'log',
    'Log something you ate',
    'The diary is the source for the reports, the coach and the streaks.',
    Object.values(state.log || {}).some((day) => day.length > 0),
    'log',
  ),
  step(
    'pantry',
    'Add what’s in your cupboards',
    'Lets recipes tell you what you can cook now, and flags what’s going off.',
    (state.pantry || []).length > 0,
    'shop',
  ),
  step(
    'plan',
    'Plan a meal',
    'A planned week becomes a shopping list with your pantry already deducted.',
    Object.keys(state.plan || {}).length > 0,
    'plan',
  ),
  step(
    'shop',
    'Record a shop',
    'Prices you enter are what the budget and the shop comparison run on.',
    (state.shops || []).length > 0,
    'shop',
  ),
  step(
    'cook',
    'Cook a recipe',
    'Cooking one is what starts the streak and fills the diary in one tap.',
    (state.cooked || []).length > 0,
    'recipes',
  ),
];

/** How far through you are, and what to do next. */
export const setupProgress = (state = {}) => {
  // Product mode only reorders — every gate stays available.
  const steps = orderSetupSteps(setupSteps(state), state.productMode);
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    pct: Math.round((done / steps.length) * 100),
    complete: done === steps.length,
    // The next thing worth doing, in the order they unlock each other.
    next: steps.find((s) => !s.done) || null,
  };
};
