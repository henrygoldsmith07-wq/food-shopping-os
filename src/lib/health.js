/**
 * Health readings, read back.
 *
 * Same rule as the rest of the app: nothing is stored twice and nothing is
 * invented. BMI is computed from the weight you logged and the height you
 * gave — never stored — a trend needs two readings before it exists, and a
 * cycle prediction needs cycles behind it or it says so.
 */

import {
  BMI_BANDS, MEASUREMENTS, WAIST_LIMITS, CYCLE_TYPICAL, vitalBy,
} from '../data/health.js';
import { addDays, dayStamp } from './kitchen.js';

const round = (n, dp = 1) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};

const byDate = (a, b) => a.date.localeCompare(b.date);

/* ---------- Measurements ---------- */

/** Every reading of one measurement, oldest first. */
export const series = (measurements = [], key) =>
  measurements.filter((m) => m.key === key && Number.isFinite(Number(m.value)))
    .map((m) => ({ ...m, value: Number(m.value) }))
    .sort(byDate);

export const latest = (measurements = [], key) => {
  const list = series(measurements, key);
  return list.length ? list[list.length - 1] : null;
};

/**
 * Movement between the first and last reading in a window, with how far apart
 * they actually were — a "trend" from two readings a day apart isn't one, and
 * the caller can see that.
 */
export const movement = (measurements = [], key, { days = 90, today = dayStamp() } = {}) => {
  const from = addDays(today, -days);
  const list = series(measurements, key).filter((m) => m.date >= from);
  if (list.length < 2) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const change = round(last.value - first.value, 1);
  const spanDays = Math.max(1, Math.round((new Date(`${last.date}T12:00:00`) - new Date(`${first.date}T12:00:00`)) / 86400000));
  return {
    key,
    from: first.value,
    to: last.value,
    change,
    perWeek: round((change / spanDays) * 7, 2),
    readings: list.length,
    spanDays,
    direction: Math.abs(change) < 0.05 ? 'steady' : change > 0 ? 'up' : 'down',
  };
};

/** BMI from a weight reading and the height on your profile. */
export const bmi = (weightKg, heightCm) => {
  if (!weightKg || !heightCm) return null;
  const value = weightKg / ((heightCm / 100) ** 2);
  const band = BMI_BANDS.find((b) => value < b.to);
  return { value: round(value, 1), label: band.label, tone: band.tone };
};

/**
 * Waist against the published thresholds. Those thresholds are sex-specific,
 * so without a stated sex this returns the number and says why it can't band it.
 */
export const waistRisk = (waistCm, sex) => {
  if (!waistCm) return null;
  const limits = WAIST_LIMITS[sex];
  if (!limits) return { value: waistCm, label: null, tone: 'muted', note: 'The published waist thresholds differ by sex — set yours under Goals and this gets a band.' };
  if (waistCm >= limits.high) return { value: waistCm, label: 'High', tone: 'danger', note: `At or above ${limits.high} cm.` };
  if (waistCm >= limits.raised) return { value: waistCm, label: 'Raised', tone: 'warn', note: `At or above ${limits.raised} cm.` };
  return { value: waistCm, label: 'In range', tone: 'good', note: `Below ${limits.raised} cm.` };
};

/** The body page in one object: latest readings, BMI, and where they're going. */
export const bodySummary = (state, today = dayStamp()) => {
  const measurements = state.measurements || [];
  const weight = latest(measurements, 'weight');
  const heightCm = state.body?.heightCm || null;
  return {
    readings: Object.fromEntries(MEASUREMENTS.map((m) => [m.key, latest(measurements, m.key)])),
    trends: Object.fromEntries(MEASUREMENTS.map((m) => [m.key, movement(measurements, m.key, { today })])),
    bmi: weight ? bmi(weight.value, heightCm) : null,
    needsHeight: Boolean(weight && !heightCm),
    waist: waistRisk(latest(measurements, 'waist')?.value, state.body?.sex),
    count: measurements.length,
  };
};

/* ---------- Vitals ---------- */

/** Readings of one vital, newest first, each with the band it falls in. */
export const vitalReadings = (vitals = [], key) =>
  vitals.filter((v) => v.key === key)
    .sort(byDate)
    .reverse()
    .map((reading) => ({ ...reading, category: vitalBy[key]?.categorise(reading.values || {}) || null }));

export const vitalSummary = (vitals = []) =>
  Object.fromEntries(Object.keys(vitalBy).map((key) => {
    const list = vitalReadings(vitals, key);
    return [key, { latest: list[0] || null, count: list.length }];
  }));

/* ---------- Sleep and stress ---------- */

const nightsIn = (sleep = [], days, today) => {
  const from = addDays(today, -(days - 1));
  return sleep.filter((s) => s.date >= from && s.date <= today).sort(byDate);
};

/** How you've slept lately: the average, the range, and how many nights it saw. */
export const sleepSummary = (sleep = [], { days = 14, today = dayStamp() } = {}) => {
  const nights = nightsIn(sleep, days, today);
  if (!nights.length) return { nights: 0 };
  const hours = nights.map((n) => Number(n.hours) || 0).filter((h) => h > 0);
  const quality = nights.map((n) => Number(n.quality) || 0).filter((q) => q > 0);
  const mean = (list) => (list.length ? round(list.reduce((a, b) => a + b, 0) / list.length, 1) : null);
  return {
    nights: nights.length,
    avgHours: mean(hours),
    shortest: hours.length ? Math.min(...hours) : null,
    longest: hours.length ? Math.max(...hours) : null,
    avgQuality: mean(quality),
    under7: hours.filter((h) => h < 7).length,
    last: nights[nights.length - 1],
  };
};

/** Stress ratings over the same window, with the days you noted a reason. */
export const stressSummary = (stress = [], { days = 14, today = dayStamp() } = {}) => {
  const from = addDays(today, -(days - 1));
  const rows = stress.filter((s) => s.date >= from && s.date <= today).sort(byDate);
  if (!rows.length) return { days: 0 };
  const levels = rows.map((r) => Number(r.level) || 0).filter(Boolean);
  return {
    days: rows.length,
    avg: round(levels.reduce((a, b) => a + b, 0) / levels.length, 1),
    high: levels.filter((l) => l >= 4).length,
    notes: rows.filter((r) => r.note).slice(-3).reverse(),
    last: rows[rows.length - 1],
  };
};

/* ---------- Cycle ---------- */

/**
 * Cycles from the period start dates you logged. A cycle length only exists
 * between two starts, so one logged period gives no average and says so.
 */
export const cycleSummary = (cycles = [], today = dayStamp()) => {
  const starts = [...new Set(cycles.map((c) => c.start).filter(Boolean))].sort();
  if (!starts.length) return { logged: 0, ready: false, reason: 'Log a period start and this fills in.' };

  const gaps = starts.slice(1).map((start, i) =>
    Math.round((new Date(`${start}T12:00:00`) - new Date(`${starts[i]}T12:00:00`)) / 86400000));
  const lengths = gaps.filter((g) => g >= 15 && g <= 60); // ignore an obvious mistype
  const last = starts[starts.length - 1];
  const dayOfCycle = Math.round((new Date(`${today}T12:00:00`) - new Date(`${last}T12:00:00`)) / 86400000) + 1;

  if (!lengths.length) {
    return {
      logged: starts.length,
      ready: false,
      last,
      dayOfCycle,
      reason: 'Two logged periods give an average cycle length — until then there’s nothing to predict from.',
    };
  }
  const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const next = addDays(last, avg);
  return {
    logged: starts.length,
    ready: true,
    last,
    dayOfCycle,
    avgLength: avg,
    shortest: Math.min(...lengths),
    longest: Math.max(...lengths),
    variation: Math.max(...lengths) - Math.min(...lengths),
    next,
    daysUntilNext: Math.round((new Date(`${next}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000),
    basis: `${lengths.length} cycle${lengths.length === 1 ? '' : 's'} of your own`,
    // Only ever shown next to your own average, as context for it.
    typicalLength: CYCLE_TYPICAL.length,
  };
};

/** Symptoms you've actually recorded, most often first. */
export const symptomCounts = (cycles = []) => {
  const counts = new Map();
  for (const cycle of cycles) {
    for (const symptom of cycle.symptoms || []) counts.set(symptom, (counts.get(symptom) || 0) + 1);
  }
  return [...counts.entries()].map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times);
};
