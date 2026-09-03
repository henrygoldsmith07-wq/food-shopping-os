import { NextResponse } from 'next/server';
import { envStatus, validateEnv } from '../../../server/env.js';

/**
 * Readiness probe — the deployment's configuration truth in one fast trip.
 *
 * Where /api/backend/status answers "what does this deployment do and who
 * is signed in", this answers the orchestrator question: "is the
 * configuration as declared, and which services will actually work?" It
 * reads the same env contract the status route and the UI read, so the
 * three can never disagree about whether Ably is configured.
 *
 * No auth by design: like the disabled branch of the status endpoint,
 * configuration is not secret — sessions are. `ok` is true exactly when no
 * present variable violates its contract (a malformed URL is a mistake a
 * probe should catch; an absent key is just a smaller deployment).
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const { auth, ai, uploads, realtime } = envStatus();
  const validation = validateEnv();
  return NextResponse.json({
    ok: validation.ok,
    database: realtime.redis,
    realtime: realtime.ready,
    ai: ai.ready,
    uploads: uploads.ready,
    auth: auth.secret,
    validation,
  });
}