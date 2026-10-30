// "Needed by": for each list row, the first planned meal that uses it.
// Rows whose first meal is several days away can wait for a midweek top-up,
// which keeps fresh food fresher and the first trip lighter. Uses only the
// plan and the recipe names already stored on list rows; nothing is guessed.
import { planEntries } from './mealplan.js';

const DAY_MS = 86400000;
export const LATER_AFTER_DAYS = 3;
const SLOT_RANK = { breakfast: 0, lunch: 1, dinner: 2 };

const dayGap = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** First planned meal (date, slot, recipe name) for each list row that has sourceRecipes. */
export function neededBy(list, plan, dates, today) {
  const entries = planEntries(plan || {}, dates || [])
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (SLOT_RANK[a.slot] ?? 3) - (SLOT_RANK[b.slot] ?? 3)));
  const out = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const sources = Array.isArray(item?.sourceRecipes) ? item.sourceRecipes : [];
    if (!sources.length || item.checked) continue;
    const first = entries.find((e) => sources.includes(e.recipe.name));
    if (!first) continue;
    out.set(item.id, { date: first.date, slot: first.slot, recipe: first.recipe.name, inDays: dayGap(today, first.date) });
  }
  return out;
}

/** Rows not needed until at least LATER_AFTER_DAYS days away, soonest first. */
export function canWaitRows(list, plan, dates, today, { afterDays = LATER_AFTER_DAYS } = {}) {
  const needs = neededBy(list, plan, dates, today);
  return (Array.isArray(list) ? list : [])
    .filter((item) => needs.has(item.id) && needs.get(item.id).inDays >= afterDays)
    .map((item) => ({ item, ...needs.get(item.id) }))
    .sort((a, b) => a.inDays - b.inDays || String(a.item.name).localeCompare(String(b.item.name)));
}
