import { NextResponse } from 'next/server';
import { handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { requireHousehold } from '../../../../server/households.js';
import { aiUsageId, aiUsageSummary, reclaimAiReservations } from '../../../../server/ai-budget.js';
import { getDatabase } from '../../../../server/database.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`ai-usage:${user.id}`, 60, 3600000);
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const db = await getDatabase();
    await reclaimAiReservations(db, household._id);
    const record = await db.collection('aiUsage').findOne({ _id: aiUsageId(household._id) });
    return NextResponse.json(aiUsageSummary(record));
  } catch (error) {
    return handleApiError(error);
  }
}
