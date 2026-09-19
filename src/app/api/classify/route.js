import { NextResponse } from 'next/server';
import { assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../server/api.js';
import { classifyRequestSchema } from '../../../server/schemas.js';
import { classifierTelemetry, classifyBatch } from '../../../server/classifier-adapter.js';
import {
  aisleForProductLabel, taxonomyLabels,
} from '../../../server/classify-taxonomies.js';
import {
  deterministicProductCategory, deterministicRecipeMeal, deterministicRecipeLineKind,
} from '../../../server/classify-deterministic.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Batched text classification.
 *
 * One endpoint for the labelling work that used to be sent to a chat model or
 * guessed badly: product names (pantry additions, receipt lines, scraped
 * offers), meal slots, and lines of imported recipe text. Every response row
 * says where its label came from — `deterministic`, `classifier`, `cache` or
 * `fallback` — so a low-confidence `other` is never dressed up as knowledge.
 *
 * Product labels also carry the aisle they file under on the list, mapped from
 * the app's own aisle order; the shopper can always move it once and the list
 * remembers, so a wrong guess costs a drag, not a decision.
 *
 * Boundaries, stated rather than implied: these labels describe what a thing
 * is, never whether it is safe, healthy or permissible. Allergy, medical
 * nutrition and food-safety questions are answered by the assistant under its
 * constraint-aware system prompt and are never sent to this endpoint's
 * classifier.
 */

const DETERMINISTIC = {
  product: deterministicProductCategory,
  'recipe-meal': deterministicRecipeMeal,
  'recipe-line': deterministicRecipeLineKind,
};

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    // One batched classifier call at most — cheaper per request than the AI
    // route, so the guard is correspondingly lighter.
    await rateLimit(`classify:${user.id}`, 300, 3600000);
    const input = classifyRequestSchema.parse(await request.json());

    const results = await classifyBatch(input.taxonomy, input.items, {
      deterministic: DETERMINISTIC[input.taxonomy],
      signal: request.signal,
    });

    const rows = results.map((result) => ({
      item: result.item,
      label: result.label,
      confidence: result.confidence,
      source: result.source,
      ...(result.reason ? { reason: result.reason } : {}),
      // The shopping-list aisle, for the product taxonomy only.
      ...(input.taxonomy === 'product' ? { aisle: aisleForProductLabel(result.label) } : {}),
    }));

    return NextResponse.json({
      taxonomy: input.taxonomy,
      labels: taxonomyLabels(input.taxonomy),
      results: rows,
      telemetry: classifierTelemetry(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** The running measurement: what this layer has avoided sending to a model. */
export async function GET(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`classify-telemetry:${user.id}`, 120, 3600000);
    return NextResponse.json(classifierTelemetry());
  } catch (error) {
    return handleApiError(error);
  }
}
