import { randomUUID } from 'node:crypto';
import { ApiError } from './api.js';
import { getDatabase } from './database.js';

const DEFAULT_MONTHLY_LIMIT = 250000;
export const AI_RESERVATION_TTL_MS = 15 * 60 * 1000;

export const monthlyAiLimit = () => {
  const configured = Number(process.env.AI_MONTHLY_TOKEN_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MONTHLY_LIMIT;
};

/**
 * Reserve a conservative upper bound. Never cap the estimate to the monthly
 * limit: a request larger than the remaining allowance must be rejected
 * before it reaches the provider.
 */
export const tokenReservation = (input, outputLimit = 1200, inputOverhead = 0) =>
  JSON.stringify(input).length + outputLimit + Math.max(0, Number(inputOverhead) || 0);

export const aiUsageId = (householdId, date = new Date()) =>
  `${householdId}:${date.toISOString().slice(0, 7)}`;

const reservationPath = (reservationId) => `reservations.${reservationId}`;

const reservationExpiry = (reservation) => {
  const value = reservation?.expiresAt ? new Date(reservation.expiresAt) : null;
  return value && !Number.isNaN(value.getTime()) ? value : null;
};

const activeReservations = (record, date) => Object.entries(record?.reservations || {})
  .filter(([, reservation]) => reservationExpiry(reservation)?.getTime() > date.getTime());

const reservationTotal = (entries) => entries.reduce(
  (total, [, reservation]) => total + Math.max(0, Number(reservation?.tokens) || 0),
  0,
);

export async function reclaimAiReservations(db, householdId, date = new Date()) {
  const id = aiUsageId(householdId, date);
  const collection = db.collection('aiUsage');
  const current = await collection.findOne({ _id: id, householdId });
  if (!current) return;

  const leases = current.reservations && typeof current.reservations === 'object'
    && !Array.isArray(current.reservations) ? current.reservations : null;
  const hasLeaseMap = leases && Object.keys(leases).length > 0;
  const aggregateExpiry = current.reservationExpiresAt ? new Date(current.reservationExpiresAt) : null;
  const staleBefore = new Date(date.getTime() - AI_RESERVATION_TTL_MS);
  const legacyTokens = Math.max(0, Number(current.reserved) || 0);
  const legacyExpired = !hasLeaseMap && legacyTokens > 0 && (
    (aggregateExpiry && aggregateExpiry <= date)
    || (!aggregateExpiry && current.updatedAt && new Date(current.updatedAt) < staleBefore)
  );
  const legacyActive = !hasLeaseMap && legacyTokens > 0 && !legacyExpired;
  const active = hasLeaseMap
    ? activeReservations(current, date)
    : legacyActive ? [['legacy', {
      tokens: legacyTokens,
      expiresAt: aggregateExpiry && aggregateExpiry > date
        ? aggregateExpiry : new Date(date.getTime() + AI_RESERVATION_TTL_MS),
    }]] : [];
  const hasExpiredLease = hasLeaseMap && Object.keys(leases).length !== active.length;
  if (!hasExpiredLease && !legacyExpired && !legacyActive) return;
  const reclaimed = legacyExpired
    ? legacyTokens
    : hasLeaseMap ? reservationTotal(Object.entries(leases).filter(([id]) => !active.some(([activeId]) => activeId === id))) : 0;

  const activeMap = Object.fromEntries(active);
  const activeExpiry = active
    .map(([, reservation]) => reservationExpiry(reservation))
    .filter(Boolean)
    .sort((left, right) => right - left)[0] || null;
  const revision = current.updatedAt === undefined
    ? { updatedAt: { $exists: false } }
    : { updatedAt: current.updatedAt };
  const revisionFilter = Number.isFinite(Number(current.reservationVersion))
    ? { reservationVersion: Number(current.reservationVersion) }
    : { reservationVersion: { $exists: false }, ...revision };
  await collection.updateOne(
    { _id: id, householdId, ...revisionFilter },
    {
      $set: {
        reservations: activeMap,
        reserved: reservationTotal(active),
        reservationExpiresAt: activeExpiry,
        updatedAt: date,
      },
      $inc: { reservationVersion: 1, used: reclaimed },
    },
  );
}

export const aiUsageSummary = (record, date = new Date()) => {
  const limit = monthlyAiLimit();
  const used = Math.max(0, Number(record?.used) || 0);
  const leases = activeReservations(record, date);
  const reserved = record?.reservations && typeof record.reservations === 'object' && !Array.isArray(record.reservations)
    ? reservationTotal(leases)
    : (() => {
      const expiresAt = record?.reservationExpiresAt ? new Date(record.reservationExpiresAt) : null;
      const reservationsActive = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt > date;
      return reservationsActive ? Math.max(0, Number(record?.reserved) || 0) : 0;
    })();
  return {
    month: date.toISOString().slice(0, 7),
    used,
    reserved,
    limit,
    remaining: Math.max(0, limit - used - reserved),
  };
};

export async function reserveAiBudget(householdId, tokens) {
  const limit = monthlyAiLimit();
  if (!Number.isFinite(tokens) || tokens <= 0 || tokens > limit) {
    throw new ApiError(429, 'This request is larger than this household\'s monthly AI allowance.');
  }
  const db = await getDatabase();
  const now = new Date();
  const _id = aiUsageId(householdId);
  const reservationId = randomUUID();
  const expiresAt = new Date(now.getTime() + AI_RESERVATION_TTL_MS);
  await reclaimAiReservations(db, householdId, now);
  try {
    const usage = await db.collection('aiUsage').findOneAndUpdate(
      {
        _id,
        $expr: { $lte: [{ $add: [{ $ifNull: ['$used', 0] }, { $ifNull: ['$reserved', 0] }, tokens] }, limit] },
      },
      {
        $inc: { reserved: tokens, reservationVersion: 1 },
        $setOnInsert: {
          householdId, month: _id.slice(-7), used: 0, reservations: {}, createdAt: now,
        },
        $set: {
          updatedAt: now, limit, reservationExpiresAt: expiresAt,
          [reservationPath(reservationId)]: { tokens, expiresAt },
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!usage) throw new ApiError(429, 'This household has reached its monthly AI allowance.');
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(429, 'This household has reached its monthly AI allowance.');
    throw error;
  }
  return { id: _id, reservationId, reserved: tokens };
}

export async function settleAiBudget(reservation, used = 0) {
  if (!reservation?.reservationId) return;
  const db = await getDatabase();
  await db.collection('aiUsage').updateOne(
    { _id: reservation.id, [reservationPath(reservation.reservationId)]: { $exists: true } },
    {
      $inc: {
        reserved: -reservation.reserved,
        reservationVersion: 1,
        used: Math.max(0, Math.min(reservation.reserved, Number(used) || reservation.reserved)),
      },
      $unset: { [reservationPath(reservation.reservationId)]: 1 },
      $set: { updatedAt: new Date() },
    },
  );
}

export async function releaseAiBudget(reservation) {
  if (!reservation?.reservationId) return;
  const db = await getDatabase();
  await db.collection('aiUsage').updateOne(
    { _id: reservation.id, [reservationPath(reservation.reservationId)]: { $exists: true } },
    {
      $inc: { reserved: -reservation.reserved, reservationVersion: 1 },
      $unset: { [reservationPath(reservation.reservationId)]: 1 },
      $set: { updatedAt: new Date() },
    },
  );
}
