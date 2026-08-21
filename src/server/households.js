import { randomBytes } from 'node:crypto';
import { ApiError, objectId } from './api.js';
import { getDatabase } from './database.js';

export async function ensurePersonalHousehold(user) {
  const db = await getDatabase();
  const now = new Date();
  const household = await db.collection('households').findOneAndUpdate(
    { personalOwnerId: user.id },
    {
      $setOnInsert: {
        name: `${user.name || 'My'} household`,
        personalOwnerId: user.id,
        ownerId: user.id,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );
  if (household.deletingAt) return household;
  await db.collection('memberships').updateOne(
    { householdId: household._id, userId: user.id },
    {
      $setOnInsert: {
        email: user.email || null,
        role: 'owner',
        permissions: ['shopping', 'pantry', 'recipes', 'health', 'admin'],
        createdAt: now,
      },
    },
    { upsert: true },
  );
  return household;
}

export async function requireHousehold(user, requestedId, { allowDeleting = false } = {}) {
  const db = await getDatabase();
  const household = requestedId
    ? await db.collection('households').findOne({ _id: objectId(requestedId, 'household') })
    : await ensurePersonalHousehold(user);
  if (!household) throw new ApiError(404, 'Household not found.');
  const membership = await db.collection('memberships').findOne({
    householdId: household._id,
    userId: user.id,
  });
  if (!membership) {
    if (!(allowDeleting && household.deletingAt && String(household.ownerId) === String(user.id))) {
      throw new ApiError(403, 'You do not have access to this household.');
    }
    return { household, membership: { role: 'owner', permissions: ['admin'] } };
  }
  if (household.deletingAt && !allowDeleting) {
    throw new ApiError(410, 'Household deletion in progress.');
  }
  return { household, membership };
}

export function publicHousehold(household, membership) {
  return {
    id: household._id.toString(),
    name: household.name,
    role: membership.role,
    permissions: membership.permissions,
    personal: Boolean(household.personalOwnerId),
    updatedAt: household.updatedAt,
  };
}

const HOUSEHOLD_CHILD_COLLECTIONS = [
  'householdStates',
  'memberships',
  'invitations',
  'coachShares',
  'uploads',
  'notificationOutbox',
  'auditEvents',
  'aiUsage',
  'realtimeEvents',
  'analyticsDaily',
  'analyticsEventReceipts',
];

export async function deleteHouseholdData(db, householdId) {
  const deleted = {};
  for (const name of HOUSEHOLD_CHILD_COLLECTIONS) {
    const result = await db.collection(name).deleteMany({ householdId });
    deleted[name] = result.deletedCount || 0;
  }
  return deleted;
}

export const newHouseholdId = () => randomBytes(12).toString('hex');
