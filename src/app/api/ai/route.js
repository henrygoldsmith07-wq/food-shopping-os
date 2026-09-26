import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser } from '../../../server/api.js';
import { requireHousehold } from '../../../server/households.js';
import { aiRequestSchema } from '../../../server/schemas.js';
import { classifyAiFailure, freeChat, isOpenRouterConfigured } from '../../../server/openrouter.js';
import {
  releaseAiBudget, reserveAiBudget, settleAiBudget, tokenReservation,
} from '../../../server/ai-budget.js';
import { classifyAiRequest, deterministicAnswer } from '../../../server/classify-deterministic.js';
import { noteLlmCallsAvoided } from '../../../server/classifier-adapter.js';

const system = `You are Forq, a UK food shopping assistant. Use UK English.
Treat allergy and health information as constraints, never diagnoses.
Do not invent live prices, stock, offers or retailer availability.
Return concise JSON with keys "answer", "suggestions" and "warnings".`;

export async function POST(request) {
  let reservation;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { household } = await requireHousehold(user, request.headers.get('x-forq-household-id'));
    const input = aiRequestSchema.parse(await request.json());

    // Route before spending anything. A question the taxonomy layer can answer
    // outright — which aisle, which meal slot — is answered from the rules, no
    // model involved, and counted as a general LLM call avoided. Everything
    // else, including every allergy and health question, goes to the assistant
    // below: never to the classifier.
    const routed = classifyAiRequest(input);
    if (routed.route === 'deterministic') {
      const answer = deterministicAnswer(routed);
      if (answer) {
        noteLlmCallsAvoided(1, 'routing');
        return NextResponse.json({
          output: JSON.stringify({ answer, suggestions: [], warnings: [] }),
          provider: 'deterministic',
          routed: routed.intent,
        });
      }
    }

    // Free-tier models (NVIDIA NIM first, OpenRouter second) are unmetered for
    // the household: only a light abuse guard applies, and the monthly AI
    // budget is not touched.
    await rateLimit(`ai:${user.id}`, isOpenRouterConfigured() ? 200 : 30, 3600000);
    if (!isOpenRouterConfigured() && !process.env.OPENAI_API_KEY) {
      throw new ApiError(503, 'AI is not configured. Add NVIDIA_API_KEY, OPENROUTER_API_KEY or OPENAI_API_KEY.');
    }

    if (isOpenRouterConfigured()) {
      try {
        const { text, provider, model } = await freeChat({
          system,
          user: JSON.stringify({ task: input.task, prompt: input.prompt, context: input.context || {} }),
        });
        // Provenance is the actual provider + model, e.g. { provider: 'nvidia',
        // model: '…' } — never a hard-coded label for the other provider.
        return NextResponse.json({ output: text, provider, model });
      } catch (error) {
        // Only retry-model failures fall through to the paid relay: the ladder
        // had an answer but every rung refused this request. A permanent
        // failure (bad input/auth) or a provider-wide outage (retry-provider)
        // must surface, not be re-spent on a paid call for the same outcome.
        // With no paid relay configured, report the free-tier failure honestly.
        if (classifyAiFailure(error) !== 'retry-model') throw error;
        if (!process.env.OPENAI_API_KEY) throw error;
      }
    }

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
    return NextResponse.json({
      output: response.output_text,
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    });
  } catch (error) {
    try {
      await releaseAiBudget(reservation);
    } catch (releaseError) {
      if (releaseError?.code !== 'HOUSEHOLD_DELETING') console.error('AI budget release failed', releaseError);
    }
    return handleApiError(error);
  }
}
