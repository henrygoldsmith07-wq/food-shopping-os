import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from './auth.js';
import { databaseConfigured, getDatabase } from './database.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Invalid request origin.');
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
