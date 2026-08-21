const indexes = [
  ['households', { personalOwnerId: 1 }, { unique: true, sparse: true, name: 'personal_owner_unique' }],
  ['memberships', { householdId: 1, userId: 1 }, { unique: true, name: 'household_user_unique' }],
  ['memberships', { userId: 1 }, { name: 'memberships_by_user' }],
  ['householdStates', { householdId: 1 }, { unique: true, name: 'state_by_household' }],
  ['invitations', { tokenHash: 1 }, { unique: true, name: 'invitation_token_unique' }],
  ['invitations', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'invitation_expiry' }],
  ['rateLimits', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'rate_limit_expiry' }],
  ['uploads', { householdId: 1, createdAt: -1 }, { name: 'uploads_by_household' }],
  ['notificationOutbox', { status: 1, scheduledAt: 1 }, { name: 'outbox_pending' }],
  ['notificationOutbox', { dedupeKey: 1 }, { unique: true, name: 'outbox_dedupe' }],
  ['auditEvents', { householdId: 1, createdAt: -1 }, { name: 'audit_by_household' }],
  ['coachShares', { tokenHash: 1 }, { unique: true, name: 'coach_share_token_unique' }],
  ['coachShares', { householdId: 1, createdAt: -1 }, { name: 'coach_shares_by_household' }],
  ['coachShares', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'coach_share_expiry' }],
];

export const id = '001-initial-backend';

export async function up(db) {
  for (const [collection, keys, options] of indexes) {
    await db.collection(collection).createIndex(keys, options);
  }
}

export async function down(db) {
  for (const [collection, , options] of [...indexes].reverse()) {
    await db.collection(collection).dropIndex(options.name);
  }
}
