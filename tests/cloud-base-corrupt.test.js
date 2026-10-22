import { describe, it, expect, beforeEach } from 'vitest';
import { readBaseState, hasQueuedCloud } from '../src/lib/cloud.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

describe('cloud sync base and queue read from localStorage', () => {
  it('returns a saved base object', () => {
    store.set('forq-cloud-base-v2', JSON.stringify({ version: 3 }));
    expect(readBaseState()).toEqual({ version: 3 });
  });
  it.each(['5', '[]', '"x"', 'true', '{bad'])('ignores corrupt base %s', (raw) => {
    store.set('forq-cloud-base-v2', raw);
    expect(readBaseState()).toBeNull();
  });
  it.each(['5', '[]', '"x"', 'true', '{bad', 'null'])('ignores corrupt queue %s', (raw) => {
    store.set('forq-cloud-queue-v1', raw);
    expect(hasQueuedCloud()).toBe(false);
  });
});
