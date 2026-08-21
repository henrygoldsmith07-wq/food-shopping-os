import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../server/api.js';
import { requireHousehold } from '../../../server/households.js';
import { getDatabase } from '../../../server/database.js';
import { publishHousehold } from '../../../server/realtime.js';
import { syncSchema } from '../../../server/schemas.js';
import {
  changedStateFields, mergePermittedState, scopeHouseholdState,
} from '../../../server/household-scope.js';
import { writeAuditEvent } from '../../../server/audit.js';

const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`sync:get:${user.id}`, 180);
    const { household, membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const document = await (await getDatabase()).collection('householdStates').findOne({ householdId: household._id });
    return NextResponse.json({
      householdId: household._id.toString(),
      version: document?.version || 0,
      state: scopeHouseholdState(document?.state || null, membership.permissions),
      updatedAt: document?.updatedAt || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) throw new ApiError(413, 'Sync payload is too large.');
    const user = await requireUser();
    await rateLimit(`sync:put:${user.id}`, 90);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new ApiError(413, 'Sync payload is too large.');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Invalid JSON.');
    }
    const payload = syncSchema.parse(parsed);
    const { household, membership } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const db = await getDatabase();
    const now = new Date();
    const current = await db.collection('householdStates').findOne(
      { householdId: household._id },
      { projection: { state: 1, version: 1 } },
    );
    const incomingState = { ...payload.state };
    const preservePermissions = incomingState.__preserveHealth === true ? ['health'] : [];
    delete incomingState.__preserveHealth;
    const nextState = mergePermittedState(
      current?.state || {}, incomingState, membership.permissions, preservePermissions,
    );
    const changedFields = changedStateFields(current?.state || {}, nextState);
    let result;
    try {
      result = await db.collection('householdStates').findOneAndUpdate(
        { householdId: household._id, version: payload.version },
        {
          $set: {
            state: nextState,
            updatedAt: now,
            updatedBy: user.id,
            deviceId: payload.deviceId,
          },
          $inc: { version: 1 },
          $setOnInsert: { householdId: household._id, createdAt: now },
        },
        { upsert: payload.version === 0, returnDocument: 'after', includeResultMetadata: false },
      );
    } catch (error) {
      if (error?.code === 11000) throw new ApiError(409, 'A newer household version is available.');
      throw error;
    }
    if (!result) throw new ApiError(409, 'A newer household version is available.');
    await writeAuditEvent({
      db,
      householdId: household._id,
      user,
      action: 'household.sync',
      resource: 'state',
      fields: changedFields,
      version: result.version,
      deviceId: payload.deviceId,
    });
    await publishHousehold(household._id.toString(), {
      version: result.version,
      deviceId: payload.deviceId,
      updatedAt: now.toISOString(),
    });
    return NextResponse.json({ version: result.version, updatedAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}
