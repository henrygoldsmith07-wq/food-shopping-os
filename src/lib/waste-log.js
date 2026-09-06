import { LEFTOVER_CAT } from './mealplan.js';
import { byId } from '../data/recipes.js';

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
 *   never cooked      — a planned meal that was skipped or swapped out
 *                      and never made (status 'skipped' or 'substituted')
 *
 * Pure: takes app state (or any object shaped like it), returns numbers — plus
 * `missedMeals`, the named rows behind any silent-miss count, newest first.
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
    return {
      leftoverCooked: { count: 0, cost: 0 },
      leftoverBought: { count: 0, cost: 0 },
      neverCooked: 0,
      missedMeals: [],
      topSkipReason: null,
    };
  }
  const rows = (app.waste || [])
    .filter((row) => row?.date && row.date >= from && row.date <= day);
  const bucket = (predicate) => {
    const items = rows.filter(predicate);
    return { count: items.length, cost: sumCost(items) };
  };
  const neverCookedEvents = (app.mealPlanEvents || []).filter(
    (event) => ['skipped', 'substituted'].includes(event?.status) && event?.date && event.date >= from && event.date <= day,
  );
  // Silent misses — meals the day rollover marked because nothing was ever
  // recorded — are the cause worth reviewing: naming them is what lets a
  // person recognise the pattern instead of staring at a count.
  const silentMiss = (event) => event?.missed === true || event?.reason === 'missed';
  // The dominant reason behind last week's misses — the same events and the
  // same week the review's missed-meal cards read, so the two tell one
  // story. Substituted meals carry no reason (a swap is not a skip); silent
  // rollover stamps (`missed`) name nothing — the line above already says
  // they slipped by unrecorded — and takeaway nights are counted elsewhere,
  // so none of them shape the tally. Ties go to the most recent miss.
  const weekStart = day ? addDays(day, -7) : null;
  let topSkipReason = null;
  if (weekStart) {
    const reasonCounts = new Map();
    const reasonEvents = (app.mealPlanEvents || [])
      .filter((event) =>
        event?.status === 'skipped'
        && event.reason
        && event.reason !== 'missed'
        && event.reason !== 'takeaway'
        && event.reason !== 'leftovers-available'
        && !event.isTakeaway
        && event.date >= weekStart
        && event.date <= day,
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date))); // newest first
    for (const event of reasonEvents) {
      const n = (reasonCounts.get(event.reason) || 0) + 1;
      reasonCounts.set(event.reason, n);
      if (!topSkipReason || n > topSkipReason.count) topSkipReason = { reason: event.reason, count: n };
    }
  }
  return {
    leftoverCooked: bucket((row) => row.cat === LEFTOVER_CAT),
    leftoverBought: bucket((row) => row.cat !== LEFTOVER_CAT),
    neverCooked: neverCookedEvents.length,
    missedMeals: neverCookedEvents
      .filter(silentMiss)
      .map((event) => ({
        date: event.date,
        name: event?.plannedRecipeId ? byId(event.plannedRecipeId)?.name || null : null,
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    topSkipReason,
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
