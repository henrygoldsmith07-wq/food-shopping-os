/**
 * Client side of the server AI relay (`POST /api/ai`, `GET /api/ai/usage`).
 *
 * Ask under Guidance always answers on-device first (lib/ai-assistant.js) —
 * nothing leaves the browser. The `assistant` optional tool unlocks one extra
 * path: sending a question to the household's server-backed AI relay, which
 * spends the household monthly AI budget and needs a signed-in backend.
 *
 * Privacy boundary (mirrors server/schemas.js aiRequestSchema — the server
 * re-checks, this keeps us from even sending it):
 * - context keys are allowlisted to mealNames, pantryItems and listGaps;
 * - health-shaped questions (nutrition targets, body, goals, diets,
 *   allergies, exercise, sleep, cycle, vitals) never get a server option and
 *   are always answered locally;
 * - server use needs explicit per-session consent (default off), even with
 *   the tool enabled.
 *
 * The final gate is shared: sanitiseAiContext (lib/ai-context.js) throws
 * AI_HEALTH_LEAK before anything is sent, so this module cannot drift from
 * the one allowlist.
 */

import { sanitiseAiContext } from './ai-context.js';

export const AI_TASKS = [
  'shopping',
  'nutrition',
  'recipe',
  'pantry',
  'substitution',
  'meal-plan',
  'budget',
  'waste',
  'route',
  'cooking',
];

/** Context keys the relay accepts. Anything else is refused server-side. */
export const AI_CONTEXT_ALLOWLIST = ['mealNames', 'pantryItems', 'listGaps'];

/** Questions that stay on-device no matter what: health and body. */
const LOCAL_ONLY = /nutri|protein|macro|calorie|kcal|diet|allerg|intoler|goal|target|weight|bmi|body|health|sleep|stress|cycle|period|fasting|exercis|workout|blood|glucose|vitamin|mineral|iron|caffeine|alcohol|breastfeed|pregnan|diabet|cholesterol|pressure|medicat|doctor|gp\b/i;

const TASK_PATTERNS = [
  [/bank|budget|afford|spend|cost|money|£|cheap/i, 'budget'],
  [/route|aisle|walk|order.*shop|shop.*order/i, 'route'],
  [/waste|left ?over|us(e|ing) (up|soon)|expir|off soon|going off/i, 'waste'],
  [/swap|substitut|instead of|alternative/i, 'substitution'],
  [/plan.*week|week.*plan|meal.?plan|what.*week/i, 'meal-plan'],
  [/generat.*recip|invente?d?.*dish|recipe.*from|what.*cook|cook.*with|make.*with/i, 'recipe'],
  [/pantry|kitchen|fridge|cupboard|stock/i, 'pantry'],
  [/shop|buy|grocer|basket|list/i, 'shopping'],
  [/how (do|to).*(cook|make|bake|fry|roast)|temperature|timing|defrost/i, 'cooking'],
];

/**
 * Which relay task a question is, or null when it must stay local (health
 * and body) or matches nothing the relay handles (local answers cover it).
 */
export const classifyAiTask = (question) => {
  const text = String(question || '');
  if (!text.trim()) return null;
  if (LOCAL_ONLY.test(text)) return null;
  for (const [pattern, task] of TASK_PATTERNS) {
    if (pattern.test(text)) return task;
  }
  return null;
};

const names = (items, pick, limit) => {
  const out = [];
  for (const item of items || []) {
    if (out.length >= limit) break;
    const name = pick(item);
    if (typeof name === 'string' && name.trim().length > 1) out.push(name.trim().slice(0, 80));
  }
  return [...new Set(out)];
};

/**
 * Allowlisted relay context built from the household state. Only names —
 * never quantities with health meaning, never targets, goals, body, diets,
 * allergies or any health field. Capped well under the server's 12,000-char
 * context limit.
 */
export const buildAiContext = (app = {}) => {
  const context = {};
  const book = [...(app.safeRecipes || []), ...(app.myRecipes || [])];
  const byId = new Map(book.map((recipe) => [recipe.id, recipe]));
  const mealNames = [];
  const today = app.day;
  for (const [date, slots] of Object.entries(app.plan || {})) {
    if (today && date < today) continue;
    if (mealNames.length >= 12) break;
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      const id = slots?.[slot];
      const recipe = typeof id === 'string' ? byId.get(id) : null;
      if (recipe?.name) mealNames.push(recipe.name);
    }
  }
  if (mealNames.length) context.mealNames = [...new Set(mealNames)].slice(0, 12);
  const pantryItems = names(app.pantry, (item) => item?.name, 40);
  if (pantryItems.length) context.pantryItems = pantryItems;
  const listGaps = names(
    (app.shoppingList || []).filter((item) => !item.checked),
    (item) => item?.name,
    20,
  );
  if (listGaps.length) context.listGaps = listGaps;
  return context;
};

/** True when every key survives the server allowlist. */
export const isRelayContextClean = (context = {}) =>
  Object.keys(context).every((key) => AI_CONTEXT_ALLOWLIST.includes(key));

/**
 * The relay answers `{ answer, suggestions, warnings }` as a JSON string.
 * Parse it defensively: unparseable output is shown as plain text rather
 * than dropped, and anything missing becomes an empty list, never invented.
 */
export const parseAiOutput = (output) => {
  const fallback = { answer: '', suggestions: [], warnings: [] };
  if (typeof output !== 'string' || !output.trim()) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { ...fallback, answer: output.slice(0, 2000) };
  }
  if (typeof parsed === 'string') return { ...fallback, answer: parsed.slice(0, 2000) };
  if (!parsed || typeof parsed !== 'object') return fallback;
  const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, 10) : []);
  return {
    answer: typeof parsed.answer === 'string' ? parsed.answer.slice(0, 2000) : '',
    suggestions: list(parsed.suggestions),
    warnings: list(parsed.warnings),
  };
};

const readHouseholdHeader = () => {
  try {
    const meta = JSON.parse(localStorage.getItem('forq-cloud-meta-v1') || '{}');
    return meta && meta.householdId ? { 'x-forq-household-id': meta.householdId } : {};
  } catch {
    return {};
  }
};

const readJson = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `AI relay failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
};

/** POST a consented question to the household AI relay. */
export const askServerAi = async ({ task, prompt, context }) => {
  // The shared gate throws AI_HEALTH_LEAK before anything leaves the device.
  const { context: clean } = sanitiseAiContext(context);
  return fetch('/api/ai', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...readHouseholdHeader() },
    body: JSON.stringify({ task, prompt, context: clean }),
  }).then(readJson);
};

/** Current month's household AI budget, or throws (signed out / offline). */
export const fetchAiUsage = () =>
  fetch('/api/ai/usage', {
    credentials: 'same-origin',
    headers: readHouseholdHeader(),
  }).then(readJson);
