/**
 * The document store's index schema.
 *
 * Four index shapes answer the common lookups (see `database.js` for the
 * reading side): by _id, by a unique field set, by household, and by a bare
 * value such as a user. Every lookup used to SMEMBERS a whole collection and
 * MGET every document in it, so reading one household's state downloaded
 * every household's state; these tables and key names are what the reader
 * and the writer both work from.
 */
import { createHash } from 'node:crypto';
import { comparable, valueAt } from './database-query.js';

export const prefix = process.env.UPSTASH_REDIS_PREFIX || 'forq';

/** Equality lookups a unique key answers exactly once: key → owning _id. */
export const UNIQUE_FIELDS = {
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

/** Scopes whose collections read through a per-household set of _ids. */
export const HOUSEHOLD_SCOPED_COLLECTIONS = new Set([
  'householdStates', 'memberships', 'invitations', 'coachShares', 'uploads',
  'notificationOutbox', 'auditEvents', 'aiUsage', 'realtimeEvents',
  'analyticsDaily', 'analyticsEventReceipts',
]);
/* Written directly by the analytics Lua script, which does not maintain the
   indexes above, so these are always read by scanning. */
export const UNINDEXED_COLLECTIONS = new Set(['analyticsDaily', 'analyticsEventReceipts']);

/* Bare equality lookups hot enough to deserve their own set: memberships by
   user (+ reminder digest for the morning email job), accounts by user,
   households by owner. Merged from origin/main group indexes. */
export const INDEXED_SETS = {
  memberships: ['userId', 'reminderDigest'],
  accounts: ['userId'],
  households: ['ownerId'],
};

export const indexValue = (value) => String(comparable(value));

export const collectionKey = (name) => `${prefix}:collection:${name}`;
export const documentKey = (name, id) => `${prefix}:document:${name}:${id}`;
export const uniqueKey = (name, fields, document) => {
  const digest = createHash('sha256')
    .update(JSON.stringify(fields.map((field) => indexValue(valueAt(document, field)))))
    .digest('hex');
  return `${prefix}:unique:${name}:${fields.join(',')}:${digest}`;
};
export const householdSetKey = (name, householdId) => `${prefix}:household-index:${name}:${householdId}`;
export const valueSetKey = (name, field, value) => `${prefix}:value-index:${name}:${field}:${value}`;
