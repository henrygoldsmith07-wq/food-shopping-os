import { NextResponse } from 'next/server';
import { handleApiError, rateLimit } from '../../../../server/api.js';
import { readCoachShare } from '../../../../server/coach-shares.js';

export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    await rateLimit(`coach-share:view:${String(token).slice(0, 12)}`, 120, 3600000);
    return NextResponse.json(await readCoachShare(token), {
      headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

