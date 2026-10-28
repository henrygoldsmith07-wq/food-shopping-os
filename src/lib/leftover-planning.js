import { addDays } from './kitchen.js';

export const LEFTOVER_STATES = ['cooked', 'stored', 'planned', 'eaten', 'discarded'];

/** Create a first-class leftover record from a cooking event. */
export const createLeftover = ({ recipe, cookedPortions, eatenPortions = 0, date, storage = 'Fridge', safeDays = 3 } = {}) => {
  const cooked = Math.max(0, Math.round(Number(cookedPortions) || 0));
  const eaten = Math.min(cooked, Math.max(0, Math.round(Number(eatenPortions) || 0)));
  return {
    id: `leftover-${recipe?.id || 'meal'}-${date || 'today'}`,
    recipeId: recipe?.id || null,
    recipeName: recipe?.name || 'Leftovers',
    cookedPortions: cooked,
    eatenPortions: eaten,
    remainingPortions: cooked - eaten,
    cookedDate: date,
    storage,
    safeUntil: date ? addDays(date, safeDays) : null,
    plannedReuse: null,
    lifecycleState: cooked - eaten > 0 ? 'stored' : 'eaten',
  };
};

export const planLeftoverReuse = (leftover, { date, slot = 'lunch', portions = 1 } = {}) => {
  if (!leftover || leftover.remainingPortions <= 0 || !date) return leftover;
  const reuse = Math.min(leftover.remainingPortions, Math.max(1, Math.round(Number(portions) || 1)));
  return {
    ...leftover,
    plannedReuse: { date, slot, portions: reuse },
    lifecycleState: 'planned',
  };
};

export const consumePlannedLeftover = (leftover, portions = null) => {
  if (!leftover) return leftover;
  const planned = leftover.plannedReuse?.portions || 0;
  const eaten = Math.min(leftover.remainingPortions, Math.max(0, Math.round(Number(portions ?? planned) || 0)));
  const remaining = leftover.remainingPortions - eaten;
  return {
    ...leftover,
    eatenPortions: leftover.eatenPortions + eaten,
    remainingPortions: remaining,
    plannedReuse: null,
    lifecycleState: remaining > 0 ? 'stored' : 'eaten',
  };
};

export const leftoverSummary = (leftovers = [], today = '') => leftovers
  .filter((item) => item.remainingPortions > 0)
  .map((item) => ({
    ...item,
    urgent: item.safeUntil && today ? item.safeUntil <= addDays(today, 1) : false,
    label: `${item.remainingPortions} portion${item.remainingPortions === 1 ? '' : 's'} of ${item.recipeName}`,
  }));

/**
 * Free lunch/dinner slots where saved portions of a dish can be eaten before
 * they go off. Looks at the days after `from` up to the safe window, lunch
 * first, earliest day first, never an occupied slot. One slot is offered per
 * `people` portions saved (a partly-covered slot still counts as one), so
 * leftovers are planned as meals rather than hoped for.
 */
export const suggestLeftoverSlots = (plan = {}, { from, portions = 0, people = 1, safeDays = 3 } = {}) => {
  const saved = Math.max(0, Math.round(Number(portions) || 0));
  if (!from || !saved) return [];
  const eaters = Math.max(1, Math.round(Number(people) || 1));
  const wanted = Math.ceil(saved / eaters);
  const picks = [];
  for (let i = 1; i <= safeDays && picks.length < wanted; i += 1) {
    const date = addDays(from, i);
    for (const slot of ['lunch', 'dinner']) {
      if (picks.length >= wanted) break;
      if (!plan?.[date]?.[slot]) picks.push({ date, slot });
    }
  }
  return picks;
};
