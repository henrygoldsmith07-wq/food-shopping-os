import { NextResponse } from 'next/server';
import { handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { priceLookupSchema } from '../../../../server/schemas.js';
import { lookupOpenPrices } from '../../../../server/retailer-providers.js';

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`price-lookup:${user.id}`, 120, 3600000);
    const url = new URL(request.url);
    const input = priceLookupSchema.parse({
      barcode: url.searchParams.get('barcode') || undefined,
      query: url.searchParams.get('query') || undefined,
    });
    const prices = await lookupOpenPrices(input);
    return NextResponse.json({
      prices,
      source: 'open-prices',
      sourceLabel: 'Open Prices (community observed)',
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
