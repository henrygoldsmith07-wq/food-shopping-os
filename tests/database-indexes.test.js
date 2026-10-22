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

describe('stale index hygiene', () => {
  it('frees a deleted document’s unique value at delete time, not on the next read', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One', ownerId: 'u1', createdAt: new Date(0) });
    const shares = db.collection('coachShares');
    await shares.insertOne({ _id: 's1', householdId: 'h1', tokenHash: 't1', createdAt: new Date(0) });
    await shares.findOne({ tokenHash: 't1' }); // warms the one-time index check
    store.scans.length = 0;

    await shares.deleteOne({ _id: 's1' });
    expect(await shares.findOne({ tokenHash: 't1' })).toBeNull();
    expect(await shares.findOne({ tokenHash: 't1' })).toBeNull();
    expect(await shares.findOne({ tokenHash: 'never-existed' })).toBeNull();
    expect(scansOf('coachShares')).toBe(0);

    await shares.insertOne({ _id: 's2', householdId: 'h1', tokenHash: 't1' });
    expect((await shares.findOne({ tokenHash: 't1' }))._id).toBe('s2');
  });

  it('repairs a moved unique value once, then answers from the index', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One', ownerId: 'u1', createdAt: new Date(0) });
    const shares = db.collection('coachShares');
    await shares.insertOne({ _id: 's1', householdId: 'h1', tokenHash: 't1', createdAt: new Date(0) });
    await shares.findOne({ tokenHash: 't0' }); // warms the one-time index check
    store.scans.length = 0;

    await shares.updateOne({ _id: 's1' }, { $set: { tokenHash: 't2' } });
    expect(await shares.findOne({ tokenHash: 't1' })).toBeNull();
    expect(await shares.findOne({ tokenHash: 't1' })).toBeNull();
    expect((await shares.findOne({ tokenHash: 't2' }))._id).toBe('s1');
    expect(scansOf('coachShares')).toBe(1); // one repair, not one per read

    await shares.insertOne({ _id: 's2', householdId: 'h1', tokenHash: 't1' });
    expect((await shares.findOne({ tokenHash: 't1' }))._id).toBe('s2');
  });
});

describe('per-value indexes keep the household list fast', () => {
  it('answers the household list’s three reads without scanning collections', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One', ownerId: 'u1', createdAt: new Date(0) });
    await db.collection('households').insertOne({ _id: 'h2', name: 'Two', ownerId: 'u2', createdAt: new Date(0) });
    await db.collection('households').insertOne({
      _id: 'h3', name: 'Dying', ownerId: 'u1', deletingAt: new Date(1), createdAt: new Date(0),
    });
    await db.collection('memberships').insertOne({ _id: 'm1', householdId: 'h1', userId: 'u1', role: 'owner' });
    await db.collection('memberships').findOne({ userId: 'u1' }); // warm-ups index the collections once
    await db.collection('households').findOne({ ownerId: 'u9' });
    store.scans.length = 0;

    const mine = await db.collection('memberships').find({ userId: 'u1' }).toArray();
    expect(mine.map((row) => row.householdId)).toEqual(['h1']);
    expect(await db.collection('memberships').find({ userId: 'nobody' }).toArray()).toEqual([]);

    const member = await db.collection('households').find({ _id: { $in: ['h1', 'h2'] } }).toArray();
    expect(member.map((row) => row._id)).toEqual(['h1', 'h2']);

    const dying = await db.collection('households')
      .find({ ownerId: 'u1', deletingAt: { $exists: true } }).toArray();
    expect(dying.map((row) => row._id)).toEqual(['h3']);

    expect(scansOf('memberships')).toBe(0);
    expect(scansOf('households')).toBe(0);
  });
});

describe('the audit trail survives household deletion', () => {
  it('records the deletion tombstone even though the household is gone', async () => {
    const db = await load();
    await db.collection('households').insertOne({
      _id: 'h1', name: 'One', ownerId: 'u1', createdAt: new Date(0), updatedAt: new Date(0),
    });
    await db.collection('households').deleteOne({ _id: 'h1' });
    const audit = db.collection('auditEvents');
    await expect(audit.insertOne({
      householdId: 'h1', actorId: 'u1', action: 'sync.push', createdAt: new Date(5),
    })).rejects.toMatchObject({ code: 'HOUSEHOLD_DELETING' });

    await audit.insertOne({
      householdId: 'h1', actorId: 'u1', action: 'household.deleted', createdAt: new Date(5),
    }, { checkActive: false });
    expect((await audit.find({ householdId: 'h1' }).toArray()).map((row) => row.action))
      .toEqual(['household.deleted']);
  });

  it('projects a cursor’s fields like Mongo', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One', ownerId: 'u1', createdAt: new Date(0) });
    const audit = db.collection('auditEvents');
    const inserted = await audit.insertOne({
      householdId: 'h1', action: 'sync.push', actorName: 'Sam', actorId: 'u1',
      fields: ['state'], version: 3, deviceId: 'd1', createdAt: new Date(0),
    });
    const rows = await audit.find({ householdId: 'h1' })
      .sort({ createdAt: -1 }).limit(10)
      .project({ action: 1, actorName: 1, createdAt: 1 })
      .toArray();
    expect(rows).toEqual([{
      _id: inserted.insertedId, action: 'sync.push', actorName: 'Sam', createdAt: rows[0].createdAt,
    }]);
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

describe('group indexes', () => {
  it('finds a user’s memberships, accounts and owned households without reading whole collections', async () => {
    const db = await load();
    await db.collection('households').insertOne({ _id: 'h1', name: 'One', ownerId: 'u1' });
    await db.collection('households').insertOne({ _id: 'h2', name: 'Two', ownerId: 'u2' });
    await db.collection('memberships').insertOne({ householdId: 'h1', userId: 'u1', role: 'owner' });
    await db.collection('memberships').insertOne({ householdId: 'h2', userId: 'u1', role: 'adult' });
    await db.collection('memberships').insertOne({ householdId: 'h2', userId: 'u2', role: 'owner' });
    await db.collection('accounts').insertOne({ provider: 'google', providerAccountId: 'g1', userId: 'u1' });
    // First reads mark each collection indexed (a one-time scan each).
    for (const name of ['memberships', 'accounts', 'households']) await db.collection(name).find({ userId: 'none', ownerId: 'none' }).toArray();
    store.scans.length = 0;

    const mine = await db.collection('memberships').find({ userId: 'u1' }).toArray();
    expect(mine.map((m) => m.householdId).sort()).toEqual(['h1', 'h2']);
    const homes = await db.collection('households').find({ _id: { $in: ['h1', 'h2'] } }).toArray();
    expect(homes).toHaveLength(2);
    expect((await db.collection('households').find({ ownerId: 'u2' }).toArray()).map((h) => h._id)).toEqual(['h2']);
    expect(await db.collection('accounts').findOne({ userId: 'u1', provider: 'google' })).toMatchObject({ providerAccountId: 'g1' });
    expect(store.scans).toEqual([]);

  });
});
