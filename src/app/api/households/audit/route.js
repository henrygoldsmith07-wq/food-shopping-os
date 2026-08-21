import { NextResponse } from 'next/server';
import { handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { requireHousehold } from '../../../../server/households.js';
import { getDatabase } from '../../../../server/database.js';

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`audit:get:${user.id}`, 60, 3600000);
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const events = await (await getDatabase()).collection('auditEvents')
      .find({ householdId: household._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .project({
        actorId: 1, actorName: 1, action: 1, resource: 1, fields: 1,
        version: 1, deviceId: 1, createdAt: 1,
      })
      .toArray();
    return NextResponse.json(events.map((event) => ({
      id: event._id.toString(),
      actorId: event.actorId,
      actorName: event.actorName,
      action: event.action,
      resource: event.resource,
      fields: event.fields,
      version: event.version,
      deviceId: event.deviceId,
      createdAt: event.createdAt,
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

