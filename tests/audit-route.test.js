import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The audit panel route. It reads its household's events through the real
 * Redis document store (in-memory here), exercising the cursor's projection —
 * which used to throw on every call because the cursor had no `.project`.
 */

const store = vi.hoisted(() => ({ kv: new Map(), sets: new Map(), expiry: new Map(), scans: [], calls: [] }));

vi.mock('@upstash/redis', () => {
  const setOf = (key) => {
    if (!store.sets.has(key)) store.sets.set(key, new Set());
    return store.sets.get(key);
  };
  const commands = {
    get: async (key) => (store.kv.has(key) ? store.kv.get(key) : null),
    set: async (key, value, options = {}) => {
      if (options.nx && store.kv.has(key)) return null;
      store.kv.set(key, value);
      if (options.px || options.pxat) store.expiry.set(key, options.pxat || Date.now() + options.px);
      return 'OK';
    },
    mget: async (...keys) => keys.map((key) => (store.kv.has(key) ? store.kv.get(key) : null)),
    del: async (...keys) => keys.reduce((n, key) => n + (store.kv.delete(key) ? 1 : 0), 0),
    smembers: async (key) => {
      if (key.includes(':collection:')) store.scans.push(key);
      return [...(store.sets.get(key) || [])];
    },
    sadd: async (key, ...members) => { members.forEach((m) => setOf(key).add(m)); return members.length; },
    srem: async (key, ...members) => { members.forEach((m) => setOf(key).delete(m)); return members.length; },
    zrem: async () => 0,
    ping: async () => 'PONG',
    eval: async (script, keys, args) => {
      if (script.includes('incr')) {
        const next = Number(store.kv.get(keys[0]) || 0) + 1;
        store.kv.set(keys[0], next);
        if (next === 1) store.expiry.set(keys[0], Date.now() + Number(args[0]));
        return next;
      }
      if (store.kv.get(keys[0]) === args[0]) { store.kv.delete(keys[0]); return 1; }
      return 0;
    },
  };
  class Redis {
    constructor() {
      Object.assign(this, commands);
    }

    multi() {
      const queued = [];
      const chain = new Proxy({}, {
        get: (_, name) => (name === 'exec'
          ? async () => { const out = []; for (const [cmd, a] of queued) out.push(await commands[cmd](...a)); return out; }
          : (...args) => { queued.push([name, args]); return chain; }),
      });
      return chain;
    }
  }
  return { Redis };
});

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
}));

vi.mock('../src/server/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireUser: mocks.requireUser,
}));
vi.mock('../src/server/households.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireHousehold: mocks.requireHousehold,
}));

const request = () => new Request('https://forq.example/api/households/audit', {
  headers: { 'x-forq-household-id': 'h-1' },
});

const loadRoute = async () => {
  vi.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  process.env.AUTH_SECRET = 'test-secret';
  const [{ GET }, { getDatabase }] = await Promise.all([
    import('../src/app/api/households/audit/route.js'),
    import('../src/server/database.js'),
  ]);
  return { GET, db: await getDatabase() };
};

beforeEach(() => {
  vi.clearAllMocks();
  store.kv.clear();
  store.sets.clear();
  store.expiry.clear();
  store.scans.length = 0;
  mocks.requireUser.mockResolvedValue({ id: 'user-1' });
  mocks.requireHousehold.mockResolvedValue({ household: { _id: 'h-1' } });
});

describe('GET /api/households/audit', () => {
  it('serves the household’s events newest first, projected to the panel’s fields', async () => {
    const { GET, db } = await loadRoute();
    await db.collection('households').insertOne({ _id: 'h-1', name: 'Home', ownerId: 'user-1', createdAt: new Date(0) });
    await db.collection('auditEvents').insertOne({
      _id: 'e1', householdId: 'h-1', actorId: 'user-1', actorName: 'Ada', action: 'household.created',
      resource: 'h-1', fields: [], version: null, deviceId: null, secret: 'must-not-leak',
      createdAt: new Date(1000),
    });
    await db.collection('auditEvents').insertOne({
      _id: 'e2', householdId: 'h-1', actorId: 'user-1', actorName: 'Ada', action: 'sync.push',
      resource: 'h-1', fields: ['state'], version: 4, deviceId: 'device-1', createdAt: new Date(2000),
    });
    // Another household's row stays out of this household's panel.
    await db.collection('households').insertOne({ _id: 'h-2', name: 'Other', ownerId: 'user-2', createdAt: new Date(0) });
    await db.collection('auditEvents').insertOne({
      _id: 'e3', householdId: 'h-2', actorId: 'user-2', actorName: 'Bo', action: 'sync.push',
      resource: 'h-2', fields: [], version: null, deviceId: null, createdAt: new Date(3000),
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const rows = await response.json();
    expect(rows.map((row) => row.action)).toEqual(['sync.push', 'household.created']);
    expect(rows[0]).toMatchObject({
      id: 'e2', actorName: 'Ada', fields: ['state'], version: 4, deviceId: 'device-1',
    });
    expect(rows.every((row) => row.secret === undefined)).toBe(true);
    expect(new Date(rows[0].createdAt).getTime()).toBeGreaterThan(new Date(rows[1].createdAt).getTime());
  });
});
