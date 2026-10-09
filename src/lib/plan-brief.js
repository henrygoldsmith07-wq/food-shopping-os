/**
 * Reading a plan out of a sentence.
 *
 * "Plan 5 dinners for 4 people, under £60, 30 minutes max, use chicken twice"
 * is how somebody would actually ask for a week. This module turns that into
 * the controls the generator already understands — and is candid about the
 * rest: whatever cannot be read comes back in `rest` and the UI shows it
 * rather than pretending the whole sentence was understood.
 *
 * Parsing is deterministic regex over the words; no model, no guessing. The
 * budget is converted to the per-serving figure the generator's slider uses
 * (total ÷ dinners ÷ people), with a note when the arithmetic lands outside
 * the slider's range — the note tells the truth instead of silently clamping
 * the household's numbers.
 */

import { pantryHits } from './planner.js';
import { scoreRecipeForWeek } from './week-optimizer.js';


const SPACES = /\s+/g;

/** Strip the parts of `text` that matched, leaving what we could not read. */
const stripMatches = (text, spans) => spans
  .reduce((rest, [start, end]) => rest.slice(0, start) + ' ' + rest.slice(end), text)
  .replace(/[,\s]+/g, ' ')
  .trim();

/**
 * Parse a free-text plan brief. Fields nobody mentioned stay null so the
 * caller keeps whatever its controls already held.
 */
export const parsePlanBrief = (text = '') => {
  const raw = String(text || '');
  const brief = {
    dinners: null,
    people: null,
    budgetTotal: null,
    maxMinutes: null,
    uses: [],
    understood: [],
    rest: '',
    raw,
  };
  if (!raw.trim()) return brief;
  const spans = [];
  const take = (match, label) => {
    if (match) spans.push([match.index, match.index + match[0].length]);
    if (label) brief.understood.push(label);
  };

  const dinners = raw.match(/(\d+)\s*(?:dinners?|meals?|nights?)/i);
  if (dinners) {
    brief.dinners = Math.max(1, Number(dinners[1]));
    take(dinners, `${brief.dinners} dinner${brief.dinners === 1 ? '' : 's'}`);
  }

  const people = raw.match(/(?:for|of|with|serves?)\s+(\d+)\s*(?:people|adults|of us|persons?)?/i)
    || raw.match(/(\d+)\s*(?:people|adults|of us)/i);
  if (people) {
    brief.people = Math.max(1, Number(people[1]));
    take(people, `for ${brief.people}`);
  }

  // "under £60" / "within a £60 budget" before the bare "£60" fallback.
  const budget = raw.match(/(?:under|below|within|no more than|budget(?:\s+(?:of|is|at))?)\s*£?\s*(\d+(?:\.\d+)?)/i)
    || raw.match(/£\s*(\d+(?:\.\d+)?)/);
  if (budget) {
    brief.budgetTotal = Number(budget[1]);
    take(budget, `under £${brief.budgetTotal}`);
  }

  // Specific forms first: "30 minutes max" and "under 30 minutes" must not be
  // swallowed by the bare fallback before they get their chance.
  const minutes = raw.match(/(\d+)\s*(?:minutes?|mins?)\s*(?:max|or less|or under|maximum)/i)
    || raw.match(/(?:under|within|max(?:imum)?|less than|no more than)\s+(\d+)\s*(?:minutes?|mins?)/i)
    || raw.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (minutes) {
    brief.maxMinutes = Math.max(1, Number(minutes[1]));
    take(minutes, `${brief.maxMinutes} min max`);
  }

  // "use chicken twice" / "chicken 3 times".
  const counted = [...raw.matchAll(/\b(?:use\s+)?([a-z][a-z\s-]{1,28}?)\s+(twice|\d+\s*times?)\b/gi)];
  for (const match of counted) {
    const name = match[1].replace(SPACES, ' ').trim();
    if (!name) continue;
    const count = /twice/i.test(match[2]) ? 2 : Number.parseInt(match[2], 10);
    if (!Number.isFinite(count) || count < 1) continue;
    brief.uses.push({ name, count });
    take(match, `${name} ×${count}`);
  }

  brief.rest = stripMatches(raw, spans);
  return brief;
};

/**
 * Map a parsed brief onto the generator's controls. Fields the brief did not
 * mention stay null so the caller keeps whatever the slider already held.
 */
export const briefToControls = (brief = {}) => {
  const notes = [];
  const dinners = brief.dinners != null ? Math.max(1, Math.round(brief.dinners)) : null;
  const people = brief.people != null ? Math.max(1, Math.round(brief.people)) : null;

  let budget = null;
  if (brief.budgetTotal != null && dinners && people) {
    const perServing = brief.budgetTotal / (dinners * people);
    budget = Math.min(4, Math.max(1, Math.round(perServing * 100) / 100));
    if (perServing < 1) {
      notes.push(`£${brief.budgetTotal} across ${dinners} dinners for ${people} works out under £1 a serving — the slider shows its £1 minimum.`);
    } else if (perServing > 4) {
      notes.push(`£${brief.budgetTotal} across ${dinners} dinners for ${people} is £${perServing.toFixed(2)} a serving — the slider caps at £4.00.`);
    }
  } else if (brief.budgetTotal != null) {
    notes.push('Budget read, but I need both a dinner count and people to turn it into a per-serving figure — not applied.');
  }

  const timeAvailable = brief.maxMinutes != null ? Math.max(5, Math.round(brief.maxMinutes)) : null;

  return {
    scope: dinners == null ? null : dinners <= 1 ? '1 meal' : 'A week',
    days: dinners == null || dinners <= 1 ? null : dinners,
    people,
    budget,
    timeAvailable,
    quick: timeAvailable != null && timeAvailable <= 30,
    counts: (brief.uses || []).map((use) => ({ name: use.name, count: use.count })),
    notes,
  };
};


/**
 * Adjust a generated plan so each requested ingredient lands in the right
 * number of meals. Later slots are swapped first (the front of the week was
 * chosen most deliberately), a pool dish must not already be planned, and a
 * swap may not push another requested count below its own target.
 *
 * Anything unreachable comes back in `unmet` — the UI reports the shortfall
 * rather than quietly claiming the brief was honoured.
 */
const matchesCount = (recipe, name) => pantryHits(recipe, [name]) >= 1;

export const enforceIngredientCounts = (meals, counts, pool = [], context = {}) => {
  const result = [...(meals || [])];
  const wanted = (Array.isArray(counts) ? counts : []).filter(
    (count) => count?.name && Number(count.count) >= 1,
  );
  if (!result.length || !wanted.length) {
    return { meals: result, changes: [], unmet: [] };
  }

  const haveOf = (name, rows) => rows.filter((row) => matchesCount(row, name)).length;
  const changes = [];

  for (const { name, count } of wanted) {
    const want = Math.round(count);
    const meets = (rows) => haveOf(name, rows) >= want;

    // Would dropping `index` leave another requested count short?
    const breaksOther = (index, exceptName) => wanted.some(({ name: other, count: otherCount }) => {
      if (other === exceptName) return false;
      return haveOf(other, result.filter((_, i) => i !== index)) < Math.round(otherCount);
    });

    let guard = result.length + pool.length + 1;
    while (!meets(result) && guard > 0) {
      guard -= 1;
      const target = result
        .map((row, index) => ({ row, index }))
        .filter(({ row, index }) => !matchesCount(row, name) && !breaksOther(index, name))
        .at(-1)?.index;
      if (target === undefined) break;

      const planned = new Set(result.map((row) => row.id));
      const candidates = pool
        .filter((row) => row && matchesCount(row, name) && !planned.has(row.id))
        .sort((a, b) => scoreRecipeForWeek(b, context).score - scoreRecipeForWeek(a, context).score);
      if (!candidates.length) break;

      changes.push({ ingredient: name, from: result[target].name, to: candidates[0].name });
      result[target] = candidates[0];
    }
  }

  const unmet = wanted
    .map(({ name, count }) => ({ name, want: Math.round(count), have: haveOf(name, result) }))
    .filter((row) => row.have < row.want);

  return { meals: result, changes, unmet };
};
