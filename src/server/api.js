// @ts-check
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from './auth.js';
import { databaseConfigured, getDatabase } from './database.js';

export class ApiError extends Error {
  /** @type {number} */
  status;
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Shared CSRF guard for every mutating API route. Safe methods and
 * same-origin browser navigations (no Origin header) pass; a cross-site
 * Origin is rejected. Read-only GET probes (health/readiness/status) and the
 * cron job (bearer secret) are the only sanctioned exceptions.
 * @param {{ headers: { get(name: string): string | null }, url: string }} request
 */
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  // `request.url` is rebuilt from the server's own host, which behind a tunnel
  // or a proxy is not the host the browser actually used. The Host header is
  // what the browser aimed at, and Origin-vs-Host is the classic CSRF check:
  // a cross-site page can forge neither of them to match.
  const host = request.headers.get('host');
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return;
  if (origin === new URL(request.url).origin) return;
  throw new ApiError(403, 'Invalid request origin.');
}

export async function requireUser() {
  if (!process.env.AUTH_SECRET || !databaseConfigured) {
    throw new ApiError(503, 'The backend is not configured.');
  }
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, 'Sign in required.');
  return session.user;
}

export async function rateLimit(key, limit = 120, windowMs = 60000) {
  const db = await getDatabase();
  const window = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const id = `${key}:${window.toISOString()}`;
  const result = await db.collection('rateLimits').findOneAndUpdate(
    { _id: id },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(window.getTime() + windowMs * 2) } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );
  if (result.count > limit) throw new ApiError(429, 'Too many requests.');
}

export function objectId(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new ApiError(400, `Invalid ${label}.`);
  }
  return value;
}

/**
 * Read a JSON body with a shared size cap, so no route accepts an unbounded
 * payload. Returns the parsed value; throws 413 over the cap, 400 on
 * malformed JSON. Routes that accept multipart uploads (receipts) or have
 * their own documented cap keep their bespoke check and are listed in the
 * API-contract test's exceptions.
 * @param {{ text(): Promise<string> }} request
 * @param {number} [maxBytes]
 */
export async function readJsonBody(request, maxBytes = 256 * 1024) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ApiError(413, 'Request body is too large.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Invalid JSON.');
  }
}

export function handleApiError(error) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error?.code === 'HOUSEHOLD_DELETING') {
    return NextResponse.json({ error: 'Household deletion in progress.' }, { status: 410 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request.', issues: error.issues }, { status: 400 });
  }
  console.error('Forq API error', error);
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}
