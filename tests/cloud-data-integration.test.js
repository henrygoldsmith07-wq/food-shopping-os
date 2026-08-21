import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasQueuedCloud, pullCloud, pushCloud, retryQueuedCloud } from '../src/lib/cloud.js';

const META_KEY = 'forq-cloud-meta-v1';
const QUEUE_KEY = 'forq-cloud-queue-v1';

function cloudServer(initialState = { version: 1, householdId: 'household-1', state: { onboarded: true, name: 'Local' } }) {
  let remote = structuredClone(initialState);
  let online = true;
  const fetchMock = vi.fn(async (_url, options = {}) => {
    if (!online) throw new Error('network unavailable');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (body.version !== remote.version) {
        return new Response(JSON.stringify({ error: 'conflict' }), { status: 409 });
      }
      remote = { ...remote, version: remote.version + 1, state: body.state };
      return new Response(JSON.stringify({ version: remote.version }), { status: 200 });
    }
    return new Response(JSON.stringify(remote), { status: 200 });
  });
  return {
    fetchMock,
    setOnline(value) { online = value; },
    setRemote(next) { remote = structuredClone(next); },
  };
}

describe('cloud data integration', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.restoreAllMocks();
  });

  it('reconciles a queued offline write when the connection returns', async () => {
    const server = cloudServer();
    server.setOnline(false);
    vi.stubGlobal('fetch', server.fetchMock);
    const meta = { householdId: 'household-1', version: 1, deviceId: 'device-123456' };

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const queued = await pushCloud({ onboarded: true, name: 'Offline edit' }, meta);
    expect(queued.status.kind).toBe('offline');
    expect(hasQueuedCloud()).toBe(true);

    server.setOnline(true);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const retried = await retryQueuedCloud();
    expect(retried.status.kind).toBe('ready');
    expect(hasQueuedCloud()).toBe(false);
    expect(server.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a newer remote version but never replaces newer local state', async () => {
    const server = cloudServer({ version: 4, householdId: 'household-1', state: { name: 'Remote' } });
    vi.stubGlobal('fetch', server.fetchMock);
    const newer = await pullCloud({ householdId: 'household-1', version: 3, deviceId: 'device-123456' });
    expect(newer.state).toEqual({ name: 'Remote' });
    expect(newer.meta.version).toBe(4);

    server.setRemote({ version: 3, householdId: 'household-1', state: { name: 'Old remote' } });
    localStorage.setItem(META_KEY, JSON.stringify({ householdId: 'household-1', version: 5, deviceId: 'device-123456' }));
    const stale = await pullCloud({ householdId: 'household-1', version: 5, deviceId: 'device-123456' });
    expect(stale.state).toBeNull();
    expect(stale.meta.version).toBe(5);
  });

  it('keeps an optimistic-concurrency conflict queued for user resolution', async () => {
    const server = cloudServer({ version: 2, householdId: 'household-1', state: { name: 'Remote' } });
    vi.stubGlobal('fetch', server.fetchMock);
    const result = await pushCloud({ onboarded: true, name: 'Local' }, {
      householdId: 'household-1', version: 1, deviceId: 'device-123456',
    });
    expect(result.status.kind).toBe('conflict');
    expect(hasQueuedCloud()).toBe(false);
  });
});
