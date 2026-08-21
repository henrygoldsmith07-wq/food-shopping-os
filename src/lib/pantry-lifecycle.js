/**
 * Pantry item lifecycle states for outcome tracking:
 * purchased → opened → consumed | partially consumed | used in recipe | leftover → expired → discarded
 *
 * Each transition records quantity/value where possible. The pantry row itself stores
 * the current state; history is kept in pantryEvents and waste arrays.
 */

export const LIFECYCLE_STATES = [
  { id: 'purchased', label: 'Purchased', terminal: false },
  { id: 'opened', label: 'Opened', terminal: false },
  { id: 'consumed', label: 'Consumed', terminal: true },
  { id: 'partially_consumed', label: 'Partially consumed', terminal: false },
  { id: 'used_in_recipe', label: 'Used in recipe', terminal: false },
  { id: 'leftover', label: 'Leftover', terminal: false },
  { id: 'expired', label: 'Expired', terminal: false },
  { id: 'discarded', label: 'Discarded', terminal: true },
];

const BY_ID = Object.fromEntries(LIFECYCLE_STATES.map((s) => [s.id, s]));

export const isValidState = (id) => Boolean(BY_ID[id]);

export const nextStatesFor = (current) => {
  switch (current) {
    case 'purchased': return ['opened', 'partially_consumed', 'consumed', 'used_in_recipe', 'expired', 'discarded'];
    case 'opened': return ['consumed', 'partially_consumed', 'used_in_recipe', 'leftover', 'expired', 'discarded'];
    case 'partially_consumed': return ['consumed', 'leftover', 'expired', 'discarded'];
    case 'used_in_recipe': return ['consumed', 'partially_consumed', 'leftover', 'expired', 'discarded'];
    case 'leftover': return ['consumed', 'partially_consumed', 'expired', 'discarded'];
    case 'expired': return ['discarded', 'consumed'];
    default: return [];
  }
};

export const recordLifecycleEvent = (pantryItem, toState, { qty, value, note, at } = {}) => {
  if (!isValidState(toState)) throw new Error(`Unknown lifecycle state: ${toState}`);
  const cost = Number(pantryItem?.cost) || 0;
  const estimatedValue = value != null ? Number(value) : cost;
  return {
    itemId: pantryItem?.id || null,
    name: pantryItem?.name || 'Unknown',
    from: pantryItem?.lifecycleState || 'purchased',
    to: toState,
    qty: qty || pantryItem?.qty || '',
    value: Number.isFinite(estimatedValue) ? Math.round(estimatedValue * 100) / 100 : 0,
    note: String(note || ''),
    at: at || new Date().toISOString(),
  };
};

/**
 * Aggregate waste stats:
 * - waste rate = discarded quantity / (consumed + discarded)
 * - estimated wasted value = sum of cost for discarded states
 * - avoided waste = leftovers consumed vs expired discarded
 * - frequently discarded categories
 */
export const wasteOutcome = (pantry = [], waste = [], events = []) => {
  const discarded = waste || [];
  const totalWasteValue = Math.round(discarded.reduce((s, w) => s + (Number(w.cost) || Number(w.value) || 0), 0) * 100) / 100;
  const byCategory = {};
  const byName = {};
  for (const w of discarded) {
    const cat = w.cat || w.category || 'Other';
    const name = (w.name || '').trim() || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const key = name.toLowerCase();
    byName[key] = { name, count: (byName[key]?.count || 0) + 1, cost: Math.round(((byName[key]?.cost || 0) + (Number(w.cost) || 0)) * 100) / 100 };
  }
  const frequentlyDiscarded = Object.values(byName)
    .sort((a, b) => b.count - a.count || b.cost - a.cost)
    .slice(0, 6);
  const byCategorySorted = Object.entries(byCategory)
    .map(([cat, count]) => ({ cat, count }))
    .sort((a, b) => b.count - a.count);

  // Consumed proxy: pantry items marked consumed + cooked events
  const consumedEvents = (events || []).filter((e) => ['consumed', 'used_in_recipe', 'partially_consumed'].includes(e.to));
  const consumedCount = consumedEvents.length;
  const discardedCount = discarded.length;
  const total = consumedCount + discardedCount;
  const wasteRate = total ? Math.round((discardedCount / total) * 1000) / 10 : null;

  const leftovers = pantry.filter((p) => p.cat === 'Leftovers');
  const leftoverConsumed = leftovers.length ? 0 : 0; // placeholder — real count comes from events
  const avoided = consumedEvents.filter((e) => e.from === 'leftover').length;

  return {
    wasteRate,
    estimatedWastedValue: totalWasteValue,
    totalWasteItems: discardedCount,
    totalConsumedEvents: consumedCount,
    avoidedWasteCount: avoided,
    frequentlyDiscarded,
    byCategory: byCategorySorted,
    assumption: wasteRate === null
      ? 'No consumption or waste events recorded — waste rate not calculable.'
      : `Waste rate = discarded (${discardedCount}) / (consumed ${consumedCount} + discarded ${discardedCount}) in recorded events.`,
  };
};

export const pantryLifecycleForItem = (item = {}) => ({
  state: item.lifecycleState || (item.cat === 'Leftovers' ? 'leftover' : 'purchased'),
  openedAt: item.openedDate || null,
  purchasedAt: item.purchaseDate || item.addedAt || null,
  consumedAt: item.consumedAt || null,
  discardedAt: item.discardedAt || null,
  qty: item.qty || '',
  value: Number(item.cost) || 0,
});
