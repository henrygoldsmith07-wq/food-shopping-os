/**
 * Asking a model what is in a kitchen, and reading its answer safely.
 *
 * The contract is deliberately small: lines of text in, lines of text out. The
 * model is not asked for JSON, categories, locations or confidence levels,
 * because the app already decides those from the words — and a model that
 * supplies them can quietly upgrade "some cheese" into "200 g cheddar,
 * confirmed". Keeping it to plain lines means the local parser stays the only
 * thing that decides how sure the pantry is.
 */

/** A photo of a shelf or a rambling sentence should not become 200 rows. */
export const MAX_LINES = 60;
export const MAX_LINE_LENGTH = 90;

export const INVENTORY_SYSTEM = `You list food items. Use UK English.

Return one item per line, plain text, nothing else. No JSON, no bullets, no
numbering, no headings, no commentary.

Rules you must follow:
- List only food and drink you can actually see or that the text actually
  names. Never add an item that is not there.
- Keep the amount the source gave, at the front of the line: "2 tins chopped
  tomatoes", "400 g chicken breast".
- If no amount is given, write the item with no amount. Never estimate one.
- If you cannot make out what something is, leave it out.
- If there is no food at all, return nothing.`;

export const inventoryPrompt = (text) =>
  `List the food and drink named in this. Keep the amounts it gives, and add none.\n\n${String(text || '').slice(0, 8000)}`;

const NOISE = /^(?:here(?:'s| is)|sure|of course|i can see|the (?:photo|image|list)|items?:|food:|note:|```)/i;

/**
 * A model response as a list of item lines.
 *
 * Fences, preambles, bullets and numbering are stripped; anything that reads
 * as commentary rather than an item is dropped. What survives is handed to the
 * ordinary local parser, which is where the actual judgement happens.
 */
export const parseInventoryList = (text) => String(text || '')
  .replace(/```[a-z]*/gi, '')
  .split('\n')
  .map((line) => line
    .replace(/^\s*(?:[-•*·–—]\s*|\d+[.)]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim())
  .filter((line) => line.length >= 2 && line.length <= MAX_LINE_LENGTH && !NOISE.test(line))
  .slice(0, MAX_LINES);
