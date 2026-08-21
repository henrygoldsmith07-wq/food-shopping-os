const safeFields = (fields = []) =>
  [...new Set(fields.map(String))].filter((field) => /^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(field)).slice(0, 50);

export async function writeAuditEvent({
  db, householdId, user, action, resource, fields = [], version = null, deviceId = null,
}) {
  await db.collection('auditEvents').insertOne({
    householdId,
    actorId: user.id,
    actorName: String(user.name || user.email || 'Household member').slice(0, 120),
    action,
    resource,
    fields: safeFields(fields),
    version,
    deviceId: deviceId ? String(deviceId).slice(0, 100) : null,
    createdAt: new Date(),
  });
}

