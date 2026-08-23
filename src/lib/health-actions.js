/**
 * Everything you can record about your body and your training.
 *
 * These are store actions, kept out of the store itself so both files stay
 * readable. Each one takes the `set` the provider owns, so they behave exactly
 * as if they were written inline — the only thing that moved is the text.
 *
 * The rule they all share: a reading is bounded before it is kept. A waist of
 * 4,000 cm or a sleep of 90 hours is a typo, not a measurement, and letting one
 * in would poison every average drawn from it.
 */

import { measurementBy, vitalBy } from '../data/health.js';
import { buildWorkout } from './exercise.js';
import { targetsFor } from './goals.js';
import { uid } from './state.js';

/** How many progress photos fit in localStorage without crowding everything else out. */
export const PHOTO_LIMIT = 12;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const note = (text, max = 120) => String(text || '').slice(0, max);

/**
 * A weight given at setup is a reading you took, so it starts the series rather
 * than sitting apart from it — otherwise the body page claims to know nothing
 * about a number you just typed.
 */
export const seedMeasurements = (body, day, existing = []) =>
  (body?.weightKg
    ? [{ id: uid('m'), key: 'weight', value: body.weightKg, date: day }]
    : existing);

export const healthActions = (set) => ({
  /* ---------- Body ---------- */

  /** One reading, on one day. Logging the same thing again replaces it. */
  addMeasurement: ({ key, value, date }) =>
    set((s) => {
      const on = date || s.day;
      const number = Number(value);
      if (!measurementBy[key] || !Number.isFinite(number)) return {};
      const bounded = clamp(number, measurementBy[key].min, measurementBy[key].max);
      const rest = s.measurements.filter((m) => !(m.key === key && m.date === on));
      const measurements = [...rest, { id: uid('m'), key, value: bounded, date: on }];
      // Your weight is your weight — the goals maths should see the newest.
      const body = key === 'weight' ? { ...s.body, weightKg: bounded } : s.body;
      return { measurements, body, targets: s.targetMode === 'auto' ? targetsFor({ ...s, body }) : s.targets };
    }),
  removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),

  /* ---------- Vitals ---------- */

  addVital: ({ key, values, date, note: text }) =>
    set((s) => (vitalBy[key]
      ? { vitals: [...s.vitals, { id: uid('v'), key, values, date: date || s.day, note: note(text) }] }
      : {})),
  removeVital: (id) => set((s) => ({ vitals: s.vitals.filter((v) => v.id !== id) })),

  /* ---------- Rest and load ---------- */

  logSleep: ({ date, hours, quality, note: text }) =>
    set((s) => {
      const on = date || s.day;
      const entry = {
        id: uid('sl'),
        date: on,
        hours: clamp(Number(hours) || 0, 0, 24),
        quality: clamp(Math.round(Number(quality) || 0), 0, 5),
        note: note(text),
      };
      return { sleep: [...s.sleep.filter((x) => x.date !== on), entry] };
    }),
  logStress: ({ date, level, note: text }) =>
    set((s) => {
      const on = date || s.day;
      const entry = {
        id: uid('st'),
        date: on,
        level: clamp(Math.round(Number(level) || 0), 1, 5),
        note: note(text),
      };
      return { stress: [...s.stress.filter((x) => x.date !== on), entry] };
    }),

  /* ---------- Cycle ---------- */

  /** A period: its start, and its end when you know it. */
  logCycle: ({ start, end, flow, symptoms }) =>
    set((s) => {
      if (!start) return {};
      const rest = s.cycles.filter((c) => c.start !== start);
      return {
        cycles: [...rest, {
          id: uid('c'),
          start,
          end: end || null,
          flow: flow || null,
          symptoms: Array.isArray(symptoms) ? symptoms.slice(0, 8) : [],
        }].sort((a, b) => a.start.localeCompare(b.start)),
      };
    }),
  removeCycle: (id) => set((s) => ({ cycles: s.cycles.filter((c) => c.id !== id) })),
  /** Turning it off hides the page; what you logged stays where it is.
   *  The cycle view is an optional tool, so opting in grants it either way. */
  setTrackCycle: (on) => set((s) => {
    const enable = Boolean(on);
    const tools = new Set(s.enabledTools || []);
    if (enable) tools.add('cycle'); else tools.delete('cycle');
    return { trackCycle: enable, enabledTools: [...tools] };
  }),

  /* ---------- Photos ---------- */

  /**
   * Progress photos start locally and join household sync only after sign-in.
   * They are shrunk and capped because silently filling localStorage would
   * break everything else in here.
   */
  addPhoto: ({ thumb, date, note: text }) =>
    set((s) => {
      if (!thumb) return {};
      const photos = [...s.photos, { id: uid('ph'), thumb, date: date || s.day, note: note(text, 80) }];
      return { photos: photos.slice(-PHOTO_LIMIT) };
    }),
  removePhoto: (id) => set((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),

  /* ---------- Exercise ---------- */

  logWorkout: (draft) =>
    set((s) => ({
      workouts: [...s.workouts, { id: uid('w'), ...buildWorkout({ ...draft, date: draft.date || s.day }, s.body?.weightKg) }],
    })),
  removeWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),
  /** An export can be pasted twice; the same session on the same day is one session. */
  importWorkouts: (list) =>
    set((s) => {
      const seen = new Set(s.workouts.map((w) => `${w.date}|${w.type}|${w.minutes}`));
      const fresh = list
        .filter((w) => !seen.has(`${w.date}|${w.type}|${w.minutes}`))
        .map((w) => ({ id: uid('w'), ...w }));
      return fresh.length ? { workouts: [...s.workouts, ...fresh] } : {};
    }),
  setCountExerciseKcal: (on) => set({ countExerciseKcal: Boolean(on) }),
});
