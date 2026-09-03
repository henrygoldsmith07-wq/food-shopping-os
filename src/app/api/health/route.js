import { NextResponse } from 'next/server';

/**
 * Liveness probe — the "is the process alive at all" check.
 *
 * Deliberately touches nothing: no database, no auth, no environment reads.
 * A healthy process answers 200 even while individual services are down;
 * deciding whether those services are usable is readiness's job, not this
 * endpoint's. Uptime monitors and cron schedulers probe this every minute
 * and must never be held up by a Redis timeout.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, now: new Date().toISOString() });
}