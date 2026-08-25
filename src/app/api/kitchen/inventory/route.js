import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../../server/api.js';
import { kitchenInventorySchema } from '../../../../server/schemas.js';
import { freeChat, freeVision, isOpenRouterConfigured } from '../../../../server/openrouter.js';
import { INVENTORY_SYSTEM, inventoryPrompt, parseInventoryList } from '../../../../server/inventory-extract.js';

/**
 * "What's in my kitchen", read by a model.
 *
 * This is an assist, not the mechanism. The browser can already parse typed,
 * spoken and pasted text on its own, and does — see lib/kitchen-inventory.js.
 * What a model adds is the awkward middle: a rambling sentence, a photo of a
 * shelf, a list written the way a person writes lists rather than the way a
 * parser likes them.
 *
 * It returns lines of text, not pantry rows. The same local parser then reads
 * those lines, so a model can never smuggle in a confidence level, a category
 * or a quantity the app would otherwise have marked as unknown.
 */

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`kitchen-inventory:${user.id}`, 60, 3600000);
    if (!isOpenRouterConfigured()) {
      throw new ApiError(503, 'Reading a kitchen photo needs an AI provider configured. Type or paste the list instead.');
    }
    const input = kitchenInventorySchema.parse(await request.json());

    let result;
    try {
      result = input.image
        ? await freeVision({
          system: INVENTORY_SYSTEM,
          user: 'List the food you can actually see in this photo, one item per line.',
          image: input.image,
        })
        : await freeChat({ system: INVENTORY_SYSTEM, user: inventoryPrompt(input.text) });
    } catch (error) {
      if (error?.message === 'no-vision-model') {
        throw new ApiError(503, 'No available model can read a photo right now. Type what you have instead.');
      }
      if (error?.message === 'no-free-model' || error?.status === 402) {
        throw new ApiError(503, 'No AI model is available right now. Type or paste the list instead.');
      }
      if (error?.status === 429) throw new ApiError(429, 'The AI provider is rate limiting us. Try again shortly.');
      throw error;
    }

    const lines = parseInventoryList(result.text);
    if (!lines.length) {
      throw new ApiError(422, input.image
        ? 'No food could be made out in that photo. Try a brighter one, or type what you have.'
        : 'Nothing in that read as food. Try listing the items one per line.');
    }
    return NextResponse.json({
      // Text, deliberately: the browser parses it and decides how sure to be.
      text: lines.join('\n'),
      lines,
      model: result.model,
      read: input.image ? 'vision' : 'text',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
