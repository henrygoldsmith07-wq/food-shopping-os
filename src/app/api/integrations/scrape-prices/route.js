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

// Scraping every retailer takes longer than a default serverless slice.
export const maxDuration = 60;
// Stop starting new items with this much of the budget gone, so the response
// is returned rather than the function being killed with the work lost.
const BATCH_BUDGET_MS = Number(process.env.SCRAPE_BATCH_BUDGET_MS || 40000);
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
 * Check prices for one product, or for a batch of list items.
 *
 * The client sends a whole shopping list as consecutive batches, so the limit
 * is per request rather than per list. 60 requests an hour at up to 12 items
 * each covers any realistic list several times over, and still falls far short
 * of anything a retailer would call abusive.
 *
 * Each item fans out across every configured shop, so a batch can outlive the
 * function's own time budget. Rather than being killed mid-flight and losing
 * the work, the loop stops at a deadline and returns what it has with
 * `remaining` naming the items it did not reach — the client sends those on.
 */
export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!scraperEnabled()) throw new ApiError(503, 'Live price checking is switched off.');
    await rateLimit(`scrape-prices:${user.id}`, 60, 3600000);

    const body = await request.json().catch(() => {
      throw new ApiError(400, 'Expected a JSON body.');
    });

    if (Array.isArray(body?.items)) {
      const input = scrapeListRequestSchema.parse(body);
      const deadline = Date.now() + BATCH_BUDGET_MS;
      const checks = [];
      const remaining = [];
      for (const item of input.items) {
        // Sequential per item: one item already fans out across every shop,
        // and stacking whole items on top of that is what gets an IP blocked.
        if (Date.now() > deadline) {
          remaining.push(item);
          continue;
        }
        checks.push(await scrapePrices(item, { retailerIds: input.retailerIds || [] }));
      }
      return NextResponse.json({ checks, remaining, checkedAt: new Date().toISOString() });
    }

    const input = scrapeRequestSchema.parse(body);
    const result = await scrapePrices(input.query, { retailerIds: input.retailerIds || [] });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
