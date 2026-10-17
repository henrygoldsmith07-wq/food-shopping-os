import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import {
  HOUSEHOLD_SCOPED_COLLECTIONS, INDEXED_SETS, UNINDEXED_COLLECTIONS, UNIQUE_FIELDS,
  collectionKey, documentKey, householdSetKey, indexValue, prefix, uniqueKey, valueSetKey,
} from './database-indexes.js';
import {
  applyUpdate, baseDocument, comparable, deserialise, householdIdFrom, matches, project, RedisCursor,
  serialise, valueAt, valuesEqual,
} from './database-query.js';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const newId = () => randomBytes(12).toString('hex');
const lockKey = (name) => `${prefix}:lock:${name}`;
const analyticsReceiptExpiryKey = () => `${prefix}:analytics:receipt-expiry`;

/*
 * Reading does not trust an index entry: a stale one (a document since
 * deleted or changed) is checked against its document, and a mismatched
 * unique entry is cleared — but only while it still points at the dead
 * document, so a fresh claimant never loses its entry — then falls back to
 * one repairing scan. Indexes are built lazily the first time a collection
 * is read after this shipped (`ensureIndexed`), so no deploy step is needed.
 */
const indexReadyKey = (name) => `${prefix}:index-ready:${name}`;
const indexedCollections = new Set();

/** A filter value that can be looked up by equality (not an operator object). */
const plainValue = (value) => value !== undefined && value !== null
  && (typeof value !== 'object' || value instanceof Date);

const assertHouseholdActive = async (householdId) => {
  const household = deserialise(await redis.get(documentKey('households', householdId)));
  if (household && !household.deletingAt) return;
  const error = new Error('Household deletion in progress.');
  error.code = 'HOUSEHOLD_DELETING';
  throw error;
};

const duplicateKeyError = () => {
  const error = new Error('Duplicate key.');
  error.code = 11000;
  return error;
};

class RedisCollection {
  constructor(name) {
    this.name = name;
    this.indexed = !UNINDEXED_COLLECTIONS.has(name);
  }

  async loadAll() {
    const ids = await redis.smembers(collectionKey(this.name));
    if (!ids.length) return [];
    const values = await redis.mget(...ids.map((id) => documentKey(this.name, id)));
    const expiredIds = ids.filter((id, index) => values[index] === null);
    if (expiredIds.length) {
      await redis.srem(collectionKey(this.name), ...expiredIds);
      if (this.name === 'analyticsEventReceipts') await redis.zrem(analyticsReceiptExpiryKey(), ...expiredIds);
    }
    return values.map(deserialise).filter(Boolean);
  }

  async loadIds(ids) {
    if (!ids.length) return [];
    const values = await redis.mget(...ids.map((id) => documentKey(this.name, id)));
    return values.map(deserialise).filter(Boolean);
  }

  /** The unique field sets this document has values for. */
  uniqueSets(document) {
    return (UNIQUE_FIELDS[this.name] || [])
      .filter((fields) => fields.every((field) => plainValue(valueAt(document, field))));
  }

  /** Queue a document's index entries on a MULTI. */
  queueIndexes(multi, document, options) {
    if (!this.indexed) return;
    for (const fields of this.uniqueSets(document)) {
      multi.set(uniqueKey(this.name, fields, document), document._id, options);
    }
    for (const field of INDEXED_SETS[this.name] || []) {
      if (plainValue(valueAt(document, field))) {
        multi.sadd(valueSetKey(this.name, field, indexValue(valueAt(document, field))), document._id);
      }
    }
    if (HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name) && plainValue(document.householdId)) {
      multi.sadd(householdSetKey(this.name, indexValue(document.householdId)), document._id);
    }
  }

  /**
   * Make sure every stored document is indexed. Runs a single scan the first
   * time a collection is read after indexes shipped, then trusts the marker.
   */
  async ensureIndexed() {
    if (!this.indexed) return false;
    if (indexedCollections.has(this.name)) return true;
    if (await redis.get(indexReadyKey(this.name))) {
      indexedCollections.add(this.name);
      return true;
    }
    const documents = await this.loadAll();
    for (let start = 0; start < documents.length; start += 100) {
      const multi = redis.multi();
      for (const document of documents.slice(start, start + 100)) this.queueIndexes(multi, document, this.expiryOptions(document));
      await multi.exec();
    }
    await redis.set(indexReadyKey(this.name), '1');
    indexedCollections.add(this.name);
    return true;
  }

  expiryOptions(document) {
    const expiresAt = comparable(document.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > Date.now() ? { pxat: expiresAt } : undefined;
  }

  /**
   * The documents a filter can match, read through an index when one covers
   * it. Callers still apply `matches`, so a superset is always safe.
   */
  async candidates(filter = {}) {
    if (plainValue(filter._id)) {
      const document = deserialise(await redis.get(documentKey(this.name, String(filter._id))));
      return document ? [document] : [];
    }
    if (filter._id && typeof filter._id === 'object' && Array.isArray(filter._id.$in)) {
      return this.loadIds(filter._id.$in.filter(plainValue).map(String));
    }
    if (!(await this.ensureIndexed())) return this.loadAll();
    const covering = (UNIQUE_FIELDS[this.name] || [])
      .find((fields) => fields.every((field) => plainValue(filter[field])));
    if (covering) {
      const key = uniqueKey(this.name, covering, filter);
      const id = await redis.get(key);
      if (!id) return [];
      const document = deserialise(await redis.get(documentKey(this.name, id)));
      if (document && covering.every((field) => valuesEqual(valueAt(document, field), filter[field]))) {
        return [document];
      }
      // The entry outlived its document (a delete, a TTL, an older code
      // path): clear it so the repair repeats no more than once — but only
      // while it still points at what we read, in case a new document
      // claimed the value a moment ago.
      await redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
        [key],
        [id],
      );
      return this.repairFromScan();
    }
    const setField = (INDEXED_SETS[this.name] || []).find((field) => plainValue(filter[field]));
    if (setField) return this.loadSet(valueSetKey(this.name, setField, indexValue(filter[setField])));
    if (HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name) && plainValue(filter.householdId)) {
      return this.loadSet(householdSetKey(this.name, indexValue(filter.householdId)));
    }
    return this.loadAll();
  }

  /** Read one index set, dropping entries whose document is gone. */
  async loadSet(setKey) {
    const ids = await redis.smembers(setKey);
    const documents = await this.loadIds(ids);
    if (documents.length < ids.length) {
      const live = new Set(documents.map((document) => document._id));
      const gone = ids.filter((id) => !live.has(id));
      if (gone.length) await redis.srem(setKey, ...gone);
    }
    return documents;
  }

  /** A unique entry pointed at the wrong document: rebuild from a scan. */
  async repairFromScan() {
    const documents = await this.loadAll();
    const multi = redis.multi();
    for (const document of documents) this.queueIndexes(multi, document, this.expiryOptions(document));
    await multi.exec();
    return documents;
  }

  async withLock(task, scope = this.name) {
    const owner = randomUUID();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const scopedKey = lockKey(scope);
      const acquired = await redis.set(scopedKey, owner, { nx: true, px: 5000 });
      if (acquired) {
        try {
          return await task();
        } finally {
          await redis.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
            [scopedKey],
            [owner],
          );
        }
      }
      await sleep(40);
    }
    throw new Error(`Database collection "${this.name}" is busy.`);
  }

  async withWriteLock(task, householdId = null, checkActive = true) {
    const scope = householdId ? `household:${householdId}` : this.name;
    return this.withLock(async () => {
      if (householdId && checkActive) await assertHouseholdActive(householdId);
      return task();
    }, scope);
  }

  async resolveHouseholdId(filter, update = null) {
    if (!HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)) return null;
    const direct = householdIdFrom(filter, update);
    if (direct) return direct;
    const current = await this.findOne(filter);
    return current?.householdId?.toString() || null;
  }

  async save(document) {
    const options = this.expiryOptions(document);
    const multi = redis.multi();
    multi.set(documentKey(this.name, document._id), serialise(document), options);
    multi.sadd(collectionKey(this.name), document._id);
    this.queueIndexes(multi, document, options);
    await multi.exec();
  }

  async remove(documents) {
    if (!documents.length) return;
    const multi = redis.multi();
    for (const document of documents) {
      multi.del(documentKey(this.name, document._id));
      multi.srem(collectionKey(this.name), document._id);
      for (const field of INDEXED_SETS[this.name] || []) {
        if (plainValue(valueAt(document, field))) {
          multi.srem(valueSetKey(this.name, field, indexValue(valueAt(document, field))), document._id);
        }
      }
      // Clear the unique entries this document still holds — but only while
      // they still point at it, in case a new document has just claimed the
      // same value and would lose its entry to a blanket delete.
      for (const fields of this.uniqueSets(document)) {
        const key = uniqueKey(this.name, fields, document);
        multi.eval(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
          [key],
          [document._id],
        );
      }
      if (HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name) && plainValue(document.householdId)) {
        multi.srem(householdSetKey(this.name, indexValue(document.householdId)), document._id);
      }
    }
    if (this.name === 'analyticsEventReceipts') {
      multi.zrem(analyticsReceiptExpiryKey(), ...documents.map((document) => document._id));
    }
    await multi.exec();
  }

  /** Throw the Mongo duplicate-key error if another document holds a unique value. */
  async assertUnique(document, excludedId = null) {
    const others = (candidate) => candidate && candidate._id !== excludedId;
    const existing = deserialise(await redis.get(documentKey(this.name, document._id)));
    if (existing && document._id !== excludedId) throw duplicateKeyError();
    for (const fields of this.uniqueSets(document)) {
      const filter = Object.fromEntries(fields.map((field) => [field, valueAt(document, field)]));
      const holders = (await this.candidates(filter)).filter((candidate) => matches(candidate, filter));
      if (holders.some((holder) => others(holder) && holder._id !== document._id)) throw duplicateKeyError();
    }
  }

  find(filter = {}, options = {}) {
    return new RedisCursor(() => this.candidates(filter), filter, options);
  }

  async findOne(filter = {}, options = {}) {
    const document = (await this.candidates(filter)).find((item) => matches(item, filter));
    return document ? project(document, options.projection) : null;
  }

  async insertOne(input, options = {}) {
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name) ? householdIdFrom(input) : null;
    return this.withWriteLock(async () => {
      const document = { ...structuredClone(input), _id: input._id?.toString() || newId() };
      await this.assertUnique(document);
      await this.save(document);
      return { acknowledged: true, insertedId: document._id };
    }, householdId, options.checkActive !== false);
  }

  async upsertMatching(filter, update, options) {
    const current = (await this.candidates(filter)).find((item) => matches(item, filter));
    if (!current && !options.upsert) return { current: null, document: null };
    const seed = baseDocument(filter);
    const document = applyUpdate(current || { ...seed, _id: seed._id || newId() }, update, !current);
    await this.assertUnique(document, current?._id);
    await this.save(document);
    return { current, document };
  }

  writeScope(filter, update = null) {
    return HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)
      ? this.resolveHouseholdId(filter, update)
      : this.name === 'households' ? filter._id?.toString() : null;
  }

  async updateOne(filter, update, options = {}) {
    const householdId = await this.writeScope(filter, update);
    return this.withWriteLock(async () => {
      const { current, document } = await this.upsertMatching(filter, update, options);
      if (!document) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      return {
        acknowledged: true,
        matchedCount: current ? 1 : 0,
        modifiedCount: 1,
        upsertedCount: current ? 0 : 1,
        upsertedId: current ? null : document._id,
      };
    }, householdId, this.name !== 'households');
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const householdId = await this.writeScope(filter, update);
    return this.withWriteLock(async () => {
      const { current, document } = await this.upsertMatching(filter, update, options);
      if (!document) return null;
      return options.returnDocument === 'before' ? current : document;
    }, householdId, this.name !== 'households');
  }

  async deleteOne(filter) {
    const householdId = await this.writeScope(filter);
    return this.withWriteLock(async () => {
      const document = (await this.candidates(filter)).find((item) => matches(item, filter));
      if (!document) return { acknowledged: true, deletedCount: 0 };
      await this.remove([document]);
      return { acknowledged: true, deletedCount: 1 };
    }, householdId, false);
  }

  async deleteMany(filter) {
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)
      ? householdIdFrom(filter)
      : null;
    return this.withWriteLock(async () => {
      const documents = (await this.candidates(filter)).filter((item) => matches(item, filter));
      await this.remove(documents);
      return { acknowledged: true, deletedCount: documents.length };
    }, householdId, false);
  }

  async bulkWrite(operations) {
    let upsertedCount = 0;
    for (const operation of operations) {
      if (!operation.updateOne) continue;
      const result = await this.updateOne(
        operation.updateOne.filter,
        operation.updateOne.update,
        { upsert: operation.updateOne.upsert },
      );
      upsertedCount += result.upsertedCount || 0;
    }
    return { acknowledged: true, upsertedCount };
  }

  async createIndex() {
    return null;
  }

  async dropIndex() {
    return null;
  }
}

/**
 * A fixed-window counter: one atomic INCR, with the expiry set on the first
 * hit. Rate limiting used to upsert a document in a 'rateLimits' collection,
 * which took a single global lock and scanned every live counter on every
 * request.
 */
const incrementWindow = async (key, ttlMs) => Number(await redis.eval(
  'local n = redis.call("incr", KEYS[1]) if n == 1 then redis.call("pexpire", KEYS[1], ARGV[1]) end return n',
  [`${prefix}:counter:${key}`],
  [String(ttlMs)],
));

const database = {
  databaseName: 'upstash-redis',
  collection: (name) => new RedisCollection(name),
  incrementWindow,
  recordAnalyticsEvent: async ({ householdId, eventId, event, day, now }) => {
    householdId = householdId.toString();
    const receiptId = createHash('sha256')
      .update(`receipt\0${householdId}\0${eventId}`)
      .digest('hex');
    const dailyId = createHash('sha256')
      .update(`daily\0${householdId}\0${day}\0${event}`)
      .digest('hex');
    const nowIso = now.toISOString();
    const expiresAt = now.getTime() + 90 * 86400000;
    const expiresAtIso = new Date(expiresAt).toISOString();
    const result = await redis.eval(`
      local expired = redis.call('zrangebyscore', KEYS[5], '-inf', ARGV[10], 'LIMIT', 0, 200)
      for _, id in ipairs(expired) do
        redis.call('del', ARGV[11] .. id)
        redis.call('srem', KEYS[2], id)
        redis.call('zrem', KEYS[5], id)
      end

      local household = redis.call('get', KEYS[6])
      if not household then return -1 end
      local householdDocument = cjson.decode(household)
      if householdDocument.deletingAt then return -1 end

      local receipt = redis.call('get', KEYS[1])
      if receipt then return 0 end

      local date = { ['$forqDate'] = ARGV[7] }
      local receiptDocument = cjson.encode({
        _id = ARGV[1],
        householdId = ARGV[2],
        eventId = ARGV[3],
        createdAt = date,
        expiresAt = { ['$forqDate'] = ARGV[8] },
      })
      redis.call('set', KEYS[1], receiptDocument)
      redis.call('pexpireat', KEYS[1], tonumber(ARGV[9]))
      redis.call('sadd', KEYS[2], ARGV[1])
      redis.call('pexpireat', KEYS[2], tonumber(ARGV[9]))
      redis.call('zadd', KEYS[5], ARGV[9], ARGV[1])

      local daily = redis.call('get', KEYS[3])
      local document
      if daily then
        document = cjson.decode(daily)
        document.count = (document.count or 0) + 1
        document.updatedAt = date
      else
        document = {
          _id = ARGV[4],
          householdId = ARGV[2],
          day = ARGV[5],
          event = ARGV[6],
          count = 1,
          createdAt = date,
          updatedAt = date,
        }
      end
      redis.call('set', KEYS[3], cjson.encode(document))
      redis.call('sadd', KEYS[4], ARGV[4])
      return 1
    `, [
      documentKey('analyticsEventReceipts', receiptId),
      collectionKey('analyticsEventReceipts'),
      documentKey('analyticsDaily', dailyId),
      collectionKey('analyticsDaily'),
      analyticsReceiptExpiryKey(),
      documentKey('households', householdId),
    ], [receiptId, householdId, eventId, dailyId, day, event, nowIso, expiresAtIso, expiresAt, now.getTime(), `${prefix}:document:analyticsEventReceipts:`]);
    return { duplicate: Number(result) === 0, deleting: Number(result) === -1 };
  },
  command: async ({ ping } = {}) => (ping ? { ok: await redis.ping() === 'PONG' ? 1 : 0 } : { ok: 1 }),
};

export const databaseConfigured = Boolean(redis);

export async function getDatabase() {
  if (!redis) throw new Error('Upstash Redis is not configured.');
  return database;
}
