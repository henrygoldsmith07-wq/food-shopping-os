import { createHash } from 'node:crypto';
import { ApiError } from './api.js';
import { getDatabase } from './database.js';

export const coachTokenHash = (token) => createHash('sha256').update(token).digest('hex');

const pick = (state, keys) =>
  Object.fromEntries(keys.filter((key) => key in (state || {})).map((key) => [key, state[key]]));

const SCOPE_FIELDS = {
  diary: ['log', 'cooked'],
  nutrition: ['goal', 'diets', 'allergies', 'intolerances', 'targets', 'weeklyKcal'],
  plan: ['plan'],
  health: ['body', 'measurements', 'vitals', 'sleep', 'stress', 'cycles', 'workouts', 'bloods', 'glucose'],
};

export const coachSnapshot = (state, scopes) => ({
  ...Object.fromEntries(scopes.map((scope) => [scope, pick(state, SCOPE_FIELDS[scope] || [])])),
});

export async function readCoachShare(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 120) {
    throw new ApiError(404, 'Coach share not found.');
  }
  const db = await getDatabase();
  const share = await db.collection('coachShares').findOne({
    tokenHash: coachTokenHash(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!share) throw new ApiError(404, 'Coach share not found or no longer active.');
  const [household, document] = await Promise.all([
    db.collection('households').findOne({ _id: share.householdId }, { projection: { name: 1, updatedAt: 1 } }),
    db.collection('householdStates').findOne({ householdId: share.householdId }, { projection: { state: 1, version: 1, updatedAt: 1 } }),
  ]);
  if (!household || !document?.state) throw new ApiError(404, 'No shared household data is available.');
  await db.collection('coachShares').updateOne(
    { _id: share._id },
    { $set: { lastViewedAt: new Date() }, $inc: { viewCount: 1 } },
  );
  await db.collection('auditEvents').insertOne({
    householdId: share.householdId,
    actorId: `coach-link:${share._id}`,
    actorName: share.label,
    action: 'coach-share.viewed',
    resource: share._id.toString(),
    fields: share.scopes,
    version: document.version,
    deviceId: null,
    createdAt: new Date(),
  });
  return {
    household: { name: household.name },
    label: share.label,
    scopes: share.scopes,
    expiresAt: share.expiresAt,
    updatedAt: document.updatedAt,
    version: document.version,
    data: coachSnapshot(document.state, share.scopes),
  };
}
