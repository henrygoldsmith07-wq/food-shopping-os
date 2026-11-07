/**
 * A night off the plan — eating out, away, takeaway night — marked ahead of
 * time, the way Plan to Eat and Mealime let you note a day. It is stored as
 * a busy evening beside the ones imported from a calendar (`calendarBusy`,
 * source 'manual'), so everything that already leaves busy evenings alone —
 * the week generator, the plan grid — leaves it alone too, and nothing is
 * bought for it.
 */

export const NIGHT_OFF_SOURCE = 'manual';
export const NIGHT_OFF_LABEL = 'Night off';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The manual night-off row for a date, or null. */
export const nightOff = (busy, date) => (Array.isArray(busy) ? busy : [])
  .find((row) => row?.date === date && row.source === NIGHT_OFF_SOURCE) || null;

/** Busy evenings (imported or manual) as a Set of dates. */
export const busyDateSet = (busy) => new Set((Array.isArray(busy) ? busy : []).map((row) => row?.date).filter(Boolean));

/** Mark a date as a night off, or take the mark away; other rows are untouched. */
export const toggleNightOff = (busy, date, { label = NIGHT_OFF_LABEL, now = new Date() } = {}) => {
  const rows = Array.isArray(busy) ? busy : [];
  if (!DATE_RE.test(String(date || ''))) return rows;
  if (nightOff(rows, date)) return rows.filter((row) => !(row?.date === date && row.source === NIGHT_OFF_SOURCE));
  return [...rows, { date, source: NIGHT_OFF_SOURCE, label, importedAt: now.toISOString() }]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

/**
 * A calendar import replacing the busy evenings for a range. The nights you
 * marked yourself stay whatever the calendar says.
 */
export const mergeImportedBusy = (busy, imported, dates) => {
  const range = new Set(dates || []);
  const rows = Array.isArray(busy) ? busy : [];
  const kept = rows.filter((row) => !range.has(row?.date) || row.source === NIGHT_OFF_SOURCE);
  const incoming = (Array.isArray(imported) ? imported : []).filter((row) => range.has(row?.date));
  const byKey = new Map();
  for (const row of [...incoming, ...kept]) byKey.set(`${row.date}|${row.source === NIGHT_OFF_SOURCE ? 'm' : 'c'}`, row);
  return [...byKey.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
};
