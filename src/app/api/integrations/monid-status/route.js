import { NextResponse } from 'next/server';
import { ApiError, handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { monidOnPath, monidStatus } from '../../../../server/monid-prices.js';

// A balance read is one CLI subprocess — no reason for a client to want many,
// and the display polls it, so the limit is tight but not single-digit.
export const dynamic = 'force-dynamic';

/**
 * What the provenance panel needs before it draws anything: is Monid wired up
 * on this deployment, and what is left of the workspace balance that paid
 * lookups draw down.
 *
 * GET is also the "can the panel render at all" probe: `configured: false`
 * means the panel explains how to turn Monid on, rather than pretending the
 * rows have no provenance.
 */
export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`monid-status:${user.id}`, 30, 60000);
    const status = monidOnPath()
      ? await monidStatus()
      : { configured: false, balance: null, note: 'Monid is not set up on this deployment — paid lookups are off and every price shown was read from a shop page directly.' };
    return NextResponse.json(status);
  } catch (error) {
    return handleApiError(error);
  }
}
