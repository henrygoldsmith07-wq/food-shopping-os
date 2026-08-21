import { describe, it, expect } from 'vitest';
import {
  activeStreak, activityAdjustment, buildWorkout, burnFor, burnedOn, metFor, parseWorkoutCsv,
  weekSummary, workoutTypeFrom, workoutsOn,
} from '../src/lib/exercise.js';
import { HEALTH_SOURCES, WORKOUT_TYPES, workoutBy } from '../src/data/workouts.js';
import { addDays } from '../src/lib/kitchen.js';

const TODAY = '2026-07-28'; // a Tuesday
const w = (date, type, minutes, over = {}) => ({ id: `${type}-${date}`, date, type, minutes, kcal: 0, ...over });

describe('the burn estimate', () => {
  it('takes its MET from the effort you say you put in', () => {
    expect(metFor('running', 'easy')).toBe(7);
    expect(metFor('running', 'hard')).toBe(12.8);
    expect(metFor('running', 'nonsense')).toBe(9.8); // falls back to moderate
    expect(metFor('interpretive dance')).toBe(null);
  });

  it('is the standard MET equation, not a guess', () => {
    // 9.8 MET × 3.5 × 80 kg ÷ 200 × 30 min
    expect(burnFor({ type: 'running', minutes: 30 }, 80)).toBe(412);
    expect(burnFor({ type: 'yoga', minutes: 60, intensity: 'easy' }, 80)).toBe(193);
  });

  it('returns nothing at all without a weight, rather than inventing a body', () => {
    expect(burnFor({ type: 'running', minutes: 30 }, null)).toBe(null);
    expect(burnFor({ type: 'running', minutes: 30 }, 0)).toBe(null);
    expect(burnFor({ type: 'running', minutes: 0 }, 80)).toBe(null);
  });
});

describe('building a workout', () => {
  it('bounds the duration and falls back to a known type', () => {
    const long = buildWorkout({ type: 'running', minutes: 5000, date: TODAY }, 80);
    expect(long.minutes).toBe(600);
    expect(buildWorkout({ type: 'running', minutes: 0, date: TODAY }, 80).minutes).toBe(1);
    expect(buildWorkout({ type: 'quidditch', minutes: 30, date: TODAY }, 80).type).toBe(WORKOUT_TYPES[0].key);
    expect(buildWorkout({ type: 'running', minutes: 30, intensity: 'brutal', date: TODAY }, 80).intensity).toBe('moderate');
  });

  it('keeps the extras that belong to that kind of training, and trims a long note', () => {
    const run = buildWorkout({ type: 'running', minutes: 32, distanceKm: 5.234, date: TODAY, note: 'x'.repeat(400) }, 80);
    expect(run.distanceKm).toBe(5.23);
    expect(run.note.length).toBe(120);
    expect(run.steps).toBeUndefined();
    const gym = buildWorkout({ type: 'strength', minutes: 45, sets: '12', reps: 8.6, date: TODAY }, 80);
    expect(gym.sets).toBe(12);
    expect(gym.reps).toBe(9);
  });

  it('marks the calorie figure as an estimate — or leaves it out entirely', () => {
    const withWeight = buildWorkout({ type: 'cycling', minutes: 60, date: TODAY }, 80);
    expect(withWeight.kcal).toBe(672);
    expect(withWeight.estimated).toBe(true);
    const without = buildWorkout({ type: 'cycling', minutes: 60, date: TODAY }, null);
    expect(without.kcal).toBe(null);
    expect(without.estimated).toBe(false);
  });
});

describe('reading a week back', () => {
  const week = [
    w(addDays(TODAY, -1), 'running', 32, { kcal: 400, distanceKm: 5.2 }),
    w(addDays(TODAY, -1), 'yoga', 20, { kcal: 70 }),
    w(TODAY, 'strength', 45, { kcal: 260 }),
    w(addDays(TODAY, -20), 'cycling', 90, { kcal: 900 }), // last month, not this week
  ];

  it('counts only this week, and groups by what you did', () => {
    const summary = weekSummary(week, TODAY);
    expect(summary.sessions).toBe(3);
    expect(summary.minutes).toBe(97);
    expect(summary.kcal).toBe(730);
    expect(summary.days).toBe(2);
    expect(summary.distanceKm).toBe(5.2);
    expect(summary.byType.map((t) => t.type)).toEqual(['strength', 'running', 'yoga']);
    expect(summary.byType[0].label).toBe(workoutBy.strength.label);
  });

  it('is zeroes, not blanks, when nothing was logged', () => {
    const summary = weekSummary([], TODAY);
    expect(summary).toMatchObject({ sessions: 0, minutes: 0, kcal: 0, days: 0, byType: [] });
  });

  it('picks a day out and adds up what it cost', () => {
    expect(workoutsOn(week, TODAY)).toHaveLength(1);
    expect(burnedOn(week, addDays(TODAY, -1))).toBe(470);
    expect(burnedOn(week, addDays(TODAY, -5))).toBe(0);
  });

  it('counts a training streak, and lets today still be ahead of you', () => {
    const days = [w(addDays(TODAY, -2), 'running', 30), w(addDays(TODAY, -1), 'yoga', 30)];
    expect(activeStreak(days, TODAY)).toBe(2); // yesterday still counts; today is not over
    expect(activeStreak([...days, w(TODAY, 'walking', 30)], TODAY)).toBe(3);
    expect(activeStreak([w(addDays(TODAY, -4), 'running', 30)], TODAY)).toBe(0);
    expect(activeStreak([], TODAY)).toBe(0);
  });
});

describe('what exercise does to the day', () => {
  const state = (over = {}) => ({ targets: { kcal: 2000 }, workouts: [w(TODAY, 'running', 30, { kcal: 412 })], ...over });

  it('leaves your target alone unless you asked for it back', () => {
    const off = activityAdjustment(state(), TODAY);
    expect(off.counted).toBe(false);
    expect(off.burned).toBe(412);
    expect(off.adjusted).toBe(2000);
    expect(off.note).toMatch(/isn’t added/);
  });

  it('adds the estimate when you turn it on, and still calls it an estimate', () => {
    const on = activityAdjustment(state({ countExerciseKcal: true }), TODAY);
    expect(on.adjusted).toBe(2412);
    expect(on.note).toMatch(/estimate/);
  });
});

describe('importing an export', () => {
  it('says what it needs instead of failing quietly', () => {
    expect(parseWorkoutCsv('', 80).error).toMatch(/doesn’t look like an export/);
    expect(parseWorkoutCsv('date,type,minutes', 80).error).toMatch(/doesn’t look like an export/);
    expect(parseWorkoutCsv('name,notes\nrun,good', 80).error).toMatch(/date column and a duration column/);
  });

  it('reads the columns health apps actually write', () => {
    const { workouts, skipped, error } = parseWorkoutCsv([
      'Start Date,Activity Type,Duration (min),Distance (km),Active Energy',
      '2026-07-27,Outdoor Run,32,5.2,340',
      '27/07/2026,Traditional Strength Training,45,,',
    ].join('\n'), 80);
    expect(error).toBe(null);
    expect(skipped).toBe(0);
    expect(workouts).toHaveLength(2);
    expect(workouts[0]).toMatchObject({ date: '2026-07-27', type: 'running', minutes: 32, distanceKm: 5.2, source: 'import' });
    expect(workouts[1]).toMatchObject({ date: '2026-07-27', type: 'strength', minutes: 45 });
  });

  it('trusts a measured energy figure over its own estimate', () => {
    const { workouts } = parseWorkoutCsv('date,type,minutes,calories\n2026-07-27,Running,32,340', 80);
    expect(workouts[0].kcal).toBe(340);
    expect(workouts[0].estimated).toBe(false);
    const noEnergy = parseWorkoutCsv('date,type,minutes\n2026-07-27,Running,32', 80);
    expect(noEnergy.workouts[0].kcal).toBe(439);
    expect(noEnergy.workouts[0].estimated).toBe(true);
  });

  it('counts the rows it could not read rather than dropping them silently', () => {
    const { workouts, skipped } = parseWorkoutCsv([
      'date,type,minutes',
      '2026-07-27,Running,32',
      ',Running,20',
      '2026-07-26,Yoga,',
    ].join('\n'), 80);
    expect(workouts).toHaveLength(1);
    expect(skipped).toBe(2);
    expect(parseWorkoutCsv('date,type,minutes\n,Running,', 80).error).toMatch(/No rows/);
  });

  it('maps the many names health apps give the same activity', () => {
    expect(workoutTypeFrom('Outdoor Cycling')).toBe('cycling');
    expect(workoutTypeFrom('Functional Strength Training')).toBe('strength');
    expect(workoutTypeFrom('Pool Swim')).toBe('swimming');
    expect(workoutTypeFrom('HIIT')).toBe('hiit');
    expect(workoutTypeFrom('Indoor Walk')).toBe('walking');
    expect(workoutTypeFrom('Kayaking')).toBe('other');
    expect(workoutTypeFrom('')).toBe('other');
  });

  it('tells you how to get the file out of each platform, with no fake connect button', () => {
    expect(HEALTH_SOURCES.map((s) => s.id)).toEqual(['apple', 'google', 'watch']);
    for (const source of HEALTH_SOURCES) expect(source.how).toMatch(/export/i);
  });
});
