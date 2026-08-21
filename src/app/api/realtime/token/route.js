import Ably from 'ably';
import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../../server/api.js';
import { databaseConfigured } from '../../../../server/database.js';
import { requireHousehold } from '../../../../server/households.js';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`realtime:${user.id}`, 30, 3600000);
    if (!process.env.ABLY_API_KEY && databaseConfigured) {
      return NextResponse.json({ fallback: 'redis' });
    }
    if (!process.env.ABLY_API_KEY) throw new ApiError(503, 'Realtime syncing is not configured.');
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const client = new Ably.Rest(process.env.ABLY_API_KEY);
    const token = await client.auth.requestToken({
      clientId: user.id,
      capability: { [`household:${household._id}`]: ['subscribe'] },
    });
    return NextResponse.json({ token: token.token, expires: token.expires });
  } catch (error) {
    return handleApiError(error);
  }
}
