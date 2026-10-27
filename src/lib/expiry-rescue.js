import { addDays } from './kitchen-dates.js';
import { getUseItUpMatches } from './use-it-up.js';

/**
 * Expiry rescue: turn "these items go off soon" into dinners you can plan in
 * one tap. Each suggestion is a recipe that uses expiring stock and the
 * earliest open dinner night that is still on or before the soonest expiry
 * (today counts, so a use-today item can only be rescued tonight). A night is
 * offered to one suggestion only, and recipes already on the plan are skipped.
 * Nothing is invented: a suggestion with no open night in time is dropped.
 */
export const rescueSuggestions = ({
  recipes = [], useSoonRows = [], pantry = [], plan = {}, day = '', max = 3,
} = {}) => {
  if (!day || !useSoonRows.length) return [];
  const planned = new Set();
  for (const slots of Object.values(plan || {})) for (const id of Object.values(slots || {})) if (id) planned.add(id);
  const matches = getUseItUpMatches(recipes.filter((r) => !planned.has(r.id)), { useSoonRows, pantry, max: 12 });
  const taken = new Set();
  const out = [];
  for (const m of matches) {
    const window = Number.isFinite(m.urgency) && m.urgency < 999 ? Math.max(0, Math.min(m.urgency, 6)) : 3;
    let date = null;
    for (let i = 0; i <= window; i += 1) {
      const d = addDays(day, i);
      if (!plan?.[d]?.dinner && !taken.has(d)) { date = d; break; }
    }
    if (!date) continue;
    taken.add(date);
    out.push({ recipe: m.recipe, used: m.used, date, daysLeft: m.urgency, tonight: date === day });
    if (out.length >= max) break;
  }
  return out;
};
