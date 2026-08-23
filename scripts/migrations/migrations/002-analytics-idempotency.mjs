const indexes = [
  ['analyticsDaily', { householdId: 1, day: -1, event: 1 }, { unique: true, name: 'analytics_daily_unique' }],
  ['analyticsEventReceipts', { householdId: 1, eventId: 1 }, { unique: true, name: 'analytics_event_receipt_unique' }],
  ['analyticsEventReceipts', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'analytics_event_receipt_expiry' }],
];

export const id = '002-analytics-idempotency';

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
