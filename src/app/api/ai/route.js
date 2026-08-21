import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../server/api.js';
import { requireHousehold } from '../../../server/households.js';
import { aiRequestSchema } from '../../../server/schemas.js';
import {
  releaseAiBudget, reserveAiBudget, settleAiBudget, tokenReservation,
} from '../../../server/ai-budget.js';

const system = `You are Forq, a UK food shopping assistant. Use UK English.
Treat allergy and health information as constraints, never diagnoses.
Do not invent live prices, stock, offers or retailer availability.
Return concise JSON with keys "answer", "suggestions" and "warnings".`;

export async function POST(request) {
  let reservation;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`ai:${user.id}`, 30, 3600000);
    if (!process.env.OPENAI_API_KEY) throw new ApiError(503, 'AI is not configured.');
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const input = aiRequestSchema.parse(await request.json());
    reservation = await reserveAiBudget(household._id, tokenReservation(input, 1200, system.length));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      input: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({ task: input.task, prompt: input.prompt, context: input.context || {} }),
        },
      ],
      max_output_tokens: 1200,
    });
    await settleAiBudget(reservation, response.usage?.total_tokens);
    reservation = null;
    return NextResponse.json({ output: response.output_text });
  } catch (error) {
    try {
      await releaseAiBudget(reservation);
    } catch (releaseError) {
      if (releaseError?.code !== 'HOUSEHOLD_DELETING') console.error('AI budget release failed', releaseError);
    }
    return handleApiError(error);
  }
}
