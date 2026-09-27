/**
 * Single shopping-list derivation plus household-learning recommendations.
 *
 * week-loop.js stays the ONE derivation: plan → portions → pantry/leftover
 * subtraction → waste learning → list. This module adds the transparent
 * recommendation layer on top (never a silent mutation): repeated behaviour
 * with enough samples produces a suggestion carrying its evidence, and the
 * household applies or dismisses it explicitly.
 *
 * Every recommendation carries: what would change, the evidence behind it,
 * a confidence, the samples behind the confidence, and an id the household
 * can dismiss. Deterministic: same state in, same suggestions out.
 */

// @ts-check
import { canonicalName } from './aliases.js';
import { parseQuantity } from './measure.js';

/** Minimum shops/observations before a pattern becomes a suggestion. */
export const LEARNING_MIN_SAMPLES = 3;

/**
 * @typedef {Object} BoughtAverage
 * @property {string} name
 * @property {number} samples
 * @property {number} mean
 * @property {string|null} lastAt
 */

/**
 * Mean bought quantity per ingredient from recorded shops.
 * @param {Array<any>} [shops]
 * @param {{ learnedAliases?: any }} [options]
 * @returns {Map<string, BoughtAverage>}
 */
export const averageBoughtByIngredient = (shops = [], { learnedAliases = {} } = {}) => {
  /** @type {Map<string, { name: string, total: number, samples: number, lastAt: string|null }>} */
  const groups = new Map();
  for (const shop of Array.isArray(shops) ? shops : []) {
    for (const item of shop?.items || []) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const parsed = parseQuantity(item.qty, { ingredient: name });
      const amount = Number(parsed?.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const key = canonicalName(name, learnedAliases) || name.toLowerCase();
      const row = groups.get(key) || { name, total: 0, samples: 0, lastAt: null };
      row.total += amount;
      row.samples += 1;
      const at = String(shop?.date || shop?.at || '').slice(0, 10) || null;
      if (at && (!row.lastAt || at > row.lastAt)) row.lastAt = at;
      groups.set(key, row);
    }
  }
  const out = new Map();
  for (const [key, row] of groups) {
    out.set(key, { name: row.name, samples: row.samples, mean: row.total / row.samples, lastAt: row.lastAt });
  }
  return out;
};

/**
 * Transparent quantity suggestions: "your last N shops averaged X, the plan
 * asks for Y". Only at/above minSamples and with a material gap (>= 15%).
 * Never applied silently — the caller decides.
 * @param {Array<any>} [currentList]
 * @param {Array<any>} [shops]
 * @param {{ learnedAliases?: any, minSamples?: number }} [options]
 */
export const quantitySuggestions = (currentList = [], shops = [], { learnedAliases = {}, minSamples = LEARNING_MIN_SAMPLES } = {}) => {
  const averages = averageBoughtByIngredient(shops, { learnedAliases });
  const suggestions = [];
  for (const row of Array.isArray(currentList) ? currentList : []) {
    const name = String(row?.name || '').trim();
    if (!name) continue;
    const key = canonicalName(name, learnedAliases) || name.toLowerCase();
    const avg = averages.get(key);
    if (!avg || avg.samples < minSamples) continue;
    const current = parseQuantity(row.qty, { ingredient: name });
    const currentAmount = Number(current?.amount);
    if (!Number.isFinite(currentAmount) || currentAmount <= 0) continue;
    const gap = Math.abs(avg.mean - currentAmount) / currentAmount;
    if (gap < 0.15) continue;
    suggestions.push({
      id: `qty-${key}`,
      kind: 'quantity',
      name,
      currentQty: row.qty,
      suggestedQty: Math.round(avg.mean * 10) / 10,
      direction: avg.mean < currentAmount ? 'less' : 'more',
      samples: avg.samples,
      confidence: avg.samples >= 5 ? 'high' : avg.samples >= 4 ? 'medium' : 'low',
      evidence: `Your previous ${avg.samples} shops averaged ${Math.round(avg.mean * 10) / 10} (plan asks for ${row.qty}).`,
      lastAt: avg.lastAt,
    });
  }
  return suggestions.sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

/**
 * Meals planned often but cooked rarely — "frequently skipping X".
 * @param {any} [plan]
 * @param {Array<any>} [cooked]
 * @param {{ minSamples?: number }} [options]
 */
export const skippedMealSuggestions = (plan = {}, cooked = [], { minSamples = LEARNING_MIN_SAMPLES } = {}) => {
  const planned = new Map();
  for (const day of Object.values(plan || {})) {
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      const recipeId = day?.[slot];
      if (recipeId) planned.set(recipeId, (planned.get(recipeId) || 0) + 1);
    }
  }
  const made = new Map();
  for (const event of Array.isArray(cooked) ? cooked : []) {
    const id = event?.recipeId || event?.recipe?.id;
    if (id) made.set(id, (made.get(id) || 0) + 1);
  }
  const out = [];
  for (const [recipeId, times] of planned) {
    if (times < minSamples) continue;
    const cookedTimes = made.get(recipeId) || 0;
    if (cookedTimes * 2 >= times) continue;
    out.push({
      id: `skip-${recipeId}`,
      kind: 'skipped-meal',
      recipeId,
      planned: times,
      cooked: cookedTimes,
      samples: times,
      confidence: times >= 5 ? 'high' : times >= 4 ? 'medium' : 'low',
      evidence: `Planned ${times} times, cooked ${cookedTimes} times.`,
    });
  }
  return out.sort((a, b) => b.planned - a.planned);
};

/**
 * Items deleted from the generated list again and again.
 * @param {Array<any>} [deletions]
 * @param {{ learnedAliases?: any, minSamples?: number }} [options]
 */
export const deletedItemSuggestions = (deletions = [], { learnedAliases = {}, minSamples = LEARNING_MIN_SAMPLES } = {}) => {
  /** @type {Map<string, { name: string, count: number }>} */
  const counts = new Map();
  for (const entry of Array.isArray(deletions) ? deletions : []) {
    const name = String(entry?.name || entry || '').trim();
    if (!name) continue;
    const key = canonicalName(name, learnedAliases) || name.toLowerCase();
    const row = counts.get(key) || { name, count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  return [...counts.entries()]
    .filter(([, row]) => row.count >= minSamples)
    .map(([key, row]) => ({
      id: `del-${key}`,
      kind: 'repeated-deletion',
      name: row.name,
      samples: row.count,
      confidence: row.count >= 5 ? 'high' : row.count >= 4 ? 'medium' : 'low',
      evidence: `Deleted from the generated list ${row.count} times.`,
    }))
    .sort((a, b) => b.samples - a.samples);
};