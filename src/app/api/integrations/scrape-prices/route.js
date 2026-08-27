import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../../server/api.js';
import { scrapeListRequestSchema, scrapeRequestSchema } from '../../../../server/schemas.js';
import {
  scrapePrices, scrapeableRetailers, scraperEnabled,
} from '../../../../server/price-scraper.js';
import { isOpenRouterConfigured } from '../../../../server/openrouter.js';
import { availableStrategies, firecrawlConfigured } from '../../../../server/crawler.js';

// Scraping eight retailers takes longer than a default serverless slice.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** What the scraper can currently do, so the UI can explain itself before it runs. */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({
      enabled: scraperEnabled(),
      aiFallback: isOpenRouterConfigured(),
      // The fetch ladder in force. A deployment without a renderer will miss
      // the client-rendered shops, and the UI should be able to say so.
      strategies: availableStrategies(),
      renderer: firecrawlConfigured() ? 'firecrawl' : 'jina',
      retailers: scrapeableRetailers().map((entry) => ({
        id: entry.id, name: entry.name, fulfilment: entry.fulfilment,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Check prices for one product, or for a handful of list items.
 *
 * The rate limit is deliberately tight. One call fans out to every configured
 * retailer, so 20/h is already up to 160 outbound page fetches — generous for
 * a shopping list and far short of anything a retailer would call abusive.
 */
export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!scraperEnabled()) throw new ApiError(503, 'Live price checking is switched off.');
    await rateLimit(`scrape-prices:${user.id}`, 20, 3600000);

    const body = await request.json().catch(() => {
      throw new ApiError(400, 'Expected a JSON body.');
    });

    if (Array.isArray(body?.items)) {
      const input = scrapeListRequestSchema.parse(body);
      const checks = [];
      for (const item of input.items) {
        // Sequential: each item already fans out across every shop, and a
        // parallel burst is what gets an IP blocked.
        checks.push(await scrapePrices(item, { retailerIds: input.retailerIds || [] }));
      }
      return NextResponse.json({ checks, checkedAt: new Date().toISOString() });
    }

    const input = scrapeRequestSchema.parse(body);
    const result = await scrapePrices(input.query, { retailerIds: input.retailerIds || [] });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
