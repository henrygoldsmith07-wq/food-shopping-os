import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, readJsonBody } from '../../../../server/api.js';
import { databaseConfigured, getDatabase } from '../../../../server/database.js';
import { appOrigin, emailConfigured } from '../../../../server/email.js';
import { consumeAccountToken } from '../../../../server/account-tokens.js';
import { sendVerificationEmail } from '../../../../server/account-email.js';
import { normaliseEmail, validEmail } from '../../../../server/passwords.js';

export const dynamic = 'force-dynamic';

const clientOf = (request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

/**
 * The link in the confirmation email. No session: the one-time token is the
 * proof. Lands back on the app with ?verified=1 (or 0 for a dead link).
 */
export async function GET(request) {
  const origin = appOrigin(request);
  try {
    if (!databaseConfigured) throw new ApiError(503, 'The backend is not configured.');
    await rateLimit(`verify:${clientOf(request)}`, 30, 3600000);
    const params = new URL(request.url).searchParams;
    const email = normaliseEmail(params.get('email'));
    const ok = validEmail(email) && await consumeAccountToken('verify', email, params.get('token'));
    if (ok) await (await getDatabase()).collection('users').updateOne({ email }, { $set: { emailVerified: new Date() } });
    return NextResponse.redirect(`${origin}/?verified=${ok ? 1 : 0}`, 303);
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return NextResponse.redirect(`${origin}/?verified=0`, 303);
    return handleApiError(error);
  }
}

/**
 * Send the confirmation email again. Always answers the same way, so it
 * cannot be used to learn which addresses have accounts.
 */
export async function POST(request) {
  try {
    assertSameOrigin(request);
    if (!databaseConfigured || !emailConfigured()) throw new ApiError(503, 'Email is not set up on this server.');
    const body = await readJsonBody(request, 2048);
    const email = normaliseEmail(body?.email);
    if (!validEmail(email)) throw new ApiError(400, 'Enter a valid email address.');
    await rateLimit(`verify-resend:${clientOf(request)}`, 10, 3600000);
    await rateLimit(`verify-resend-email:${email}`, 3, 3600000);
    const user = await (await getDatabase()).collection('users').findOne({ email });
    if (user?.passwordHash && !user.emailVerified) await sendVerificationEmail(email, appOrigin(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
