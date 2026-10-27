/**
 * A method step, split into what cook mode can make tappable (the Crouton
 * pattern): durations become timers you can start where you read them, and
 * ingredients show their amount where they are used, so nobody scrolls back
 * to the list with flour on their hands.
 *
 * Pure and deterministic. A step with nothing recognisable comes back as one
 * plain text segment, exactly as written.
 */

const UNIT_SECONDS = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600, hr: 3600 };
// "10 minutes", "1.5 hrs", "10-12 mins", "10 to 12 minutes". A range starts
// its timer at the upper bound; the text still shows the range as written.
const DURATION = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;
// Leading words that describe an ingredient rather than name it; never matched alone.
const DESCRIPTORS = new Set([
  'new', 'red', 'green', 'yellow', 'white', 'black', 'brown', 'fresh', 'dried', 'frozen', 'chopped', 'tinned',
  'smoked', 'large', 'small', 'baby', 'sweet', 'spring', 'plain', 'self-raising', 'whole', 'light', 'dark',
]);

function unitSeconds(unit) {
  const key = unit.toLowerCase().replace(/s$/, '');
  return UNIT_SECONDS[key] ?? null;
}

function singular(word) {
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The words a step might use for an ingredient, longest first. */
export function ingredientTerms(name = '') {
  const base = String(name).toLowerCase().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!base) return [];
  const words = base.split(' ');
  const terms = new Set([base]);
  const last = words.at(-1);
  if (last && last.length > 2) {
    terms.add(last);
    terms.add(singular(last));
  }
  if (words.length > 1 && !DESCRIPTORS.has(words[0]) && words[0].length > 2) terms.add(words[0]);
  return [...terms].filter((term) => term.length > 2).sort((a, b) => b.length - a.length);
}

/**
 * @param {string} text
 * @param {{ name: string, qty?: string }[]} ingredients
 * @returns {Array<{ type: 'text', text: string } | { type: 'time', text: string, seconds: number }
 *   | { type: 'ingredient', text: string, qty: string | null, name: string }>}
 */
export function stepSegments(text = '', ingredients = []) {
  const marks = [];
  for (const match of String(text).matchAll(DURATION)) {
    const per = unitSeconds(match[3]);
    if (!per) continue;
    const amount = Number(match[2] || match[1]);
    if (!(amount > 0)) continue;
    marks.push({ start: match.index, end: match.index + match[0].length, type: 'time', seconds: Math.round(amount * per) });
  }
  for (const ingredient of ingredients) {
    const name = typeof ingredient === 'string' ? ingredient : ingredient?.name;
    if (!name) continue;
    for (const term of ingredientTerms(name)) {
      const found = new RegExp(`\\b${escape(term)}(?:es|s)?\\b`, 'i').exec(text);
      if (!found) continue;
      const start = found.index;
      const end = start + found[0].length;
      if (marks.some((mark) => start < mark.end && end > mark.start)) continue;
      marks.push({ start, end, type: 'ingredient', name, qty: typeof ingredient === 'string' ? null : ingredient.qty || null });
      break; // highlight each ingredient once per step
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) segments.push({ type: 'text', text: text.slice(cursor, mark.start) });
    const piece = text.slice(mark.start, mark.end);
    segments.push(mark.type === 'time'
      ? { type: 'time', text: piece, seconds: mark.seconds }
      : { type: 'ingredient', text: piece, qty: mark.qty, name: mark.name });
    cursor = mark.end;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments.length ? segments : [{ type: 'text', text }];
}
