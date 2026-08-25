/**
 * Day stamps and week arithmetic, for the whole app.
 *
 * Every date in Forq is a 'YYYY-MM-DD' string in the user's own timezone, not
 * a Date object, because a diary day and a calendar day have to be the same
 * thing. Kept in their own module so the pantry, the spending history and the
 * planner can all share them without importing each other.
 */

/** One day in milliseconds — the unit every date helper here counts in. */
export const DAY_MS = 86400000;

export const dayStamp = (date = new Date()) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const addDays = (stamp, n) => dayStamp(new Date(`${stamp}T12:00:00`).getTime() + n * DAY_MS);

/** Days from today until a date; negative once it's in the past. */
export const daysUntil = (stamp, today = dayStamp()) =>
  stamp ? Math.round((new Date(`${stamp}T12:00:00`) - new Date(`${today}T12:00:00`)) / DAY_MS) : null;

/** Monday-first week containing `stamp`. */
export const weekStart = (stamp = dayStamp()) => {
  const d = new Date(`${stamp}T12:00:00`);
  const shift = (d.getDay() + 6) % 7; // Sunday = 6
  return dayStamp(d.getTime() - shift * DAY_MS);
};

export const weekDates = (stamp = dayStamp()) => {
  const start = weekStart(stamp);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};
