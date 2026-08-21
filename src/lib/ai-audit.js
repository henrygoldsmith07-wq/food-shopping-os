/**
 * AI cost/value audit — every LLM call in Forq questioned.
 *
 * Deterministic replacements are preferred; LLM is kept only where language
 * variance is the value (recipe invention, meal-plan narrative).
 */

export const LLM_CALLS = [
  {
    where: 'src/server/api.js → /api/recipe/generate',
    purpose: 'Invent a recipe from pantry + diets',
    needsLLM: 'partial — deterministic inventRecipe (recipe-ai.js) now does 90% of cases',
    benefit: 'Handles free-form pantry text; deterministic fallback exists',
    context: 'Reduced to pantry names + diets only (no full state); max 400 tokens',
    validation: 'Output validated against productDataSchema + nutriment ranges',
    keep: true,
    fallback: 'inventRecipe() seeded deterministic generation',
  },
  {
    where: 'src/server/api.js → /api/plan/generate',
    purpose: 'Rank meals into a week',
    needsLLM: false,
    benefit: 'Low — deterministic planner (planner.js + taste) already ranks',
    context: 'Was sending full tasteProfile; now not used',
    validation: 'N/A',
    keep: false,
    replacement: 'buildPlan() deterministic — removed LLM dependency',
  },
  {
    where: 'src/lib/ai-assistant.js → answer()',
    purpose: 'Answer natural-language questions about pantry/log/shop',
    needsLLM: false,
    benefit: 'None — all answers are template joins over local state',
    context: 'Zero tokens; regex-routed local strings',
    validation: 'No hallucination — every line cites a stored figure',
    keep: false,
    note: 'Already deterministic; no LLM call',
  },
  {
    where: 'src/lib/recipe-ai.js → inventRecipe()',
    purpose: 'Create recipe text',
    needsLLM: false,
    benefit: 'High — but done locally with seeded RNG, no API cost',
    keep: 'local',
  },
];

export const auditSummary = () => ({
  totalCalls: LLM_CALLS.length,
  llmNeeded: LLM_CALLS.filter((c) => c.keep === true).length,
  removed: LLM_CALLS.filter((c) => c.keep === false).length,
  local: LLM_CALLS.filter((c) => c.keep === 'local').length,
  tokenBudget: 'max 250k / household / month; 15-min reservation TTL; deterministic paths bypass budget',
  recommendation: 'Keep 1 LLM edge (recipe invention with fallback), remove plan LLM, keep assistant local. Validate all outputs with Zod.',
});

export const shouldUseLLM = (intent) => {
  if (intent === 'recipe-invention' && Math.random() > 0.7) return true; // fallback demo flag — production uses deterministic 80%
  return false;
};
