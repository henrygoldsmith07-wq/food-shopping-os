import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, objectId, rateLimit, requireUser,
} from '../../../server/api.js';
import { writeAuditEvent } from '../../../server/audit.js';
import { coachTokenHash } from '../../../server/coach-shares.js';
import { requireHousehold } from '../../../server/households.js';
import { getDatabase } from '../../../server/database.js';
import { coachShareSchema } from '../../../server/schemas.js';

const requireAdmin = (membership) => {
  if (!['owner', 'admin'].includes(membership.role) && !membership.permissions?.includes('admin')) {
    throw new ApiError(403, 'Household admin access required.');
  }
};

const publicShare = (share) => ({
  id: share._id.toString(),
  label: share.label,
  scopes: share.scopes,
  expiresAt: share.expiresAt,
  revokedAt: share.revokedAt,
  createdAt: share.createdAt,
  lastViewedAt: share.lastViewedAt || null,
  viewCount: share.viewCount || 0,
});

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`coach-shares:get:${user.id}`, 60, 3600000);
    const { household, membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    requireAdmin(membership);
    const shares = await (await getDatabase()).collection('coachShares')
      .find({ householdId: household._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return NextResponse.json(shares.map(publicShare));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`coach-shares:create:${user.id}`, 10, 3600000);
    const input = coachShareSchema.parse(await request.json());
    const { household, membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    requireAdmin(membership);
    if (input.scopes.includes('health') && !membership.permissions?.includes('health')) {
      throw new ApiError(403, 'Health sharing permission is required.');
    }
    const db = await getDatabase();
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const document = {
      householdId: household._id,
      label: input.label,
      scopes: input.scopes,
      tokenHash: coachTokenHash(token),
      createdBy: user.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.expiresInDays * 86400000),
      revokedAt: null,
      viewCount: 0,
    };
    const result = await db.collection('coachShares').insertOne(document);
    await writeAuditEvent({
      db, householdId: household._id, user, action: 'coach-share.created',
      resource: result.insertedId.toString(), fields: input.scopes,
    });
    return NextResponse.json({ ...publicShare({ ...document, _id: result.insertedId }), token }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`coach-shares:revoke:${user.id}`, 20, 3600000);
    const id = new URL(request.url).searchParams.get('id');
    const { household, membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    requireAdmin(membership);
    const db = await getDatabase();
    const result = await db.collection('coachShares').updateOne(
      { _id: objectId(id, 'coach share'), householdId: household._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedBy: user.id } },
    );
    if (!result.modifiedCount) throw new ApiError(404, 'Active coach share not found.');
    await writeAuditEvent({
      db, householdId: household._id, user, action: 'coach-share.revoked',
      resource: id,
    });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return handleApiError(error);
  }
}

