import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Redis document store answers equality lookups from indexes instead of
 * reading whole collections. These run the real database module against an
 * in-memory stand-in for the Upstash client that records how often a whole
 * collection was read (SMEMBERS on a collection set).
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

const load = async () => {
  vi.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  const { getDatabase } = await import('../src/server/database.js');
  return getDatabase();
};

const scansOf = (name) => store.scans.filter((key) => key.endsWith(`:collection:${name}`)).length;

beforeEach(() => {
  store.kv.clear();
  store.sets.clear();
  store.expiry.clear();
  store.scans.length = 0;
});

describe('equality lookups read through indexes', () => {
  it('reads one household state without reading every household', async () => {
    const db = await load();
    const states = db.collection('householdStates');
    await db.collection('households').insertOne({ _id: 'h1', name: 'One' });
    await db.collection('households').insertOne({ _id: 'h2', name: 'Two' });
    await states.insertOne({ householdId: 'h1', version: 1, state: { onboarded: true, a: 1 } });
    await states.insertOne({ householdId: 'h2', version: 1, state: { onboarded: true, b: 2 } });
    store.scans.length = 0;

    const found = await states.findOne({ householdId: 'h2' });
    expect(found.state.b).toBe(2);
    expect(await states.findOne({ householdId: 'nobody' })).toBeNull();
    expect(scansOf('householdStates')).toBe(0);
  });

  it('indexes data written before indexes existed, once, on first read', async () => {
    const db = await load();
    // A user stored by the old code: document + collection set, no index.
    store.kv.set('forq:document:users:u1', JSON.stringify({ _id: 'u1', email: 'sam@example.com' }));
    store.sets.set('forq:collection:users', new Set(['u1']));

    const users = db.collection('users');
    expect((await users.findOne({ email: 'sam@example.com' }))._id).toBe('u1');
    expect(scansOf('users')).toBe(1);
    expect((await users.findOne({ email: 'sam@example.com' }))._id).toBe('u1');
    expect(await users.findOne({ email: 'other@example.com' })).toBeNull();
    expect(scansOf('users')).toBe(1);
  });

  it('keeps unique fields unique through inserts, updates and deletes', async () => {
    const db = await load();
    const users = db.collection('users');
    await users.insertOne({ _id: 'u1', email: 'a@example.com' });
    await users.insertOne({ _id: 'u2', email: 'b@example.com' });
    await expect(users.insertOne({ email: 'a@example.com' })).rejects.toMatchObject({ code: 11000 });
    await expect(users.updateOne({ _id: 'u2' }, { $set: { email: 'a@example.com' } })).rejects.toMatchObject({ code: 11000 });
    // Changing your own other fields keeps your own unique value.
    await users.updateOne({ _id: 'u1' }, { $set: { name: 'Sam' } });

    // Moving a value frees it: the stale index entry is checked, not trusted.
    await users.updateOne({ _id: 'u1' }, { $set: { email: 'c@example.com' } });
    expect(await users.findOne({ email: 'a@example.com' })).toBeNull();
    expect((await users.findOne({ email: 'c@example.com' }))._id).toBe('u1');
    await users.insertOne({ _id: 'u3', email: 'a@example.com' });
    expect((await users.findOne({ email: 'a@example.com' }))._id).toBe('u3');

    await users.deleteOne({ _id: 'u3' });
    expect(await users.findOne({ email: 'a@example.com' })).toBeNull();
    await users.insertOne({ _id: 'u4', email: 'a@example.com' });
    expect((await users.findOne({ email: 'a@example.com' }))._id).toBe('u4');
  });

  it('keeps the sync version check: a stale version does not write', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One' });
    const states = db.collection('householdStates');
    const filter = (version) => ({ householdId: 'h1', version });
    const update = { $set: { state: { onboarded: true } }, $inc: { version: 1 }, $setOnInsert: { householdId: 'h1' } };
    expect((await states.findOneAndUpdate(filter(0), update, { upsert: true, returnDocument: 'after' })).version).toBe(1);
    expect(await states.findOneAndUpdate(filter(0), update, { returnDocument: 'after' })).toBeNull();
    expect((await states.findOneAndUpdate(filter(1), update, { returnDocument: 'after' })).version).toBe(2);
    await expect(states.findOneAndUpdate(filter(0), update, { upsert: true })).rejects.toMatchObject({ code: 11000 });
  });

  it('reads a household’s rows from its own index, not the whole collection', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One' });
    await db.collection('households').insertOne({ _id: 'h2', name: 'Two' });
    const events = db.collection('realtimeEvents');
    for (let i = 0; i < 5; i += 1) await events.insertOne({ householdId: i % 2 ? 'h1' : 'h2', createdAt: new Date(1000 + i), n: i });
    // The first read of a collection checks it is indexed (a one-time scan,
    // remembered in Redis); every read after that uses the household index.
    await events.find({ householdId: 'h2' }).toArray();
    store.scans.length = 0;

    const rows = await events.find({ householdId: 'h1', createdAt: { $gte: new Date(0) } }).sort({ createdAt: 1 }).toArray();
    expect(rows.map((row) => row.n)).toEqual([1, 3]);
    expect(scansOf('realtimeEvents')).toBe(0);

    await events.deleteMany({ householdId: 'h1' });
    expect(await events.find({ householdId: 'h1' }).toArray()).toEqual([]);
    expect((await events.find({ householdId: 'h2' }).toArray())).toHaveLength(3);
  });
});

describe('rate limiting', () => {
  it('counts with one atomic counter that expires after two windows', async () => {
    const db = await load();
    expect(await db.incrementWindow('ai:u1:w', 7200000)).toBe(1);
    expect(await db.incrementWindow('ai:u1:w', 7200000)).toBe(2);
    expect(await db.incrementWindow('ai:u2:w', 7200000)).toBe(1);
    const ttl = store.expiry.get('forq:counter:ai:u1:w') - Date.now();
    expect(ttl).toBeGreaterThan(7190000);
    expect(store.scans).toEqual([]);
  });
});

describe('cursor projection', () => {
  it('supports the driver-style .project() the audit route uses', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One' });
    const events = db.collection('auditEvents');
    await events.insertOne({ householdId: 'h1', action: 'sync', secret: 'x', createdAt: new Date(1) });
    const rows = await events.find({ householdId: 'h1' }).sort({ createdAt: -1 }).limit(100).project({ action: 1 }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('sync');
    expect(rows[0].secret).toBeUndefined();
  });
});
