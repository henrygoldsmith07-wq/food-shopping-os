/**
 * Copy last week's plan onto this one, dinner slots only.
 *
 * Planning seven dinners from scratch every week is the chore that makes
 * people stop planning. Last week was already a considered answer to "what
 * shall we eat" — reusing it (and then nudging it) costs nothing and keeps
 * variety where it was working. Deliberately dinners only: breakfasts and
 * lunches follow appetite day to day; dinners are the thing people actually
 * repeat. Anything this week already holds is never overwritten.
 *
 * "Last week" means the previous Monday–Sunday, so a Tuesday visitor gets
 * Monday's dinner too — not just the trailing seven days.
 *
 * Returns { entries, count } — `entries` feeds applyEntries() in mealplan.js.
 */

import { addDays, weekStart } from './kitchen-dates.js';

export const lastWeekDinners = (plan = {}, today) => {
  const lastWeekStart = addDays(weekStart(today), -7);
  const entries = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const recipeId = plan?.[addDays(lastWeekStart, offset)]?.dinner;
    if (recipeId) entries.push({ date: addDays(weekStart(today), offset), slot: 'dinner', recipeId });
  }
  return entries;
};

export const repeatLastWeek = (plan, today) => {
  const source = lastWeekDinners(plan, today);
  if (!source.length) return { plan, count: 0, status: null };
  // A copy never displaces a decision: slots already holding a dinner this
  // week are skipped, and the honest count says only what actually moved.
  const taken = source.filter((entry) => !plan?.[entry.date]?.dinner);
  const nextPlan = taken.reduce((next, entry) => ({
    ...next,
    [entry.date]: { ...(next[entry.date] || {}), dinner: entry.recipeId },
  }), plan);
  const count = taken.length;
  return {
    plan: nextPlan,
    count,
    status: count
      ? `Copied ${count} dinner${count === 1 ? '' : 's'} from last week — change or clear any you don't want again.`
      : 'This week already has those dinners — nothing was overwritten.',
  };
};

export const lastWeekDinnerCount = (plan = {}, today) => lastWeekDinners(plan, today).length;

export const thisWeekDinnerCount = (plan = {}, dates = []) =>
  dates.reduce((total, date) => total + (plan?.[date]?.dinner ? 1 : 0), 0);

export const lastWeekSummary = (plan = {}, today) => {
  const count = lastWeekDinnerCount(plan, today);
  return count
    ? `Last week had ${count} dinner${count === 1 ? '' : 's'} planned — copy them onto this week?`
    : null;
};
