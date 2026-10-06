/**
 * Safe AI context: meal names, pantry items, and list gaps only.
 *
 * Health-adjacent fields (body, measurements, vitals, sleep, stress, cycles,
 * workouts, bloods, glucose, targets, goals, diets, allergies, intolerances)
 * must never reach a model or analytics route. This module is the single
 * builder, and the server schema rejects anything else.
 */

export const AI_CONTEXT_KEYS = ['mealNames', 'pantryItems', 'listGaps'];

const HEALTH_KEYS = new Set([
  'body', 'measurements', 'vitals', 'sleep', 'stress', 'cycles', 'cycle',
  'workouts', 'exercise', 'bloods', 'glucose', 'cgm', 'targets', 'goal',
  'goals', 'diets', 'allergies', 'intolerances', 'health', 'weightKg',
  'heightCm', 'age', 'sex', 'maintenanceKcal', 'weeklyKcal', 'kcal',
  'protein', 'carbs', 'fat', 'fibre', 'healthVault', 'vault',
]);

export const isHealthKey = (key) => HEALTH_KEYS.has(String(key));

/**
 * Build the only context an AI request may carry.
 * Pure: same state in, same safe context out. Never includes health fields.
 */
export const buildSafeAiContext = (app = {}) => {
  const plan = app.plan || {};
  const mealNames = [...new Set(
    Object.values(plan)
      .flatMap((day) => Object.values(day || {}))
      .filter(Boolean)
      .map((id) => String(id)),
  )].slice(0, 50);
  const pantryItems = (app.pantry || []).slice(0, 100).map((item) => String(item?.name || '').slice(0, 120)).filter(Boolean);
  const listGaps = (app.shoppingList || []).filter((row) => !row.checked).slice(0, 100).map((row) => String(row?.name || '').slice(0, 120)).filter(Boolean);
  return { mealNames, pantryItems, listGaps };
};

/**
 * Strip anything that is not an allowlisted key, and throw on health keys.
 * Server and tests share this: a health field is a bug, not a filter miss.
 */
export const sanitiseAiContext = (context = {}) => {
  const out = {};
  for (const key of AI_CONTEXT_KEYS) {
    if (key in (context || {})) out[key] = context[key];
  }
  const rejected = Object.keys(context || {}).filter((key) => !AI_CONTEXT_KEYS.includes(key));
  const healthLeak = rejected.filter(isHealthKey);
  if (healthLeak.length) {
    const error = new Error(`AI context must not include health fields: ${healthLeak.join(', ')}`);
    error.code = 'AI_HEALTH_LEAK';
    throw error;
  }
  return { context: out, dropped: rejected };
};
