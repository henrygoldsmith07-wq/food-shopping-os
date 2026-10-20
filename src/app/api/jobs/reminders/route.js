import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleApiError } from '../../../../server/api.js';
import { getDatabase } from '../../../../server/database.js';
import { appOrigin, emailConfigured, sendEmail } from '../../../../server/email.js';
import { buildReminderDigest } from '../../../../server/reminder-digest.js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** A run sends at most this many, so one call can never run past its time limit. */
const MAX_PER_RUN = 300;
const OUTBOX_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

const validSecret = (request) => {
  const expected = process.env.CRON_SECRET || '';
  const actual = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};

/**
 * The daily job (vercel.json, 08:00 UTC): one morning email per person who
 * turned it on, about their household's day. Each send is recorded in the
 * outbox under a per-person-per-day key first, so a retried or doubled run
 * never emails anyone twice.
 */
export async function GET(request) {
  try {
    if (!validSecret(request)) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
    if (!emailConfigured()) return NextResponse.json({ sent: 0, skipped: 'email-not-configured' });
    const db = await getDatabase();
    const now = new Date();
    const origin = appOrigin(request);
    const members = (await db.collection('memberships').find({ reminderDigest: true }).toArray()).slice(0, MAX_PER_RUN);
    const outbox = db.collection('notificationOutbox');
    const counts = { sent: 0, nothingToSay: 0, alreadySent: 0, failed: 0 };
    for (const member of members) {
      if (!member.email) continue;
      const stored = await db.collection('householdStates').findOne({ householdId: member.householdId });
      const digest = buildReminderDigest(stored?.state, { now, origin });
      if (!digest) {
        counts.nothingToSay += 1;
        continue;
      }
      const dedupeKey = `${member.householdId}:${member.userId}:digest:${digest.day}`;
      try {
        await outbox.insertOne({
          householdId: member.householdId, userId: member.userId, dedupeKey, kind: 'digest',
          status: 'sending', createdAt: now, expiresAt: new Date(now.getTime() + OUTBOX_RETENTION_MS),
        });
      } catch (error) {
        if (error?.code === 11000) {
          counts.alreadySent += 1;
          continue;
        }
        throw error;
      }
      try {
        await sendEmail({ to: member.email, subject: digest.subject, text: digest.text, html: digest.html });
        await outbox.updateOne({ dedupeKey }, { $set: { status: 'sent', sentAt: new Date() } });
        counts.sent += 1;
      } catch (error) {
        await outbox.updateOne({ dedupeKey }, { $set: { status: 'failed', error: String(error.message).slice(0, 200) } });
        counts.failed += 1;
      }
    }
    return NextResponse.json(counts);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = GET;
