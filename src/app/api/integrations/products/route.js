import { NextResponse } from 'next/server';
import { handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { barcodeLookupSchema } from '../../../../server/schemas.js';
import { lookupProductWithPrices } from '../../../../server/retailer-providers.js';

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`product-lookup:${user.id}`, 60, 3600000);
    const url = new URL(request.url);
    const input = barcodeLookupSchema.parse({ barcode: url.searchParams.get('barcode') });
    const result = await lookupProductWithPrices(input.barcode);
    if (!result.product) return NextResponse.json({ error: 'No product was found for that barcode.' }, { status: 404 });
    return NextResponse.json({ ...result, source: 'open-food-facts', checkedAt: new Date().toISOString() });
  } catch (error) {
    return handleApiError(error);
  }
}
