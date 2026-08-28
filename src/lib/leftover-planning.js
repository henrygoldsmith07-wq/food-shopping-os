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
