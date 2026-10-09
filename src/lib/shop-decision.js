/**
 * Shop decision engine — "what is the best way to execute this shop?"
 * Wraps optimiseShopping with three honest strategies: best-simple (one
 * store) · cheapest (any stores) · lowest-waste. Recommends one from
 * preferences; never presents scraped prices as checkout prices; unknown
 * prices stay unknown.
 */
import { optimiseShopping } from './shopping-optimisation.js';
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
export const decideShop = (items = [], { shops = [], pantry = [], routes = {}, memory = {}, preferredStores = [], weeklyBudget = null, budgetSpent = 0 } = {}) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { options: [], recommendation: null, empty: true };
  let simple = null; let cheapest = null; let lowWaste = null;
  try {
    simple = optimiseShopping(list, { shops, pantry, mode: 'fewest_shops', routes, memory, weeklyBudget, budgetSpent });
  } catch { simple = null; }
  try {
    cheapest = optimiseShopping(list, { shops, pantry, mode: 'lowest_cost', routes, memory, weeklyBudget, budgetSpent });
  } catch { cheapest = null; }
  try {
    lowWaste = optimiseShopping(list, { shops, pantry, mode: 'lowest_waste', routes, memory, weeklyBudget, budgetSpent });
  } catch { lowWaste = null; }
  const options = [];
  if (simple) options.push({ id: 'simple', label: 'Best simple shop', ...pickStore(simple), explanation: simple.explanation, freshnessNote: simple.freshnessNote, budget: simple.budget });
  if (cheapest) options.push({ id: 'cheapest', label: 'Cheapest shop', ...pickStore(cheapest), explanation: cheapest.explanation, freshnessNote: cheapest.freshnessNote, budget: cheapest.budget });
  if (lowWaste) options.push({ id: 'low-waste', label: 'Lowest-waste shop', ...pickStore(lowWaste), explanation: lowWaste.explanation, freshnessNote: lowWaste.freshnessNote, budget: lowWaste.budget });
  const ranked = [...options].sort((a, b) => a.total - b.total);
  const cheapestTotal = ranked[0]?.total;
  for (const o of options) o.savingVsCheapest = cheapestTotal != null ? round2(o.total - cheapestTotal) : 0;
  let recommendation = options.find((o) => o.id === 'simple') || options[0] || null;
  if (preferredStores?.length && options.length) {
    const pref = options.find((o) => preferredStores.some((p) => o.store?.toLowerCase().includes(String(p).toLowerCase())));
    if (pref) recommendation = pref;
  }
  if (ranked[0] && recommendation && ranked[0].total < recommendation.total - 3 && ranked[0].stores <= 2) recommendation = ranked[0];
  // Pantry uncertainty that affects this shop: probable/unknown rows whose
  // names match list rows. Never silently treated as fact.
  const uncertain = [];
  try {
    const names = new Set(list.map((r) => String(r.name || '').toLowerCase()));
    for (const p of pantry || []) {
      const conf = String(p.confidence || 'definite').toLowerCase();
      if ((conf === 'probable' || conf === 'unknown') && names.has(String(p.name || '').toLowerCase())) {
        uncertain.push(p.name);
      }
    }
  } catch { /* uncertainty best-effort */ }
  return { options, recommendation, uncertain: uncertain.slice(0, 4), empty: false, provenance: 'Receipt-backed history only; confirm at the shelf.' };
};
const pickStore = (result) => {
  const counts = new Map();
  for (const row of result.assignment || []) {
    const s = row.store || 'Unassigned';
    if (!counts.has(s)) counts.set(s, { store: s, total: 0, items: 0 });
    const r = counts.get(s);
    r.total = round2(r.total + (Number(row.price) || 0)); r.items += 1;
  }
  const rows = [...counts.values()].sort((a, b) => b.items - a.items);
  const top = rows[0] || { store: 'Unassigned', total: result.total, items: 0 };
  return { store: top.store, total: result.total, stores: result.stores, itemCount: result.itemCount, assignment: result.assignment, substitutions: (result.assignment || []).filter((r) => r.reason?.toLowerCase().includes('substitut')) };
};
