/**
 * A recipe off the screen: as plain text to send to someone, or as a clean
 * page for the browser's own print engine (Print → Save as PDF), the same way
 * reports leave the app (see report-export.js).
 *
 * Both are written at the servings the recipe page is showing, and carry the
 * cook's own note when there is one, because a printed copy without "less
 * chilli" is the wrong recipe for this kitchen.
 */

import { esc } from './report-export.js';
import { safeExternalUrl } from './recipe-tools.js';

const stepText = (step) => String(typeof step === 'string' ? step : step?.text || '').trim();
const minutes = (value) => (Number(value) > 0 ? `${Math.round(Number(value))} min` : null);

const facts = (recipe) => [
  recipe.servings ? `Serves ${recipe.servings}` : null,
  minutes(recipe.prep) && `Prep ${minutes(recipe.prep)}`,
  minutes(recipe.time) && `Cook ${minutes(recipe.time)}`,
].filter(Boolean);

/** The recipe as plain text: name, facts, ingredients, numbered method, note, source. */
export const recipeAsText = (recipe, { note = '' } = {}) => {
  if (!recipe?.name) return '';
  const ingredients = (recipe.ingredients || [])
    .map((ing) => `• ${[ing.qty, ing.name].filter(Boolean).join(' ')}`.trim());
  const steps = (recipe.steps || []).map(stepText).filter(Boolean).map((text, i) => `${i + 1}. ${text}`);
  const source = safeExternalUrl(recipe.source);
  return [
    recipe.name,
    facts(recipe).join(' · '),
    '',
    ingredients.length ? 'Ingredients' : null,
    ...ingredients,
    ingredients.length ? '' : null,
    steps.length ? 'Method' : null,
    ...steps,
    String(note || '').trim() ? `\nNote: ${String(note).trim()}` : null,
    source ? `\nSource: ${source}` : null,
  ].filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/** A plain, printable page for the recipe. */
export const printableRecipe = (recipe, { note = '' } = {}) => {
  const ingredients = (recipe.ingredients || [])
    .map((ing) => `<li><span class="qty">${esc(ing.qty || '')}</span> ${esc(ing.name)}</li>`).join('');
  const steps = (recipe.steps || []).map(stepText).filter(Boolean).map((text) => `<li>${esc(text)}</li>`).join('');
  const source = safeExternalUrl(recipe.source);
  const trimmed = String(note || '').trim();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(recipe.name)}</title>
<style>
  body { font: 14px/1.55 system-ui, sans-serif; color: #111; margin: 32px; max-width: 46rem; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; margin: 22px 0 6px; }
  p.meta { color: #555; margin: 0; }
  ul { padding-left: 1.1rem; } ol { padding-left: 1.3rem; }
  li { margin: 3px 0; } ol li { margin: 8px 0; }
  .qty { font-weight: 700; }
  .note { border-left: 3px solid #999; padding: 4px 10px; margin-top: 18px; white-space: pre-line; }
  .src { color: #555; margin-top: 18px; font-size: 0.8rem; word-break: break-all; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${esc(recipe.name)}</h1>
<p class="meta">${esc(facts(recipe).join(' · '))}</p>
${ingredients ? `<h2>Ingredients</h2><ul>${ingredients}</ul>` : ''}
${steps ? `<h2>Method</h2><ol>${steps}</ol>` : ''}
${trimmed ? `<p class="note"><strong>Your note:</strong> ${esc(trimmed)}</p>` : ''}
${source ? `<p class="src">Source: ${esc(source)}</p>` : ''}
</body></html>`;
};
