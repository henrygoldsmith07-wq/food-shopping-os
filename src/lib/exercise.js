/**
 * Exercise: what you did, roughly what it cost you, and what that does to the
 * day's allowance.
 *
 * Calories burned are an *estimate* and are labelled as one everywhere they
 * appear. The arithmetic is the standard MET equation — kcal ≈ MET × 3.5 ×
 * kg ÷ 200 × minutes — which needs your weight; without one the app says so
 * instead of quietly assuming a body.
 *
 * There is no HealthKit, Health Connect or watch API in a web app, so nothing
 * here pretends to sync. What it does instead is read the file those apps
 * export, which is the honest version of the same job.
 */

import { WORKOUT_TYPES, workoutBy } from '../data/workouts.js';
import { addDays, dayStamp, weekDates } from './kitchen.js';
import { isUnderEighteen, YOUTH_COPY } from './youth.js';

const round = (n) => Math.round(n);

/** The MET for a workout at a given effort. */
export const metFor = (type, intensity = 'moderate') => {
  const found = workoutBy[type];
  if (!found) return null;
  return found.met[intensity] ?? found.met.moderate;
};

/**
 * Estimated burn. Returns null rather than a number when there's no weight to
 * compute from — an invented body would make every figure here fiction.
 */
export const burnFor = ({ type, minutes, intensity = 'moderate' }, weightKg) => {
  const met = metFor(type, intensity);
  if (!met || !weightKg || !minutes) return null;
  return round(((met * 3.5 * weightKg) / 200) * minutes);
};

/** A workout as it should be stored: validated, with its estimate attached. */
export const buildWorkout = (draft, weightKg) => {
  const type = workoutBy[draft.type] ? draft.type : WORKOUT_TYPES[0].key;
  const minutes = Math.max(1, Math.min(600, Math.round(Number(draft.minutes) || 0)));
  const intensity = ['easy', 'moderate', 'hard'].includes(draft.intensity) ? draft.intensity : 'moderate';
  const workout = {
    type,
    minutes,
    intensity,
    date: draft.date,
    note: String(draft.note || '').slice(0, 120),
  };
  if (draft.distanceKm) workout.distanceKm = Math.max(0, Math.round(Number(draft.distanceKm) * 100) / 100);
  if (draft.steps) workout.steps = Math.max(0, Math.round(Number(draft.steps)));
  if (draft.sets) workout.sets = Math.max(0, Math.round(Number(draft.sets)));
  if (draft.reps) workout.reps = Math.max(0, Math.round(Number(draft.reps)));
  const kcal = burnFor(workout, weightKg);
  return { ...workout, kcal, estimated: kcal !== null };
};

/* ---------- Reading a week back ---------- */

export const workoutsOn = (workouts = [], date) => workouts.filter((w) => w.date === date);

export const burnedOn = (workouts = [], date) =>
  workoutsOn(workouts, date).reduce((sum, w) => sum + (Number(w.kcal) || 0), 0);

/** The week's training: sessions, minutes, estimated burn, and by what. */
export const weekSummary = (workouts = [], today = dayStamp()) => {
  const week = weekDates(today);
  const rows = workouts.filter((w) => week.includes(w.date));
  const byType = new Map();
  for (const w of rows) {
    const found = byType.get(w.type) || { type: w.type, label: workoutBy[w.type]?.label || w.type, sessions: 0, minutes: 0, kcal: 0, distanceKm: 0 };
    found.sessions += 1;
    found.minutes += w.minutes || 0;
    found.kcal += Number(w.kcal) || 0;
    found.distanceKm += Number(w.distanceKm) || 0;
    byType.set(w.type, found);
  }
  return {
    sessions: rows.length,
    minutes: rows.reduce((s, w) => s + (w.minutes || 0), 0),
    kcal: round(rows.reduce((s, w) => s + (Number(w.kcal) || 0), 0)),
    days: new Set(rows.map((w) => w.date)).size,
    distanceKm: Math.round(rows.reduce((s, w) => s + (Number(w.distanceKm) || 0), 0) * 10) / 10,
    steps: rows.reduce((s, w) => s + (Number(w.steps) || 0), 0),
    byType: [...byType.values()].sort((a, b) => b.minutes - a.minutes),
  };
};

/** Runs of days with a session, for the training streak. */
export const activeStreak = (workouts = [], today = dayStamp()) => {
  const dates = new Set(workouts.map((w) => w.date));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;
  let run = 0;
  while (dates.has(cursor)) {
    run += 1;
    cursor = addDays(cursor, -1);
  }
  return run;
};

/* ---------- What it does to the day ---------- */

/**
 * The day's allowance with training taken into account — but only if you asked
 * for that. Eating back an estimate is a choice, and a contested one, so it is
 * off unless you turn it on and the figure always says it's an estimate.
 */
export const activityAdjustment = (state, today = dayStamp()) => {
  const burned = round(burnedOn(state.workouts || [], today));
  const base = state.targets?.kcal || 0;
  // Under 18 the choice isn't offered: turning training into calories to be
  // eaten back is the "earn your food" framing, whatever the toggle says.
  if (isUnderEighteen(state)) {
    return { burned, counted: false, base, adjusted: base, note: YOUTH_COPY.exercise, youth: true };
  }
  const on = Boolean(state.countExerciseKcal);
  return {
    burned,
    counted: on,
    base,
    adjusted: on ? base + burned : base,
    note: on
      ? 'Today’s target includes your estimated burn. It is an estimate — trackers and formulas both run high.'
      : 'Exercise isn’t added to your target. Turn it on under Exercise if you’d rather eat it back.',
  };
};

/* ---------- Importing from a health app ---------- */

const HEADER_ALIASES = {
  date: ['date', 'start', 'startdate', 'start date', 'day'],
  type: ['type', 'activity', 'workout', 'activity type', 'workouttype'],
  minutes: ['minutes', 'duration', 'mins', 'duration (min)', 'durationminutes'],
  kcal: ['kcal', 'calories', 'energy', 'active energy', 'activeenergy', 'energy burned'],
  distanceKm: ['distance', 'km', 'distance (km)', 'distancekm'],
  steps: ['steps', 'step count', 'stepcount'],
};

const TYPE_ALIASES = [
  [/strength|weight|lift|gym|resistance/i, 'strength'],
  [/run|jog/i, 'running'],
  [/cycl|bike|biking|spin/i, 'cycling'],
  [/walk|hike|step/i, 'walking'],
  [/swim/i, 'swimming'],
  [/yoga|pilates|stretch/i, 'yoga'],
  [/hiit|interval|circuit|crossfit/i, 'hiit'],
  [/row/i, 'rowing'],
];

const normalise = (header) => String(header || '').trim().toLowerCase();

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

export const workoutTypeFrom = (text) => {
  const match = TYPE_ALIASES.find(([re]) => re.test(String(text || '')));
  return match ? match[1] : 'other';
};

const parseDate = (text) => {
  const raw = String(text || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  return null;
};

/**
 * Parse the CSV that Apple Health, Health Connect and most watch apps can
 * export. Rows it can't read are counted and reported rather than dropped
 * silently, and a row with no date or no duration isn't a workout.
 */
export const parseWorkoutCsv = (text, weightKg) => {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { workouts: [], skipped: 0, error: 'That doesn’t look like an export — one header row and one row per workout.' };

  const headers = lines[0].split(',');
  const map = columnMap(headers);
  if (map.date === undefined || map.minutes === undefined) {
    return { workouts: [], skipped: 0, error: 'I need at least a date column and a duration column. The header row is what I read.' };
  }

  const workouts = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const date = parseDate(cells[map.date]);
    const minutes = Number(String(cells[map.minutes] ?? '').replace(/[^\d.]/g, ''));
    if (!date || !(minutes > 0)) {
      skipped += 1;
      continue;
    }
    const type = workoutTypeFrom(map.type !== undefined ? cells[map.type] : '');
    const built = buildWorkout({
      date,
      type,
      minutes,
      distanceKm: map.distanceKm !== undefined ? Number(String(cells[map.distanceKm] ?? '').replace(/[^\d.]/g, '')) : 0,
      steps: map.steps !== undefined ? Number(String(cells[map.steps] ?? '').replace(/[^\d.]/g, '')) : 0,
      note: 'imported',
    }, weightKg);
    // An exported energy figure beats our estimate — it is at least measured.
    const exported = map.kcal !== undefined ? Number(String(cells[map.kcal] ?? '').replace(/[^\d.]/g, '')) : NaN;
    workouts.push(Number.isFinite(exported) && exported > 0
      ? { ...built, kcal: round(exported), estimated: false, source: 'import' }
      : { ...built, source: 'import' });
  }
  return { workouts, skipped, error: workouts.length ? null : 'No rows in that file had both a date and a duration.' };
};
