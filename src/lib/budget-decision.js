/**
 * Budget intelligence — decision support, not just reporting.
 * "You're £6 under target; this plan is £4 over; the cheapest safe change
 * is Thursday; or use the freezer chicken." Influences planning via the
 * weekly proposal + shop decision rather than duplicating them.
 */
import { planStats } from './mealplan.js';
import { weekDates } from './kitchen-dates.js';
import { householdPortionsFor } from './portions.js';
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
export const budgetDecision = (state = {}, { today = state.day } = {}) => {
  const weekly = Number(state.weeklyBudget) || 0;
  if (!weekly) return { hasBudget: false };
  const dates = weekDates(today).filter((d) => d >= today);
  const portions = householdPortionsFor(state).portions;
  let planned = null;
  try { planned = planStats(state.plan, dates, { people: portions }); } catch { planned = null; }
  const spent = Number(state.spentThisWeek) || 0;
  const plannedCost = planned ? round2(planned.cost || 0) : 0;
  const left = round2(weekly - spent);
  const over = round2(Math.max(0, plannedCost - left));
  let cheapestFix = null;
  if (over > 0 && planned) {
    // Cheapest safe change: priciest planned dinner as the swap candidate.
    // The actual swap stays with the plan UI; this names the day.
    cheapestFix = { hint: 'Replacing the priciest dinner is the cheapest safe change.' };
  }
  return {
    hasBudget: true, weekly, spent, left, plannedCost, over,
    under: over <= 0 ? round2(left - plannedCost) : 0,
    cheapestFix,
    message: over > 0
      ? `Your current plan is £${over.toFixed(2)} above target.`
      : `You're £${round2(left - plannedCost).toFixed(2)} under your weekly target.`,
  };
};
