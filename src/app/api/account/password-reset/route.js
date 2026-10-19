import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, readJsonBody } from '../../../../server/api.js';
import { databaseConfigured, getDatabase } from '../../../../server/database.js';
import { appOrigin, emailConfigured } from '../../../../server/email.js';
import { consumeAccountToken } from '../../../../server/account-tokens.js';
import { sendPasswordResetEmail } from '../../../../server/account-email.js';
import {
  hashPassword, MIN_PASSWORD, normaliseEmail, validEmail, validPassword,
} from '../../../../server/passwords.js';

export const dynamic = 'force-dynamic';

const clientOf = (request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
const ready = () => {
  if (!databaseConfigured || !process.env.AUTH_SECRET) throw new ApiError(503, 'The backend is not configured.');
  if (!emailConfigured()) throw new ApiError(503, 'Password reset needs email, which is not set up on this server.');
};

/**
 * Ask for a reset link. The answer is the same whether or not the address
 * has an account, so it cannot be used to find out who uses Forq.
 */
export async function POST(request) {
  try {
    assertSameOrigin(request);
    ready();
    const body = await readJsonBody(request, 2048);
    const email = normaliseEmail(body?.email);
    if (!validEmail(email)) throw new ApiError(400, 'Enter a valid email address.');
    await rateLimit(`reset:${clientOf(request)}`, 10, 3600000);
    await rateLimit(`reset-email:${email}`, 3, 3600000);
    const user = await (await getDatabase()).collection('users').findOne({ email });
    if (user) await sendPasswordResetEmail(email, appOrigin(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Set a new password with the link's token. Reading the email proves the
 * address, so the account counts as verified from here on. Every session
 * signed in before now ends (see the jwt callback in auth.js): a reset is
 * what someone does when they think another person has their password.
 */
export async function PUT(request) {
  try {
    assertSameOrigin(request);
    ready();
    await rateLimit(`reset-complete:${clientOf(request)}`, 20, 3600000);
    const body = await readJsonBody(request, 2048);
    const email = normaliseEmail(body?.email);
    if (!validPassword(body?.password)) throw new ApiError(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
    if (!validEmail(email) || !(await consumeAccountToken('reset', email, body?.token))) {
      throw new ApiError(400, 'That reset link has expired or was already used. Ask for a new one.');
    }
    const users = (await getDatabase()).collection('users');
    const user = await users.findOne({ email });
    if (!user) throw new ApiError(400, 'That reset link has expired or was already used. Ask for a new one.');
    await users.updateOne({ _id: user._id }, {
      $set: {
        passwordHash: await hashPassword(body.password),
        emailVerified: user.emailVerified || new Date(),
        passwordChangedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
