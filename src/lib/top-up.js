// "Top-up list": rows the plan does not need for a few days can be held back
// from today's trip and come back by themselves the day before their first
// meal. A held row keeps everything else (qty, recipes, price) and only gains
// `topUpOn` (YYYY-MM-DD). Nothing is removed, so unticking the hold is lossless.
import { neededBy, LATER_AFTER_DAYS } from './needed-by.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Held back from today's trip: has a valid topUpOn that is still in the future. */
export const isHeld = (item, today) => DATE_RE.test(String(item?.topUpOn || '')) && String(item.topUpOn) > String(today || '');

/** Rows for today's trip (everything not held). */
export const tripRows = (list, today) => (Array.isArray(list) ? list : []).filter((item) => !isHeld(item, today));

/** Held rows, soonest return first. */
export const heldRows = (list, today) => (Array.isArray(list) ? list : [])
  .filter((item) => isHeld(item, today))
  .sort((a, b) => (a.topUpOn < b.topUpOn ? -1 : a.topUpOn > b.topUpOn ? 1 : String(a.name).localeCompare(String(b.name))));

/** Day a held row should come back: the day before its first meal, never today or earlier. */
export const returnDate = (firstMealDate, today) => {
  const day = shift(firstMealDate, -1);
  return day > today ? day : shift(today, 1);
};

/**
 * Hold rows until a top-up. Only rows whose first planned meal is
 * LATER_AFTER_DAYS or more away, unticked and not already held, are held.
 * Returns the new list (same array when nothing changed) and the held ids.
 */
export function holdForTopUp(list, ids, plan, dates, today) {
  const needs = neededBy(list, plan, dates, today);
  const want = new Set(ids || []);
  const held = [];
  const next = (Array.isArray(list) ? list : []).map((item) => {
    const need = needs.get(item.id);
    if (!want.has(item.id) || !need || need.inDays < LATER_AFTER_DAYS || item.checked || isHeld(item, today)) return item;
    held.push(item.id);
    return { ...item, topUpOn: returnDate(need.date, today) };
  });
  return { list: held.length ? next : list, held };
}

/** Bring held rows back onto today's trip (all of them when ids is omitted). */
export function releaseHeld(list, ids, today) {
  const want = ids ? new Set(ids) : null;
  let changed = false;
  const next = (Array.isArray(list) ? list : []).map((item) => {
    if (!('topUpOn' in (item || {})) || (want && !want.has(item.id)) || (!want && !isHeld(item, today))) return item;
    changed = true;
    const { topUpOn, ...rest } = item;
    return rest;
  });
  return changed ? next : list;
}
