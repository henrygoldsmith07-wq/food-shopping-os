import { LEFTOVER_CAT } from './mealplan.js';

/**
 * Why food was wasted — the three causes the product cares about.
 *
 * The pantry already records the raw material for this: waste rows keep the
 * category of what was binned (recipe leftovers are stored under the
 * `Leftovers` category, bought stock under its shelf category) and cooking
 * logs record when a planned meal was substituted for something else —
 * the planned recipe that never got cooked. This turns those rows into the
 * three buckets the loop review shows:
 *
 *   leftover cooked   — a cooked dish that went off uneaten
 *   leftover bought   — bought stock that sat past its date
 *   never cooked      — a planned meal that was swapped out and never made
 *
 * Pure: takes app state (or any object shaped like it), returns numbers.
 */
export const WASTE_WINDOW_DAYS = 21;

const addDays = (stamp, offset) => {
  const date = new Date(`${stamp}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const sumCost = (rows) => Math.round(
  rows.reduce((sum, row) => sum + (Number(row?.cost) || 0), 0) * 100,
) / 100;

export const wasteCauseBreakdown = (app = {}, { windowDays = WASTE_WINDOW_DAYS, today } = {}) => {
  const day = today || app.day;
  const from = day ? addDays(day, -windowDays) : null;
  if (!from) {
    return { leftoverCooked: { count: 0, cost: 0 }, leftoverBought: { count: 0, cost: 0 }, neverCooked: 0 };
  }
  const rows = (app.waste || [])
    .filter((row) => row?.date && row.date >= from && row.date <= day);
  const bucket = (predicate) => {
    const items = rows.filter(predicate);
    return { count: items.length, cost: sumCost(items) };
  };
  return {
    leftoverCooked: bucket((row) => row.cat === LEFTOVER_CAT),
    leftoverBought: bucket((row) => row.cat !== LEFTOVER_CAT),
    neverCooked: (app.mealPlanEvents || []).filter(
      (event) => event?.status === 'substituted' && event?.date && event.date >= from && event.date <= day,
    ).length,
  };
};

/** The single most useful sentence for this household's waste so far. */
export const wasteCauseInsight = (breakdown) => {
  const { leftoverCooked, leftoverBought, neverCooked } = breakdown;
  if (leftoverCooked.count > 0 && leftoverCooked.count >= leftoverBought.count && leftoverCooked.count >= neverCooked) {
    return 'Cooked dishes went off uneaten — cook to what you will actually eat.';
  }
  if (leftoverBought.count > 0 && leftoverBought.count >= leftoverCooked.count && leftoverBought.count >= neverCooked) {
    return 'Stock sat past its date — buy for the week, not the shelf.';
  }
  if (neverCooked > 0) {
    return 'Meals you planned never got cooked — plan fewer, then cook them.';
  }
  return null;
};
