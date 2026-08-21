import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '../../../../server/api.js';
import { getDatabase } from '../../../../server/database.js';

const validSecret = (request) => {
  const expected = process.env.CRON_SECRET || '';
  const actual = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};

const localParts = (date, timeZone) => {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return localParts(date, 'UTC');
  }
  return Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
};

const dueTimes = (reminder, parts) => {
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  if (Array.isArray(reminder.days) && reminder.days.length && !reminder.days.includes(weekday)) return [];
  const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  return (reminder.times || []).filter((time) => {
    const [hour, minute] = String(time).split(':').map(Number);
    const dueMinutes = hour * 60 + minute;
    return nowMinutes >= dueMinutes && nowMinutes < dueMinutes + 15;
  });
};

export async function GET(request) {
  try {
    if (!validSecret(request)) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
    const db = await getDatabase();
    const now = new Date();
    const states = await db.collection('householdStates').find(
      { 'state.reminders.0': { $exists: true } },
      { projection: { householdId: 1, 'state.reminders': 1, 'state.syncTimeZone': 1 } },
    ).limit(500).toArray();
    const jobs = states.flatMap((document) => {
      const parts = localParts(now, document.state.syncTimeZone || 'UTC');
      const day = `${parts.year}-${parts.month}-${parts.day}`;
      return (document.state.reminders || [])
      .filter((reminder) => reminder.on)
      .flatMap((reminder) => dueTimes(reminder, parts).map((time) => ({
        householdId: document.householdId,
        dedupeKey: `${document.householdId}:${reminder.id}:${day}:${time}`,
        kind: reminder.kind || 'reminder',
        label: String(reminder.label || '').slice(0, 160),
        sourceId: reminder.id,
        sourceTime: time,
        status: 'pending',
        scheduledAt: now,
        createdAt: now,
      })));
    });
    let queued = 0;
    if (jobs.length) {
      const result = await db.collection('notificationOutbox').bulkWrite(
        jobs.map((job) => ({
          updateOne: {
            filter: { dedupeKey: job.dedupeKey },
            update: { $setOnInsert: job },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      queued = result.upsertedCount;
    }
    return NextResponse.json({ queued });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = GET;
