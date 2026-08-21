import { addDays, dayStamp } from './kitchen.js';

const eventDays = (event) => {
  if (!event.start || !event.end) return [];
  if (event.allDay) {
    const out = [];
    for (let date = event.start.slice(0, 10); date < event.end.slice(0, 10); date = addDays(date, 1)) {
      out.push(date);
    }
    return out;
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out = [];
  for (let date = dayStamp(start); date <= dayStamp(end); date = addDays(date, 1)) {
    const dinnerStart = new Date(`${date}T16:00:00`);
    const dinnerEnd = new Date(`${date}T23:00:00`);
    if (start < dinnerEnd && end > dinnerStart) out.push(date);
  }
  return out;
};

export const busyMealDates = (events = []) =>
  [...new Set(events.flatMap(eventDays))].sort();

/** Parse ICS datetime (floating or Z) into ISO string for busyMealDates. */
const parseIcsDateTime = (raw, params = '') => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/VALUE=DATE/i.test(params) || /^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  if (m[7] === 'Z') {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString();
  }
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString();
};

const unfoldIcs = (text) => String(text || '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n[ \t]/g, '')
  .split('\n')
  .map((l) => l.trimEnd())
  .filter(Boolean);

/**
 * Minimal VEVENT parser for Chrono / Apple / Google ICS exports.
 * Returns events shaped like the calendar API: { start, end, allDay }.
 */
export const parseIcsEvents = (text) => {
  const lines = unfoldIcs(text);
  const events = [];
  let cur = null;
  const flush = () => {
    if (!cur?.start) {
      cur = null;
      return;
    }
    if (!cur.end) {
      cur.end = cur.allDay
        ? addDays(cur.start.slice(0, 10), 1)
        : new Date(new Date(cur.start).getTime() + 36e5).toISOString();
    }
    events.push(cur);
    cur = null;
  };
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const namePart = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const prop = namePart.split(';')[0].toUpperCase();
    if (prop === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      cur = {};
      continue;
    }
    if (prop === 'END' && value.toUpperCase() === 'VEVENT') {
      flush();
      continue;
    }
    if (!cur) continue;
    if (prop === 'DTSTART') {
      cur.allDay = /VALUE=DATE/i.test(namePart) || /^\d{8}$/.test(value);
      cur.start = parseIcsDateTime(value, namePart);
    } else if (prop === 'DTEND') {
      cur.end = parseIcsDateTime(value, namePart);
      if (cur.allDay && cur.end && cur.end.length === 10) {
        /* keep exclusive end as-is for eventDays all-day loop */
      }
    }
  }
  flush();
  return events;
};

/**
 * Turn an ICS file (e.g. Chrono “Export for meal planner”) into calendarBusy rows.
 * Filters to evenings that overlap dinner (16:00–23:00 local) via busyMealDates.
 */
export const busyFromIcs = (text, { source = 'Chrono ICS', now = Date.now() } = {}) => {
  const events = parseIcsEvents(text);
  return busyMealDates(events).map((date) => ({ date, source, importedAt: now }));
};

export async function readCalendarAvailability(provider, dates) {
  if (!dates.length) return [];
  const from = new Date(`${dates[0]}T00:00:00`).toISOString();
  const to = new Date(`${addDays(dates.at(-1), 1)}T00:00:00`).toISOString();
  const response = await fetch(`/api/integrations/calendar/events?${new URLSearchParams({
    provider, from, to,
  })}`, { credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Calendar availability could not be read.');
  const source = provider === 'google' ? 'Google Calendar' : 'Outlook Calendar';
  return busyMealDates(body.events).map((date) => ({ date, source, importedAt: Date.now() }));
}

