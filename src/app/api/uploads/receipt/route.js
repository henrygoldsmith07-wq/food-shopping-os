import { del, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { requireHousehold } from '../../../../server/households.js';
import { getDatabase } from '../../../../server/database.js';

const MAX_SIZE = 8 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`uploads:${user.id}`, 20, 3600000);
    if (Number(request.headers.get('content-length') || 0) > MAX_SIZE + 1024 * 1024) {
      throw new ApiError(413, 'Receipt upload is too large.');
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new ApiError(503, 'Receipt storage is not configured.');
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const db = await getDatabase();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !TYPES.has(file.type) || file.size > MAX_SIZE) {
      throw new ApiError(400, 'Use a JPEG, PNG, WebP or PDF file up to 8 MB.');
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
    const blob = await put(`receipts/${household._id}/${crypto.randomUUID()}-${safeName}`, file, {
      access: 'private',
      addRandomSuffix: false,
    });
    const current = await db.collection('households').findOne({ _id: household._id });
    if (!current || current.deletingAt) {
      await del(blob.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
      throw new ApiError(410, 'Household deletion in progress.');
    }
    const now = new Date();
    const inserted = await db.collection('uploads').insertOne({
      householdId: household._id,
      userId: user.id,
      kind: 'receipt',
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      size: file.size,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    });
    const after = await db.collection('households').findOne({ _id: household._id });
    if (!after || after.deletingAt) {
      await del(blob.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
      await db.collection('uploads').deleteOne({ _id: inserted.insertedId });
      throw new ApiError(410, 'Household deletion in progress.');
    }
    return NextResponse.json({ id: inserted.insertedId.toString(), status: 'queued' }, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
