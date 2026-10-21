import { describe, it, expect, beforeEach } from 'vitest';
import { selectedCloudHouseholdId } from '../src/lib/cloud.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

describe('cloud meta read from localStorage', () => {
  it('returns the saved household id', () => {
    const key = 'forq-cloud-meta-v1';
    store.set(key, JSON.stringify({ householdId: 'h1' }));
    expect(selectedCloudHouseholdId()).toBe('h1');
  });
  it.each(['null', '5', '[]', '"x"', '{bad'])('survives corrupt value %s', (raw) => {
    store.set('forq-cloud-meta-v1', raw);
    expect(selectedCloudHouseholdId()).toBeNull();
  });
});
