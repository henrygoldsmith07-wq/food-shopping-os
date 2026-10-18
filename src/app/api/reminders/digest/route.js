import { NextResponse } from 'next/server';
import {
  assertSameOrigin, handleApiError, rateLimit, readJsonBody, requireUser,
} from '../../../../server/api.js';
import { requireHousehold } from '../../../../server/households.js';
import { getDatabase } from '../../../../server/database.js';
import { emailConfigured } from '../../../../server/email.js';

export const dynamic = 'force-dynamic';

/**
 * Your own opt-in to the morning reminder email, per household. It lives on
 * your membership rather than in the shared state, so turning it on emails
 * you — never the rest of the household.
 */
export async function GET(request) {
  try {
    const user = await requireUser();
    const { membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    return NextResponse.json({ available: emailConfigured(), on: membership.reminderDigest === true, email: user.email || null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`digest:${user.id}`, 30, 3600000);
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const body = await readJsonBody(request, 1024);
    const on = body?.on === true && emailConfigured() && Boolean(user.email);
    await (await getDatabase()).collection('memberships').updateOne(
      { householdId: household._id, userId: user.id },
      { $set: { reminderDigest: on } },
    );
    return NextResponse.json({ available: emailConfigured(), on, email: user.email || null });
  } catch (error) {
    return handleApiError(error);
  }
}
