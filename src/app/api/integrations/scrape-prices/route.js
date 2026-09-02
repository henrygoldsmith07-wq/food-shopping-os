import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../../server/api.js';
import { scrapeListRequestSchema, scrapeRequestSchema } from '../../../../server/schemas.js';
import { scrapePrices, scrapeableRetailers, scraperEnabled } from '../../../../server/price-scraper.js';
import { monidBatchPrices, monidOnPath } from '../../../../server/monid-prices.js';
import { isOpenRouterConfigured } from '../../../../server/openrouter.js';
import { availableStrategies, firecrawlConfigured } from '../../../../server/crawler.js';
import { diagnoseScraper } from '../../../../server/scrape-diagnostics.js';

export const maxDuration = 60;
const BATCH_BUDGET_MS = Number(process.env.SCRAPE_BATCH_BUDGET_MS || 40000);
export const dynamic = 'force-dynamic';
const DIAGNOSE_BUDGET_MS = Number(process.env.SCRAPE_DIAGNOSE_BUDGET_MS || 45000);

export async function GET(request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get('diagnose');
    if (query !== null) {
      if (!scraperEnabled()) throw new ApiError(503, 'Live price checking is switched off.');
      await rateLimit(`scrape-diagnose:${user.id}`, 6, 3600000);
      return NextResponse.json(await diagnoseScraper(query.trim() || 'baked beans', { deadlineMs: DIAGNOSE_BUDGET_MS }));
    }
    return NextResponse.json({ enabled: scraperEnabled(), aiFallback: isOpenRouterConfigured(), monid: monidOnPath(), strategies: availableStrategies(), renderer: firecrawlConfigured() ? 'firecrawl' : 'jina', retailers: scrapeableRetailers().map((entry) => ({ id: entry.id, name: entry.name, fulfilment: entry.fulfilment })) });
  } catch (error) { return handleApiError(error); }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!scraperEnabled()) throw new ApiError(503, 'Live price checking is switched off.');
    await rateLimit(`scrape-prices:${user.id}`, 60, 3600000);
    const body = await request.json().catch(() => { throw new ApiError(400, 'Expected a JSON body.'); });
    if (Array.isArray(body?.items)) {
      const input = scrapeListRequestSchema.parse(body); const deadline = Date.now() + BATCH_BUDGET_MS; const checks = []; const remaining = [];
      for (const item of input.items) { if (Date.now() > deadline) { remaining.push(item); continue; } checks.push(await scrapePrices(item, { retailerIds: input.retailerIds || [], allowMonid: false })); }
      let monidBatch = null; const nowIso = new Date().toISOString();
      if (monidOnPath() && checks.length) {
        const gaps = [...new Set(checks.filter((check) => !(check.rows || []).some((row) => row.price > 0)).map((check) => check.query))];
        if (gaps.length) {
          try {
            const batch = await monidBatchPrices(gaps);
            if (batch.ok) {
              monidBatch = { provider: batch.provider, endpoint: batch.endpoint, items: gaps.length };
              for (const check of checks) { if ((check.rows || []).some((row) => row.price > 0)) continue; const matched = batch.byQuery.get(check.query) || []; if (matched.length) { check.rows = matched; check.status = 'ok'; check.note = null; check.source = 'monid'; } else check.monid = { status: 'no-match', provider: batch.provider, rows: 0 }; }
            } else monidBatch = { status: batch.status, items: gaps.length };
          } catch { monidBatch = { status: 'error', items: gaps.length }; }
        }
      }
      return NextResponse.json({ checks, remaining, monidBatch, checkedAt: nowIso });
    }
    const input = scrapeRequestSchema.parse(body); return NextResponse.json(await scrapePrices(input.query, { retailerIds: input.retailerIds || [] }));
  } catch (error) { return handleApiError(error); }
}
