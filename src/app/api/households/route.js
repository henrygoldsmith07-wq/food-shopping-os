import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../server/api.js';
import {
  deleteHouseholdData, ensurePersonalHousehold, publicHousehold, requireHousehold,
} from '../../../server/households.js';
import { getDatabase } from '../../../server/database.js';
import { householdSchema } from '../../../server/schemas.js';

export async function GET() {
  try {
    const user = await requireUser();
    await ensurePersonalHousehold(user);
    const db = await getDatabase();
    const memberships = await db.collection('memberships').find({ userId: user.id }).toArray();
    const households = await db.collection('households').find({
      _id: { $in: memberships.map((item) => item.householdId) },
    }).toArray();
    const deletingOwned = await db.collection('households').find({
      ownerId: user.id,
      deletingAt: { $exists: true },
    }).toArray();
    const byHousehold = new Map(memberships.map((item) => [item.householdId.toString(), item]));
    const visible = [...households, ...deletingOwned.filter((item) => !households.some(
      (household) => household._id.toString() === item._id.toString(),
    ))];
    return NextResponse.json(visible.map((household) => publicHousehold(
      household,
      byHousehold.get(household._id.toString()) || { role: 'owner', permissions: ['admin'] },
    )));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`households:create:${user.id}`, 10, 3600000);
    const input = householdSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date();
    const inserted = await db.collection('households').insertOne({
      name: input.name,
      ownerId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('memberships').insertOne({
      householdId: inserted.insertedId,
      userId: user.id,
      email: user.email || null,
      role: 'owner',
      permissions: ['shopping', 'pantry', 'recipes', 'health', 'admin'],
      createdAt: now,
    });
    return NextResponse.json({ id: inserted.insertedId.toString(), name: input.name, role: 'owner' }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteReceiptBlobs = async (db, householdId) => {
  const uploads = await db.collection('uploads')
    .find({ householdId }, { projection: { pathname: 1 } })
    .toArray();
  const paths = uploads.map((upload) => upload.pathname).filter(Boolean);
  if (paths.length && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(503, 'Receipt storage deletion is not configured.');
  }
  for (let index = 0; index < paths.length; index += 100) {
    await del(paths.slice(index, index + 100), { token: process.env.BLOB_READ_WRITE_TOKEN });
  }
};

export async function DELETE(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`households:delete:${user.id}`, 5, 3600000);
    const { household, membership } = await requireHousehold(
      user,
      request.headers.get('x-forq-household-id'),
      { allowDeleting: true },
    );
    if (membership.role !== 'owner' || String(household.ownerId) !== String(user.id)) {
      throw new ApiError(403, 'Only the household owner can delete its server data.');
    }

    const db = await getDatabase();
    const marked = await db.collection('households').updateOne(
      { _id: household._id, ownerId: user.id, deletingAt: { $exists: false } },
      { $set: { deletingAt: new Date() } },
    );
    if (marked.matchedCount !== 1 && !household.deletingAt) {
      throw new ApiError(409, 'The household changed before it could be deleted.');
    }
    await deleteReceiptBlobs(db, household._id);
    const deleted = await deleteHouseholdData(db, household._id);
    await deleteReceiptBlobs(db, household._id);
    const repeated = await deleteHouseholdData(db, household._id);
    const result = await db.collection('households').deleteOne({
      _id: household._id,
      ownerId: user.id,
    });
    if (result.deletedCount !== 1) throw new ApiError(409, 'The household changed before it could be deleted.');
    const removed = Object.fromEntries(Array.from(new Set([
      ...Object.keys(deleted),
      ...Object.keys(repeated),
    ])).map((name) => [name, (deleted[name] || 0) + (repeated[name] || 0)]));

    return NextResponse.json({
      deleted: true,
      householdId: household._id.toString(),
      removed,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
