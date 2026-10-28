import { describe, it, expect } from 'vitest';
import { lastTicked, undoLabel } from '../src/lib/trip-undo.js';

const now = 1_000_000_000;
describe('lastTicked', () => {
  it('returns the newest recent tick', () => {
    const list = [
      { id: 'a', name: 'Milk', checked: true, checkedAt: now - 5000 },
      { id: 'b', name: 'Eggs', checked: true, checkedAt: now - 1000 },
      { id: 'c', name: 'Rice', checked: false, checkedAt: now },
    ];
    expect(lastTicked(list, now).id).toBe('b');
  });
  it('ignores old, unstamped and junk rows', () => {
    expect(lastTicked([{ id: 'a', checked: true, checkedAt: now - 11 * 60000 }, { id: 'b', checked: true }, null], now)).toBe(null);
    expect(lastTicked(undefined, now)).toBe(null);
  });
  it('labels the row', () => {
    expect(undoLabel({ name: ' Milk ' })).toBe('Ticked Milk');
    expect(undoLabel({})).toBe('Ticked an item');
  });
});
