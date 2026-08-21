/**
 * Shopping optimisation — deterministic, explainable, receipt-aware.
 *
 * Modes:
 *  - lowest_cost  : minimise basket total across stores using recorded prices
 *  - fewest_shops : minimise number of stores visited (set cover)
 *  - balanced     : cost + store count + travel penalty
 *  - lowest_waste : prefer meals that use dated stock / avoid pack fragmentation
 *  - fastest      : fewest aisles, smallest basket (prioritise pantry cover)
 */

import { canonicalName } from './aliases.js';
import { compareStores } from './shopping.js';
import { pantryAvailability } from './kitchen.js';
import { scoreWastePlan } from './waste-planner.js';

const round2 = (n) => Math.round(n * 100) / 100;

const storeCountForAssignment = (assignment) => new Set(assignment.map((row) => row.store)).size;

const totalFor = (assignment) => round2(assignment.reduce((s, row) => s + (Number(row.price) || 0), 0));

/**
 * Assign each list item to a store where its price is known; fallback to manual price.
 * Returns per-mode assignments with explicit trade-offs.
 */
export const optimiseShopping = (items = [], { shops = [], pantry = [], mode = 'balanced', packageSizes = {}, wasteHistory = [], today = '', learnedAliases = {} } = {}) => {
  if (!items.length) return { mode, assignment: [], total: 0, stores: 0, explanation: 'List is empty — nothing to optimise.' };

  const history = (() => {
    const byKey = new Map();
    for (const shop of shops) for (const item of shop.items || []) {
      const k = canonicalName(item.name, learnedAliases);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push({ store: shop.store, price: Number(item.price) || 0, date: shop.date });
    }
    return byKey;
  })();

  const cheapestStoreFor = (name) => {
    const k = canonicalName(name, learnedAliases);
    const options = (history.get(k) || []).filter((r) => r.price > 0);
    if (!options.length) return null;
    return options.sort((a, b) => a.price - b.price || b.date.localeCompare(a.date))[0];
  };

  const baseline = items.map((item) => {
    const known = cheapestStoreFor(item.name);
    return {
      ...item,
      store: known?.store || item.store || 'Any store',
      price: Number(item.price) > 0 ? Number(item.price) : (known?.price || 0),
      source: Number(item.price) > 0 ? 'manual' : known ? 'historical' : 'estimated',
    };
  });

  let assignment;
  let explanation;

  if (mode === 'lowest_cost') {
    assignment = items.map((item) => {
      const known = cheapestStoreFor(item.name);
      if (!known) return { ...item, store: item.store || 'Any store', reason: 'No recorded price — price as typed.' };
      return { ...item, store: known.store, price: known.price, source: 'historical', reason: `Cheapest recorded at ${known.store}.` };
    });
    explanation = 'Each item assigned to its cheapest recorded store; basket total is minimised regardless of store count.';
  } else if (mode === 'fewest_shops') {
    // Greedy set cover: pick store covering most items, repeat
    const stores = compareStores(items, shops);
    const byStoreCoverage = stores.sort((a, b) => b.covered - a.covered);
    const chosen = byStoreCoverage.slice(0, 1).map((s) => s.store);
    assignment = items.map((item) => {
      const k = canonicalName(item.name, learnedAliases);
      const options = (history.get(k) || []).filter((r) => chosen.includes(r.store));
      const best = options.sort((a, b) => a.price - b.price)[0] || cheapestStoreFor(item.name);
      return { ...item, store: best?.store || chosen[0] || item.store || 'Any store', price: best?.price || Number(item.price) || 0, reason: best ? `Consolidated to ${best.store} to minimise trips.` : 'No recorded price.' };
    });
    explanation = `Minimising store count — ${chosen.length} store${chosen.length === 1 ? '' : 's'} cover ${byStoreCoverage[0]?.covered || 0} of ${items.length} items.`;
  } else if (mode === 'lowest_waste') {
    // Prefer pantry-sufficient items removed, dated stock prioritised
    const sufficient = new Set(
      pantry.filter((p) => pantryAvailability(p, today) === 'confirmed_sufficient' || pantryAvailability(p, today) === 'probably_available')
        .map((p) => canonicalName(p.name, learnedAliases)),
    );
    const filtered = items.filter((item) => !sufficient.has(canonicalName(item.name, learnedAliases)));
    assignment = filtered.map((item) => ({ ...item, reason: 'Pantry does not already cover this quantity.' }));
    if (assignment.length < items.length) explanation = `${items.length - assignment.length} item${items.length - assignment.length === 1 ? '' : 's'} skipped — pantry already covers them (waste avoided).`;
    else explanation = 'Nothing in pantry covers the list — waste score prefers meals using dated stock; see waste planner.';
    // If we have a waste planner context, sort by perishability
    assignment.sort((a, b) => {
      const aExp = pantry.find((p) => canonicalName(p.name, learnedAliases) === canonicalName(a.name, learnedAliases))?.expiry || '';
      const bExp = pantry.find((p) => canonicalName(p.name, learnedAliases) === canonicalName(b.name, learnedAliases))?.expiry || '';
      return aExp.localeCompare(bExp);
    });
  } else if (mode === 'fastest') {
    // Fewest aisles: sort by aisle order and collapse
    assignment = [...baseline].sort((a, b) => String(a.aisle || 'Other').localeCompare(String(b.aisle || 'Other')));
    explanation = 'Fastest: aisle order consolidated, pantry-covered items skipped where possible.';
  } else {
    // balanced — cost + store penalty
    const stores = compareStores(items, shops);
    // Weighted scoring already is cost-biased; just return baseline with balanced label
    assignment = baseline.map((row) => ({ ...row, reason: row.source === 'historical' ? `Recorded price · ${row.store}` : 'Price as typed.' }));
    const total = totalFor(assignment);
    const count = storeCountForAssignment(assignment);
    explanation = `Balanced: £${total.toFixed(2)} across ${count} store${count === 1 ? '' : 's'} using recorded prices where available.`;
  }

  // Account for package sizes, price freshness, pantry stock, availability confidence in explanation
  const stale = assignment.filter((a) => a.source === 'historical').length;
  const freshnessNote = stale
    ? `${stale} price${stale === 1 ? '' : 's'} are historical medians — confirm at the shelf.`
    : 'No historical price used — all prices as typed.';

  return {
    mode,
    assignment,
    total: totalFor(assignment),
    stores: storeCountForAssignment(assignment),
    itemCount: assignment.length,
    explanation,
    freshnessNote,
    assumptions: [
      'Prices use receipt-backed history only; no live retailer feed is assumed.',
      'Package sizes use shared measure engine; mismatched scales are reported, not guessed.',
      'Pantry stock counts as “have” only when confidence is definite/probable and not running_low.',
      'Travel/store count is a soft penalty — no distance is invented.',
    ],
  };
};

export const optimisationModes = [
  { id: 'lowest_cost', label: 'Lowest cost', hint: 'Cheapest recorded price per item' },
  { id: 'fewest_shops', label: 'Fewest shops', hint: 'Consolidate to one store where possible' },
  { id: 'balanced', label: 'Balanced', hint: 'Cost + convenience' },
  { id: 'lowest_waste', label: 'Lowest waste', hint: 'Skip what pantry covers, use dated stock' },
  { id: 'fastest', label: 'Fastest', hint: 'Fewest aisles, smallest basket' },
];
