/**
 * Turning gathered source material into a structured recipe draft.
 *
 * The model's job here is narrow on purpose: read what the page or caption
 * actually said and lay it out. It is told, in the system prompt and again in
 * the shape of the schema, that a missing quantity stays missing — because a
 * model asked for "400 g chicken" when the caption said "some chicken" will
 * happily supply the 400 g, and the user would have no way to tell.
 *
 * Whatever comes back is treated as untrusted text: parsed leniently, clipped
 * to sane limits, and stripped of anything that is not a recipe field. The
 * draft is then shown to the user to check before it is saved anywhere.
 */

export const MAX_INGREDIENTS = 60;
export const MAX_STEPS = 40;
export const MAX_LINE = 200;

export const RECIPE_SYSTEM = `You extract recipes from text. Use UK English.

Return ONLY a JSON object, no prose and no code fences, shaped like:
{"title":"","servings":0,"time":0,"ingredients":["500 g chicken thighs"],"steps":["Heat the oven to 200C."],"notes":""}

Rules you must follow:
- Use only what the source text says. Never add an ingredient, a quantity, a
  step or a time that is not there.
- If a quantity is not stated, write the ingredient without one. Do not guess.
- If servings or time are not stated, use 0.
- If the text is not a recipe, or has no ingredients in it, return
  {"title":"","servings":0,"time":0,"ingredients":[],"steps":[],"notes":""}.
- Keep each ingredient on its own line, quantity first, as written.
- Do not translate, do not add health claims, do not add prices.`;

export const extractionPrompt = (material) =>
  `Extract the recipe from this source material.\n\n${String(material || '').slice(0, 12000)}`;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LINE);

const asLines = (value, limit) => {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? String(value).split('\n') : [];
  return list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.text || entry?.name || ''))
    .map(clean)
    .filter((line) => line.length >= 2)
    .slice(0, limit);
};

const wholeNumber = (value, max) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, max) : 0;
};

/**
 * Find the JSON object in whatever the model returned.
 *
 * Free models fence their output, apologise before it, or narrate after it.
 * None of that is an error worth failing an import over, so the first balanced
 * object in the response is taken and the rest ignored.
 */
export const extractJsonObject = (text) => {
  const source = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  const start = source.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

/**
 * A model response, read as a recipe draft.
 *
 * Returns null when there is no recipe in it — an empty title or no
 * ingredients means the source had nothing to extract, and an empty draft is
 * more useful to the user than an invented one.
 */
export const parseRecipeDraft = (text) => {
  const raw = extractJsonObject(text);
  if (!raw || typeof raw !== 'object') return null;
  const title = clean(raw.title || raw.name).slice(0, 90);
  const ingredients = asLines(raw.ingredients ?? raw.recipeIngredient, MAX_INGREDIENTS);
  if (!title || !ingredients.length) return null;
  return {
    title,
    servings: wholeNumber(raw.servings ?? raw.recipeYield, 24),
    time: wholeNumber(raw.time ?? raw.totalTime, 600),
    ingredients,
    steps: asLines(raw.steps ?? raw.recipeInstructions, MAX_STEPS),
    notes: clean(raw.notes).slice(0, 300),
  };
};

/**
 * A draft laid back out as the plain recipe text the app already knows how to
 * parse, match against the food catalogue and cost. One format in the app, not
 * two — the AI path joins the paste path here rather than running beside it.
 */
export const draftToRecipeText = (draft) => {
  if (!draft) return '';
  return [
    draft.title,
    draft.servings ? `Serves ${draft.servings}` : '',
    ...draft.ingredients,
    draft.steps.length ? 'Method' : '',
    ...draft.steps,
  ].filter(Boolean).join('\n');
};
