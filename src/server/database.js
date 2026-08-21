import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';

const prefix = process.env.UPSTASH_REDIS_PREFIX || 'forq';
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const UNIQUE_FIELDS = {
  households: [['personalOwnerId']],
  memberships: [['householdId', 'userId']],
  householdStates: [['householdId']],
  invitations: [['tokenHash']],
  notificationOutbox: [['dedupeKey']],
  coachShares: [['tokenHash']],
  analyticsDaily: [['householdId', 'day', 'event']],
  analyticsEventReceipts: [['householdId', 'eventId']],
  users: [['email']],
  accounts: [['provider', 'providerAccountId']],
  sessions: [['sessionToken']],
  verificationTokens: [['identifier', 'token']],
};
const HOUSEHOLD_SCOPED_COLLECTIONS = new Set([
  'householdStates', 'memberships', 'invitations', 'coachShares', 'uploads',
  'notificationOutbox', 'auditEvents', 'aiUsage', 'realtimeEvents',
  'analyticsDaily', 'analyticsEventReceipts',
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const newId = () => randomBytes(12).toString('hex');
const collectionKey = (name) => `${prefix}:collection:${name}`;
const documentKey = (name, id) => `${prefix}:document:${name}:${id}`;
const lockKey = (name) => `${prefix}:lock:${name}`;
const analyticsReceiptExpiryKey = () => `${prefix}:analytics:receipt-expiry`;
const householdIdFrom = (...values) => {
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const id = value.householdId || value.$set?.householdId || value.$setOnInsert?.householdId;
    if (id !== undefined && id !== null) return id.toString();
  }
  return null;
};

const encode = (value) => {
  if (value instanceof Date) return { $forqDate: value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
};

const decode = (value) => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$forqDate === 'string') {
      return new Date(value.$forqDate);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
};

const serialise = (document) => JSON.stringify(encode(document));
const deserialise = (value) => {
  if (value === null || value === undefined) return null;
  return decode(typeof value === 'string' ? JSON.parse(value) : value);
};

const comparable = (value) => {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return value;
};
const valueAt = (document, path) =>
  path.split('.').reduce((value, part) => (value === null || value === undefined ? undefined : value[part]), document);

const setAt = (document, path, value) => {
  const parts = path.split('.');
  let target = document;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
};

const unsetAt = (document, path) => {
  const parts = path.split('.');
  const target = parts.slice(0, -1).reduce((value, part) => value?.[part], document);
  if (target && typeof target === 'object') delete target[parts.at(-1)];
};

const valuesEqual = (left, right) => {
  if (Array.isArray(left) && !Array.isArray(right)) return left.some((item) => valuesEqual(item, right));
  return comparable(left) === comparable(right);
};

const expressionValue = (document, expression) => {
  if (typeof expression === 'string' && expression.startsWith('$')) return valueAt(document, expression.slice(1));
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) return expression;
  if ('$ifNull' in expression) {
    const [candidate, fallback] = expression.$ifNull;
    return expressionValue(document, candidate) ?? expressionValue(document, fallback);
  }
  if ('$add' in expression) {
    return expression.$add.reduce((sum, item) => sum + Number(expressionValue(document, item) || 0), 0);
  }
  return expression;
};

const matchesCondition = (actual, condition) => {
  if (!condition || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) {
    return valuesEqual(actual, condition);
  }
  return Object.entries(condition).every(([operator, expected]) => {
    if (operator === '$in') return expected.some((item) => valuesEqual(actual, item));
    if (operator === '$exists') return (actual !== undefined) === expected;
    if (operator === '$ne') return !valuesEqual(actual, expected);
    if (operator === '$gt') return comparable(actual) > comparable(expected);
    if (operator === '$gte') return comparable(actual) >= comparable(expected);
    if (operator === '$lt') return comparable(actual) < comparable(expected);
    if (operator === '$lte') return comparable(actual) <= comparable(expected);
    return false;
  });
};

const matches = (document, filter = {}) => Object.entries(filter).every(([field, condition]) => {
  if (field === '$expr') {
    if ('$lte' in condition) {
      const [left, right] = condition.$lte;
      return comparable(expressionValue(document, left)) <= comparable(expressionValue(document, right));
    }
    return false;
  }
  if (field === '$or') return condition.some((item) => matches(document, item));
  if (field === '$and') return condition.every((item) => matches(document, item));
  return matchesCondition(valueAt(document, field), condition);
});

const project = (document, projection) => {
  if (!projection) return document;
  const included = Object.entries(projection).filter(([, enabled]) => enabled).map(([field]) => field);
  if (!included.length) {
    const copy = structuredClone(document);
    for (const [field, enabled] of Object.entries(projection)) {
      if (!enabled) delete copy[field];
    }
    return copy;
  }
  const result = {};
  if (projection._id !== 0 && document._id !== undefined) result._id = document._id;
  for (const field of included.filter((item) => item !== '_id')) {
    const value = valueAt(document, field);
    if (value !== undefined) setAt(result, field, value);
  }
  return result;
};

const baseDocument = (filter) => Object.fromEntries(
  Object.entries(filter).filter(([field, value]) =>
    !field.startsWith('$')
    && (!value || typeof value !== 'object' || value instanceof Date || Array.isArray(value))),
);

const applyUpdate = (document, update, inserting = false) => {
  const next = structuredClone(document);
  if (inserting) {
    for (const [field, value] of Object.entries(update.$setOnInsert || {})) setAt(next, field, value);
  }
  for (const [field, value] of Object.entries(update.$set || {})) setAt(next, field, value);
  for (const field of Object.keys(update.$unset || {})) unsetAt(next, field);
  for (const [field, amount] of Object.entries(update.$inc || {})) {
    setAt(next, field, Number(valueAt(next, field) || 0) + Number(amount));
  }
  return next;
};

const assertHouseholdActive = async (householdId) => {
  const household = deserialise(await redis.get(documentKey('households', householdId)));
  if (household && !household.deletingAt) return;
  const error = new Error('Household deletion in progress.');
  error.code = 'HOUSEHOLD_DELETING';
  throw error;
};

class RedisCursor {
  constructor(load, filter, options = {}) {
    this.load = load;
    this.filter = filter;
    this.projection = options.projection;
    this.sortSpec = null;
    this.maximum = null;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.maximum = value;
    return this;
  }

  async toArray() {
    let documents = (await this.load()).filter((document) => matches(document, this.filter));
    if (this.sortSpec) {
      const fields = Object.entries(this.sortSpec);
      documents.sort((left, right) => {
        for (const [field, direction] of fields) {
          const a = comparable(valueAt(left, field));
          const b = comparable(valueAt(right, field));
          if (a < b) return -1 * direction;
          if (a > b) return direction;
        }
        return 0;
      });
    }
    if (this.maximum !== null) documents = documents.slice(0, this.maximum);
    return documents.map((document) => project(document, this.projection));
  }
}

class RedisCollection {
  constructor(name) {
    this.name = name;
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
    const expiresAt = comparable(document.expiresAt);
    const options = Number.isFinite(expiresAt) && expiresAt > Date.now() ? { pxat: expiresAt } : undefined;
    await redis.set(documentKey(this.name, document._id), serialise(document), options);
    await redis.sadd(collectionKey(this.name), document._id);
  }

  assertUnique(document, documents, excludedId = null) {
    if (documents.some((candidate) => candidate._id === document._id && candidate._id !== excludedId)) {
      const error = new Error('Duplicate key.');
      error.code = 11000;
      throw error;
    }
    for (const fields of UNIQUE_FIELDS[this.name] || []) {
      const values = fields.map((field) => valueAt(document, field));
      if (values.some((value) => value === undefined || value === null)) continue;
      const duplicate = documents.some((candidate) =>
        candidate._id !== excludedId
        && fields.every((field, index) => valuesEqual(valueAt(candidate, field), values[index])));
      if (duplicate) {
        const error = new Error('Duplicate key.');
        error.code = 11000;
        throw error;
      }
    }
  }

  find(filter = {}, options = {}) {
    return new RedisCursor(() => this.loadAll(), filter, options);
  }

  async findOne(filter = {}, options = {}) {
    const document = (await this.loadAll()).find((item) => matches(item, filter));
    return document ? project(document, options.projection) : null;
  }

  async insertOne(input) {
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name) ? householdIdFrom(input) : null;
    return this.withWriteLock(async () => {
      const documents = await this.loadAll();
      const document = { ...structuredClone(input), _id: input._id?.toString() || newId() };
      this.assertUnique(document, documents);
      await this.save(document);
      return { acknowledged: true, insertedId: document._id };
    }, householdId);
  }

  async updateOne(filter, update, options = {}) {
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)
      ? await this.resolveHouseholdId(filter, update)
      : this.name === 'households' ? filter._id?.toString() : null;
    return this.withWriteLock(async () => {
      const documents = await this.loadAll();
      const current = documents.find((item) => matches(item, filter));
      if (!current && !options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      const seed = baseDocument(filter);
      const document = applyUpdate(current || { ...seed, _id: seed._id || newId() }, update, !current);
      this.assertUnique(document, documents, current?._id);
      await this.save(document);
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
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)
      ? await this.resolveHouseholdId(filter, update)
      : this.name === 'households' ? filter._id?.toString() : null;
    return this.withWriteLock(async () => {
      const documents = await this.loadAll();
      const current = documents.find((item) => matches(item, filter));
      if (!current && !options.upsert) return null;
      const seed = baseDocument(filter);
      const document = applyUpdate(current || { ...seed, _id: seed._id || newId() }, update, !current);
      this.assertUnique(document, documents, current?._id);
      await this.save(document);
      return options.returnDocument === 'before' ? current : document;
    }, householdId, this.name !== 'households');
  }

  async deleteOne(filter) {
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)
      ? await this.resolveHouseholdId(filter)
      : this.name === 'households' ? filter._id?.toString() : null;
    return this.withWriteLock(async () => {
      const document = (await this.loadAll()).find((item) => matches(item, filter));
      if (!document) return { acknowledged: true, deletedCount: 0 };
      await redis.del(documentKey(this.name, document._id));
      await redis.srem(collectionKey(this.name), document._id);
      if (this.name === 'analyticsEventReceipts') await redis.zrem(analyticsReceiptExpiryKey(), document._id);
      return { acknowledged: true, deletedCount: 1 };
    }, householdId, false);
  }

  async deleteMany(filter) {
    const householdId = HOUSEHOLD_SCOPED_COLLECTIONS.has(this.name)
      ? householdIdFrom(filter)
      : null;
    return this.withWriteLock(async () => {
      const documents = (await this.loadAll()).filter((item) => matches(item, filter));
      if (!documents.length) return { acknowledged: true, deletedCount: 0 };
      await redis.del(...documents.map((document) => documentKey(this.name, document._id)));
      await redis.srem(collectionKey(this.name), ...documents.map((document) => document._id));
      if (this.name === 'analyticsEventReceipts') {
        await redis.zrem(analyticsReceiptExpiryKey(), ...documents.map((document) => document._id));
      }
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

const database = {
  databaseName: 'upstash-redis',
  collection: (name) => new RedisCollection(name),
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
