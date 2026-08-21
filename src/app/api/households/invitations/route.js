import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { requireHousehold } from '../../../../server/households.js';
import { getDatabase } from '../../../../server/database.js';
import { invitationSchema } from '../../../../server/schemas.js';
import { writeAuditEvent } from '../../../../server/audit.js';

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`invites:create:${user.id}`, 20, 3600000);
    const input = invitationSchema.parse(await request.json());
    const { household, membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    if (!['owner', 'admin'].includes(membership.role)) throw new ApiError(403, 'Household admin access required.');
    const token = randomBytes(32).toString('base64url');
    const db = await getDatabase();
    const inserted = await db.collection('invitations').insertOne({
      householdId: household._id,
      email: input.email.toLowerCase(),
      role: input.role,
      permissions: input.permissions,
      tokenHash: tokenHash(token),
      createdBy: user.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: null,
    });
    await writeAuditEvent({
      db, householdId: household._id, user, action: 'invitation.created',
      resource: inserted.insertedId.toString(), fields: input.permissions,
    });
    return NextResponse.json({ token, expiresInHours: 168 }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`invites:accept:${user.id}`, 20, 3600000);
    const { token } = await request.json();
    if (typeof token !== 'string' || token.length < 32 || token.length > 100) throw new ApiError(400, 'Invalid invitation.');
    const db = await getDatabase();
    const invite = await db.collection('invitations').findOne({
      tokenHash: tokenHash(token),
      acceptedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!invite || invite.email !== user.email?.toLowerCase()) throw new ApiError(404, 'Invitation not found.');
    await db.collection('memberships').updateOne(
      { householdId: invite.householdId, userId: user.id },
      {
        $set: {
          email: user.email,
          role: invite.role,
          permissions: invite.permissions,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    await db.collection('invitations').updateOne({ _id: invite._id }, { $set: { acceptedAt: new Date(), acceptedBy: user.id } });
    await writeAuditEvent({
      db, householdId: invite.householdId, user, action: 'invitation.accepted',
      resource: invite._id.toString(), fields: invite.permissions,
    });
    return NextResponse.json({ householdId: invite.householdId.toString() });
  } catch (error) {
    return handleApiError(error);
  }
}
