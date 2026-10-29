import { addDays } from './kitchen-dates.js';
import { normalize } from './recommend.js';

/**
 * Thaw ahead: frozen food a planned meal (today to `within` days out) needs
 * is something you have to move to the fridge the night before. Only frozen
 * rows that match a planned recipe's ingredient by whole word are offered,
 * and the first meal that needs the row decides the date.
 */
export const THAWED_DAYS = { Meat: 2, Fish: 1, Fresh: 3, Bread: 2, Leftovers: 2, 'Dairy & eggs': 3 };
const stem = (w) => w.replace(/ies$/, 'y').replace(/(ch|sh|x|o)es$/, '$1').replace(/s$/, '');

const sameFood = (ingredient, stocked) => {
  const a = normalize(ingredient).split(' ').filter(Boolean);
  const b = normalize(stocked).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.join('').length < 4) return false;
  return short.every((w) => long.some((l) => stem(l) === stem(w)));
};

export const thawCandidates = ({ plan = {}, recipes = [], pantry = [], day = '', within = 2 } = {}) => {
  if (!day) return [];
  const byId = new Map((recipes || []).map((r) => [r?.id, r]));
  const frozen = (Array.isArray(pantry) ? pantry : []).filter((p) => p?.location === 'Freezer' && p.name);
  if (!frozen.length) return [];
  const out = new Map();
  for (let i = 0; i <= within; i += 1) {
    const date = addDays(day, i);
    for (const [slot, id] of Object.entries(plan?.[date] || {})) {
      const recipe = id && byId.get(id);
      if (!recipe) continue;
      for (const ing of recipe.ingredients || []) {
        const row = frozen.find((p) => !out.has(p.id) && sameFood(ing?.name, p.name));
        if (row) out.set(row.id, { item: row, recipe, date, slot, daysAway: i, thawBy: addDays(date, -1) < day ? day : addDays(date, -1) });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.daysAway - b.daysAway || String(a.item.name).localeCompare(String(b.item.name)));
};

/** The row after thawing: fridge shelf, a short fridge clock from today, freezer date cleared. */
export const thawPatch = (item, day) => {
  const days = THAWED_DAYS[item?.cat] ?? 3;
  return { location: 'Fridge', thawedAt: day, frozenAt: null, expiry: addDays(day, days) };
};
