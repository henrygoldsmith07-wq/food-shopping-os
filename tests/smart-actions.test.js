import { describe, it, expect } from 'vitest';
import { smartActions } from '../src/lib/smart-actions.js';

const makeStore = (placeReminders = []) => {
  let state = { placeReminders };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { a: smartActions(set), get: () => state.placeReminders };
};

describe('smart place reminder actions', () => {
  it('adds a valid reminder with trimmed label and clamped radius', () => {
    const { a, get } = makeStore();
    a.addPlaceReminder({ label: '  Tesco  ', latitude: '51.5', longitude: -0.1, radius: 5000 });
    expect(get()).toHaveLength(1);
    expect(get()[0]).toMatchObject({ label: 'Tesco', latitude: 51.5, longitude: -0.1, radius: 1000, on: true });
    a.addPlaceReminder({ latitude: 1, longitude: 1, radius: 10 });
    expect(get()[1]).toMatchObject({ label: 'Shopping reminder', radius: 50 });
  });
  it('rejects out-of-range, non-numeric and blank coordinates (blank must not become 0,0)', () => {
    const { a, get } = makeStore();
    a.addPlaceReminder({ latitude: 91, longitude: 0 });
    a.addPlaceReminder({ latitude: 0, longitude: 181 });
    a.addPlaceReminder({ latitude: 'x', longitude: 0 });
    a.addPlaceReminder({ latitude: '', longitude: '' });
    a.addPlaceReminder({ latitude: null, longitude: undefined });
    expect(get()).toEqual([]);
  });
  it('caps at 12 reminders', () => {
    const { a, get } = makeStore(Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, on: true })));
    a.addPlaceReminder({ latitude: 1, longitude: 1 });
    expect(get()).toHaveLength(12);
  });
  it('toggles and removes only the matching id', () => {
    const { a, get } = makeStore([{ id: 'a', on: true }, { id: 'b', on: true }]);
    a.togglePlaceReminder('a');
    expect(get().map((p) => p.on)).toEqual([false, true]);
    a.removePlaceReminder('b');
    expect(get().map((p) => p.id)).toEqual(['a']);
  });
});
