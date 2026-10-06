import { NextResponse } from 'next/server';
import { ApiError, handleApiError, rateLimit } from '../../../../server/api.js';
import { readCoachShare } from '../../../../server/coach-shares.js';

export const COACH_SHARES_ENABLED = process.env.FORQ_COACH_SHARES_ENABLED === 'true';

export async function GET(_request, { params }) {
  try {
    if (!COACH_SHARES_ENABLED) throw new ApiError(403, 'Coach-share links are disabled in this build. Enable FORQ_COACH_SHARES_ENABLED and the coach tool to use them.');
    const { token } = await params;
    await rateLimit(`coach-share:view:${String(token).slice(0, 12)}`, 120, 3600000);
    return NextResponse.json(await readCoachShare(token), {
      headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

