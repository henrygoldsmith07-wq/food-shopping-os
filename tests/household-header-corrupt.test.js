import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { askServerAi } from '../src/lib/ai-relay.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }));
});
afterEach(() => { vi.restoreAllMocks(); });

const headerFor = async (raw) => {
  if (raw !== undefined) store.set('forq-cloud-meta-v1', raw);
  await askServerAi({ task: 'x', prompt: 'hi', context: {} }).catch(() => {});
  return globalThis.fetch.mock.calls[0]?.[1]?.headers || {};
};

describe('AI relay household header', () => {
  it('sends a string household id', async () => {
    expect((await headerFor(JSON.stringify({ householdId: 'h1' })))['x-forq-household-id']).toBe('h1');
  });
  it.each([JSON.stringify({ householdId: 5 }), JSON.stringify({ householdId: {} }), '5', '[]', '{bad'])(
    'omits the header for corrupt meta %s',
    async (raw) => {
      expect((await headerFor(raw))['x-forq-household-id']).toBeUndefined();
    },
  );
});
