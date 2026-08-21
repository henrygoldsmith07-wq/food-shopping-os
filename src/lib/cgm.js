/**
 * Continuous glucose data, and what it did around your meals.
 *
 * There is no browser API for Dexcom, Libre or any other CGM. Their APIs are
 * OAuth against a vendor server, which needs a server of our own to hold the
 * secret — and this app hasn't got one. So there is no "Connect your CGM"
 * button here, because it could not work.
 *
 * What every one of them does have is an export. This reads that CSV, and then
 * does the thing the export alone can't: lines the readings up against what
 * you logged eating, so a meal has a curve attached to it.
 *
 * On interpretation, the app stays in its lane. It reports what the trace did.
 * It does not tell you a food "spiked" you or grade your meals, because
 * glucose responses are individual, day-dependent and not a nutrition score.
 */

import { addDays, dayStamp } from './kitchen.js';

const MINUTE = 60000;

/* ---------- Reading an export ---------- */

const HEADER_ALIASES = {
  time: ['device timestamp', 'timestamp', 'time', 'date and time', 'datetime', 'display time'],
  value: ['historic glucose', 'scan glucose', 'glucose value', 'glucose', 'glucose reading', 'value', 'sensor glucose'],
};

const normalise = (h) => String(h || '').trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();

const columnMap = (headers) => {
  const map = {};
  headers.forEach((header, i) => {
    const h = normalise(header);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[key] === undefined && aliases.some((a) => h === a || h.startsWith(a))) map[key] = i;
    }
  });
  return map;
};

/** Handles ISO, UK and US orderings, with or without seconds. */
export const parseStamp = (text) => {
  const raw = String(text || '').trim().replace(/"/g, '');
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(raw);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: `${iso[4].padStart(2, '0')}:${iso[5]}` };
  const uk = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ ,]+(\d{1,2}):(\d{2})/.exec(raw);
  if (uk) {
    return {
      date: `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`,
      time: `${uk[4].padStart(2, '0')}:${uk[5]}`,
    };
  }
  return null;
};

/**
 * mmol/L is what UK meters read; mg/dL is what US exports carry. Anything
 * above 30 is mg/dL — no human is at 40 mmol/L and still exporting a CSV.
 */
export const toMmol = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 30 ? Math.round((n / 18.0182) * 10) / 10 : Math.round(n * 10) / 10;
};

/** Parse a CGM export. Rows it can't read are counted, never dropped quietly. */
export const parseCgmCsv = (text) => {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { readings: [], skipped: 0, error: 'That doesn’t look like an export — a header row and a row per reading.' };
  }
  // Libre puts a title line above the headers; find the row that looks like one.
  const headerIndex = lines.findIndex((l) => Object.keys(columnMap(l.split(','))).length >= 2);
  if (headerIndex < 0) {
    return { readings: [], skipped: 0, error: 'I need a timestamp column and a glucose column. The header row is what I read.' };
  }
  const map = columnMap(lines[headerIndex].split(','));

  const readings = [];
  let skipped = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split(',');
    const stamp = parseStamp(cells[map.time]);
    const value = toMmol(String(cells[map.value] ?? '').replace(/[^\d.]/g, ''));
    if (!stamp || value === null) {
      skipped += 1;
      continue;
    }
    readings.push({ ...stamp, value });
  }
  readings.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return {
    readings,
    skipped,
    error: readings.length ? null : 'No rows had both a timestamp and a glucose value.',
  };
};

/* ---------- Reading it back ---------- */

const stampMs = (r) => new Date(`${r.date}T${r.time}:00`).getTime();

const stats = (list) => {
  if (!list.length) return null;
  const values = list.map((r) => r.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    readings: list.length,
    avg: Math.round(mean * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
  };
};

/** A day's trace: the shape of it, and how much of the day it covers. */
export const daySummary = (readings = [], date = dayStamp()) => {
  const rows = readings.filter((r) => r.date === date);
  const base = stats(rows);
  if (!base) return { date, readings: 0 };
  // A sensor reads every 5–15 minutes; anything much under that isn't a day.
  const expected = 24 * 4;
  return {
    date,
    ...base,
    points: rows,
    coverage: Math.min(100, Math.round((rows.length / expected) * 100)),
  };
};

/**
 * What the trace did after a meal: the reading nearest the meal time, the peak
 * inside the window, and how long after it came.
 *
 * Reported, not judged. A rise after eating is what eating does.
 */
export const mealResponse = (readings = [], entry, { date, windowMinutes = 120 } = {}) => {
  const start = new Date(`${date}T${entry.time || '12:00'}:00`).getTime();
  const end = start + windowMinutes * MINUTE;
  const inWindow = readings.filter((r) => {
    const at = stampMs(r);
    return at >= start - 15 * MINUTE && at <= end;
  });
  if (inWindow.length < 3) return { known: false, reason: 'Not enough readings around this meal.' };

  const before = inWindow.filter((r) => stampMs(r) <= start).pop() || inWindow[0];
  const after = inWindow.filter((r) => stampMs(r) > start);
  if (!after.length) return { known: false, reason: 'No readings after this meal yet.' };
  const peak = after.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    known: true,
    name: entry.name,
    time: entry.time,
    baseline: before.value,
    peak: peak.value,
    rise: Math.round((peak.value - before.value) * 10) / 10,
    peakAfterMinutes: Math.round((stampMs(peak) - start) / MINUTE),
    readings: inWindow.length,
  };
};

/** Every meal on a day that has enough trace around it to say anything about. */
export const dayResponses = (readings = [], log = {}, date = dayStamp()) =>
  (log[date] || [])
    .map((entry) => ({ entry, response: mealResponse(readings, entry, { date }) }))
    .filter((r) => r.response.known)
    .map((r) => r.response)
    .sort((a, b) => b.rise - a.rise);

/** Days the import actually covers, so the UI can say what it has. */
export const importSpan = (readings = []) => {
  if (!readings.length) return { days: 0 };
  const dates = [...new Set(readings.map((r) => r.date))].sort();
  return { days: dates.length, from: dates[0], to: dates[dates.length - 1], readings: readings.length };
};

/** Recent days with a trace, for a picker. */
export const recentDays = (readings = [], { days = 14, today = dayStamp() } = {}) => {
  const window = new Set(Array.from({ length: days }, (_, i) => addDays(today, -i)));
  return [...new Set(readings.filter((r) => window.has(r.date)).map((r) => r.date))].sort().reverse();
};
