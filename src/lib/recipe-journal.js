/**
 * A recipe's own history in this kitchen: how often it has been cooked, when
 * last, and the notes the cook keeps on it ("less chilli", "kids loved it",
 * "double the sauce").
 *
 * Counts come only from `state.cooked`, which cook mode appends to when a
 * meal is actually made; nothing here is estimated from the plan.
 */

const DAY_MS = 86400000;
export const RECIPE_NOTE_MAX = 2000;

const dayNumber = (date) => {
  const stamp = Date.parse(`${String(date || '').slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(stamp) ? Math.round(stamp / DAY_MS) : null;
};

/**
 * Cook history for one recipe, or null when it has never been cooked.
 *
 * @param {Array<{ recipeId: string, date: string }>} cooked
 * @param {string} recipeId
 * @param {string} today YYYY-MM-DD
 * @returns {{ count: number, last: string, daysAgo: number } | null}
 */
export const cookHistory = (cooked, recipeId, today) => {
  if (!recipeId) return null;
  let count = 0;
  let last = '';
  for (const entry of Array.isArray(cooked) ? cooked : []) {
    if (entry?.recipeId !== recipeId || dayNumber(entry.date) === null) continue;
    count += 1;
    if (entry.date > last) last = entry.date;
  }
  if (!count) return null;
  const now = dayNumber(today);
  const daysAgo = now === null ? 0 : Math.max(0, now - dayNumber(last));
  return { count, last: last.slice(0, 10), daysAgo };
};

/** Cook history for every recipe at once, for lists of cards. */
export const cookHistoryById = (cooked, today) => {
  const ids = new Set((Array.isArray(cooked) ? cooked : []).map((entry) => entry?.recipeId).filter(Boolean));
  return new Map([...ids].map((id) => [id, cookHistory(cooked, id, today)]));
};

const ago = (days) => {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

/** "Cooked 4 times · last 12 days ago", or null for a recipe never cooked. */
export const cookedLabel = (history) => {
  if (!history) return null;
  const times = history.count === 1 ? 'once' : history.count === 2 ? 'twice' : `${history.count} times`;
  return `Cooked ${times} · last ${ago(history.daysAgo)}`;
};

/** "Made 12 days ago": the short form for a recipe card. */
export const lastMadeLabel = (history) => (history ? `Made ${ago(history.daysAgo)}` : null);

/** The notes map with one recipe's note set, or removed when blank. */
export const withRecipeNote = (notes, id, text) => {
  const current = notes && typeof notes === 'object' ? notes : {};
  if (!id) return current;
  const note = String(text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, RECIPE_NOTE_MAX);
  if (!note) {
    if (!(id in current)) return current;
    const { [id]: _removed, ...rest } = current;
    return rest;
  }
  return current[id] === note ? current : { ...current, [id]: note };
};
