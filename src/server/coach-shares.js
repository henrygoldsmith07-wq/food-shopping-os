import { createHash } from 'node:crypto';
import { ApiError } from './api.js';
import { getDatabase } from './database.js';
import { youthPolicy, YOUTH_SHARE_SCOPES } from '../lib/youth.js';

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

/**
 * Scopes a link may actually carry for this household state. Under-18
 * households never carry health records on a link — enforced here, not just
 * hidden in the UI, so a tampered client cannot smuggle the scope in at
 * creation, and links created before this check still stop serving health
 * once the household state shows under-18 mode.
 */
export const effectiveShareScopes = (state, scopes = []) => (
  youthPolicy(state || {}).strictSharing
    ? (scopes || []).filter((scope) => YOUTH_SHARE_SCOPES.includes(scope))
    : [...(scopes || [])]
);

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
  // Youth-strict households stop serving health on old links too — the audit
  // keeps the requested scopes, the snapshot carries only what is allowed now.
  const scopes = effectiveShareScopes(document.state, share.scopes);
  return {
    household: { name: household.name },
    label: share.label,
    scopes,
    expiresAt: share.expiresAt,
    updatedAt: document.updatedAt,
    version: document.version,
    data: coachSnapshot(document.state, scopes),
  };
}
