import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, readJsonBody } from '../../../../server/api.js';
import { databaseConfigured, getDatabase } from '../../../../server/database.js';
import { appOrigin, emailConfigured } from '../../../../server/email.js';
import { sendVerificationEmail } from '../../../../server/account-email.js';
import { accountEmailSchema } from '../../../../server/schemas.js';
import {
  hashPassword, MIN_PASSWORD, normaliseEmail, passwordLoginEnabled, validEmail, validPassword,
} from '../../../../server/passwords.js';

export const dynamic = 'force-dynamic';

/**
 * Create an email-and-password account. No session is required — this is how
 * a person gets one; the client signs in with the same details straight after.
 * Rate limited per address and per client so it cannot be used to enumerate
 * accounts or fill the database.
 */
export async function POST(request) {
  try {
    assertSameOrigin(request);
    if (!process.env.AUTH_SECRET || !databaseConfigured) throw new ApiError(503, 'The backend is not configured.');
    if (!passwordLoginEnabled()) throw new ApiError(404, 'Email sign-up is switched off.');
    const client = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    await rateLimit(`register:${client}`, 10, 3600000);

    const body = accountEmailSchema.extend({
      name: z.string().max(80).optional(),
      password: z.string().max(200),
    }).parse(await readJsonBody(request, 4096));
    const email = normaliseEmail(body?.email);
    const name = String(body?.name || '').trim().slice(0, 80) || email.split('@')[0];
    if (!validEmail(email)) throw new ApiError(400, 'Enter a valid email address.');
    if (!validPassword(body?.password)) throw new ApiError(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
    await rateLimit(`register-email:${email}`, 5, 3600000);

    const users = (await getDatabase()).collection('users');
    if (await users.findOne({ email })) {
      throw new ApiError(409, 'An account with this email already exists — sign in instead.');
    }
    try {
      await users.insertOne({ email, name, passwordHash: await hashPassword(body.password), createdAt: new Date() });
    } catch (error) {
      if (error?.code === 11000) throw new ApiError(409, 'An account with this email already exists — sign in instead.');
      throw error;
    }
    // With email set up, the address has to be confirmed before the password
    // signs in; the account exists either way, so a failed send can be retried.
    if (emailConfigured()) {
      try {
        await sendVerificationEmail(email, appOrigin(request));
      } catch (error) {
        console.error('Forq verification email failed', error.message);
        return NextResponse.json({ ok: true, verify: true, sent: false }, { status: 201 });
      }
      return NextResponse.json({ ok: true, verify: true, sent: true }, { status: 201 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
