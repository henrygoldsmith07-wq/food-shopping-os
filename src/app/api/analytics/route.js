import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../server/api.js';
import { requireHousehold } from '../../../server/households.js';
import { getDatabase } from '../../../server/database.js';
import { analyticsBatchSchema } from '../../../server/schemas.js';

const stableEventId = (event) => {
  if (event.id && !event.id.startsWith('legacy-')) return event.id;
  const properties = Object.fromEntries(Object.entries(event.properties || {}).sort(([left], [right]) => left.localeCompare(right)));
  return createHash('sha256')
    .update(JSON.stringify([event.name, event.at || null, properties]))
    .digest('hex');
};

const recordWithCollections = async (db, { householdId, eventId, event, day, now }) => {
  try {
    await db.collection('analyticsEventReceipts').insertOne({
      householdId,
      eventId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 90 * 86400000),
    });
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
  }
  await db.collection('analyticsDaily').findOneAndUpdate(
    { householdId, day, event },
    {
      $inc: { count: 1 },
      $set: { updatedAt: now },
      $setOnInsert: { householdId, day, event, createdAt: now },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );
  return { duplicate: false };
};

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`analytics:${user.id}`, 120);
    const payload = analyticsBatchSchema.parse(await request.json());
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const db = await getDatabase();
    const now = new Date();
    let accepted = 0;
    for (const event of payload.events) {
      let eventDate = event.at ? new Date(event.at) : now;
      if (Number.isNaN(eventDate.getTime())
        || eventDate < new Date(now.getTime() - 90 * 86400000)
        || eventDate > new Date(now.getTime() + 86400000)) eventDate = now;
      const result = typeof db.recordAnalyticsEvent === 'function'
        ? await db.recordAnalyticsEvent({
          householdId: household._id,
          eventId: stableEventId(event),
          event: event.name,
          day: eventDate.toISOString().slice(0, 10),
          now,
        })
        : await recordWithCollections(db, {
          householdId: household._id,
          eventId: stableEventId(event),
          event: event.name,
          day: eventDate.toISOString().slice(0, 10),
          now,
        });
      if (result.deleting) throw new ApiError(410, 'Household deletion in progress.');
      if (!result.duplicate) accepted += 1;
    }
    return NextResponse.json({ accepted });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Only event uploads are supported.' }, { status: 405 });
}
