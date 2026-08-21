/**
 * Workout types and their METs.
 *
 * A MET is the standard multiple-of-resting-metabolism figure from the
 * Compendium of Physical Activities — the same table fitness apps use. It is
 * what makes a calorie estimate arithmetic rather than a guess, and it is
 * still an estimate: two people doing the same hour burn different amounts.
 *
 * `fields` names the extra things worth recording for that kind of training,
 * so a run asks for distance and a gym session asks for sets.
 */

const type = (key, label, emoji, met, fields = []) => ({ key, label, emoji, met, fields });

export const WORKOUT_TYPES = [
  type('walking', 'Walking', '🚶', { easy: 2.8, moderate: 3.5, hard: 5.0 }, ['distanceKm', 'steps']),
  type('running', 'Running', '🏃', { easy: 7.0, moderate: 9.8, hard: 12.8 }, ['distanceKm']),
  type('cycling', 'Cycling', '🚴', { easy: 4.0, moderate: 8.0, hard: 12.0 }, ['distanceKm']),
  type('strength', 'Strength training', '🏋️', { easy: 3.5, moderate: 5.0, hard: 6.0 }, ['sets', 'reps']),
  type('swimming', 'Swimming', '🏊', { easy: 5.3, moderate: 7.0, hard: 10.0 }, ['distanceKm']),
  type('hiit', 'HIIT / circuits', '🔥', { easy: 6.0, moderate: 8.0, hard: 10.0 }, []),
  type('rowing', 'Rowing', '🚣', { easy: 4.8, moderate: 7.0, hard: 8.5 }, ['distanceKm']),
  type('yoga', 'Yoga / pilates', '🧘', { easy: 2.3, moderate: 3.0, hard: 4.0 }, []),
  type('sport', 'Team sport', '⚽', { easy: 5.0, moderate: 7.0, hard: 10.0 }, []),
  type('other', 'Something else', '🤸', { easy: 3.0, moderate: 4.5, hard: 6.0 }, []),
];

export const workoutBy = Object.fromEntries(WORKOUT_TYPES.map((t) => [t.key, t]));

export const INTENSITIES = [
  { key: 'easy', label: 'Easy', blurb: 'Could hold a conversation' },
  { key: 'moderate', label: 'Moderate', blurb: 'Breathing harder, still steady' },
  { key: 'hard', label: 'Hard', blurb: 'Working, and glad when it ends' },
];

export const EXTRA_FIELDS = {
  distanceKm: { label: 'Distance', unit: 'km', step: 0.5 },
  steps: { label: 'Steps', unit: '', step: 500 },
  sets: { label: 'Sets', unit: '', step: 1 },
  reps: { label: 'Reps', unit: '', step: 1 },
};

/**
 * What a phone or watch can actually give a web app.
 *
 * None of these have a browser API a PWA can call: HealthKit is native-only,
 * Health Connect is an Android app permission, and watch data lands in one of
 * those two. What every one of them *can* do is export a file — so that is
 * what the importer reads, and the app says as much rather than showing a
 * "Connect" button that could never work.
 */
export const HEALTH_SOURCES = [
  {
    id: 'apple',
    name: 'Apple Health',
    how: 'Health app → your profile picture → Export All Health Data. Unzip it, or use any app that exports workouts as CSV.',
  },
  {
    id: 'google',
    name: 'Google Health Connect',
    how: 'Health Connect → Data and access → Exercise → Export. Most Android trackers can also export a CSV directly.',
  },
  {
    id: 'watch',
    name: 'Garmin, Fitbit, Polar, Strava',
    how: 'Each has a "download your data" or "export activities" option that produces a CSV of sessions.',
  },
];
