import { describe, it, expect } from 'vitest';
import { healthActions, PHOTO_LIMIT } from '../src/lib/health-actions.js';

const makeStore = (init = {}) => {
  let state = { day: '2026-10-21', measurements: [], workouts: [], sleep: [], photos: [], body: {}, targetMode: 'manual', targets: {}, ...init };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { a: healthActions(set), get: () => state };
};

describe('importWorkouts', () => {
  it('skips repeats of existing sessions and repeats within the same paste', () => {
    const { a, get } = makeStore({ workouts: [{ id: 'w0', date: 'd1', type: 'run', minutes: 30 }] });
    a.importWorkouts([
      { date: 'd1', type: 'run', minutes: 30 },
      { date: 'd2', type: 'run', minutes: 20 },
      { date: 'd2', type: 'run', minutes: 20 },
    ]);
    expect(get().workouts).toHaveLength(2);
  });
  it('ignores a non-array or junk entries instead of crashing', () => {
    const { a, get } = makeStore();
    expect(() => a.importWorkouts(null)).not.toThrow();
    a.importWorkouts([null, 'x', { date: 'd', type: 't', minutes: 1 }]);
    expect(get().workouts).toHaveLength(1);
  });
});

describe('bounded readings', () => {
  it('logSleep keeps one entry per day and clamps hours', () => {
    const { a, get } = makeStore();
    a.logSleep({ hours: 90, quality: 9 });
    a.logSleep({ hours: 7, quality: 4 });
    expect(get().sleep).toHaveLength(1);
    expect(get().sleep[0]).toMatchObject({ hours: 7, quality: 4 });
  });
  it('addPhoto keeps only the newest PHOTO_LIMIT', () => {
    const { a, get } = makeStore();
    for (let i = 0; i < PHOTO_LIMIT + 3; i += 1) a.addPhoto({ thumb: `t${i}` });
    expect(get().photos).toHaveLength(PHOTO_LIMIT);
    expect(get().photos.at(-1).thumb).toBe(`t${PHOTO_LIMIT + 2}`);
    a.addPhoto({});
    expect(get().photos).toHaveLength(PHOTO_LIMIT);
  });
});
