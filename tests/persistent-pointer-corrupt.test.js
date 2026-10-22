import { describe, it, expect, beforeEach } from 'vitest';
import { readPointer, POINTER_KEY } from '../src/lib/persistent-state.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

describe('readPointer', () => {
  it('returns a saved pointer object', () => {
    store.set(POINTER_KEY, JSON.stringify({ sequence: 4 }));
    expect(readPointer()).toEqual({ sequence: 4 });
  });
  it.each(['5', '[]', '"x"', 'true', '{bad', 'null'])('ignores corrupt pointer %s', (raw) => {
    store.set(POINTER_KEY, raw);
    expect(readPointer()).toBeNull();
  });
});
