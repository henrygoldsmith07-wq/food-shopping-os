/**
 * Planning strategies — the household steers the week in words, not knobs.
 *
 * "Lowest waste", "Lowest cost", "Pantry first", "Fastest week": each is one
 * intent over the same plan engine (see autopilot-week.js — each emphasis is
 * a knob set on the one generator, never a second planner). What makes a
 * strategy honest is its trade-off, so every strategy names what it gives up,
 * and `strategyComparison` measures the chosen week against the household's
 * usual one and explains the difference in sentences a person can act on:
 *
 *   "This week costs £6 less and uses 4 ingredients already in your pantry,
 *    but repeats 2 meals."
 *
 * Everything is measured from the proposals themselves (the same
 * derivations the shopping list is built from), so the comparison can never
 * disagree with the week it describes. Estimates stay estimates — the
 * receipts say what the shop really cost.
 */

import { autopilotWeekProposal } from './autopilot-week.js';
import { byId } from '../data/recipes.js';

/**
 * The strategies a household actually means. `emphasis` is the one knob set
 * on the shared generator; `null` is the usual week — the generator's own
 * inference from learned portions, taste, budget and what would spoil first.
 */
export const PLANNING_STRATEGIES = [
  {
    id: 'usual',
    label: 'My usual style',
    emphasis: null,
    tradeOff: 'Your normal mix — taste, budget, time and waste in their usual balance.',
  },
  {
    id: 'lowest-waste',
    label: 'Lowest waste',
    emphasis: 'less-waste',
    tradeOff: 'Buys the least and uses what would spoil first, but the week may repeat meals.',
  },
  {
    id: 'lowest-cost',
    label: 'Lowest cost',
    emphasis: 'spend-less',
    tradeOff: 'Cheapest basket, but cheaper dishes and more repetition than usual.',
  },
  {
    id: 'pantry-first',
    label: 'Pantry first',
    emphasis: 'use-what-i-have',
    tradeOff: 'Shops for the fewest new items, but meals follow the cupboard more than your favourites.',
  },
  {
    id: 'fastest-week',
    label: 'Fastest week',
    emphasis: 'quick-meals',
    tradeOff: 'Nothing takes long to cook, but with less variety and usually a slightly higher cost.',
  },
  {
    id: 'more-variety',
    label: 'More variety',
    emphasis: 'more-variety',
    tradeOff: 'The widest mix of cuisines, but a longer list and more to use up.',
  },
];

/** The strategy for an id, falling back to the usual week. */
export const strategyFor = (id) => PLANNING_STRATEGIES.find((strategy) => strategy.id === id) || PLANNING_STRATEGIES[0];

/** Dinners the same recipe covers more than once — "repeats chicken twice". */
const repeatedMeals = (proposal) => {
  const counts = new Map();
  for (const entry of proposal.entries || []) {
    if (!entry?.recipeId) continue;
    counts.set(entry.recipeId, (counts.get(entry.recipeId) || 0) + 1);
  }
  let meals = 0;
  const names = [];
  for (const [recipeId, count] of counts) {
    if (count < 2) continue;
    meals += count - 1;
    names.push(`${(byId(recipeId)?.name || 'the same meal').toLowerCase()} ${count}×`);
  }
  return { meals, names: names.slice(0, 2) };
};

const pound = (value) => `£${Math.abs(value).toFixed(0).replace(/^0$/, '0')}`;

/**
 * One strategy measured against the household's usual week, in sentences.
 *
 * @param {any} app the derived app view
 * @param {{ seed?: number, strategyId?: string }} [options]
 * @returns {{ strategy: object, proposal: object, lines: string[], metrics: object }}
 */
export function strategyComparison(app = {}, { seed = 1, strategyId = 'usual' } = {}) {
  const strategy = strategyFor(strategyId);
  const baseline = autopilotWeekProposal(app, { seed });

  // The usual week is the baseline — there is nothing to trade off against
  // itself, and the summary lines already say what it holds.
  if (strategy.emphasis === null) {
    return {
      strategy,
      proposal: baseline,
      lines: [],
      metrics: { costDelta: 0, pantryDelta: 0, itemDelta: 0, rescueDelta: 0, leftoverDelta: 0, repeats: 0, repeatNames: [] },
    };
  }

  const candidate = autopilotWeekProposal(app, { seed, emphasis: strategy.emphasis });
  const costDelta = Math.round(((candidate.plannedCost || 0) - (baseline.plannedCost || 0)) * 100) / 100;
  const pantryDelta = (candidate.coverage?.coveredByPantry || 0) - (baseline.coverage?.coveredByPantry || 0);
  const itemDelta = (candidate.itemCount || 0) - (baseline.itemCount || 0);
  const rescueDelta = (candidate.rescuedExpiring || 0) - (baseline.rescuedExpiring || 0);
  const leftoverDelta = (candidate.leftoverMeals || 0) - (baseline.leftoverMeals || 0);
  const { meals: repeats, names: repeatNames } = repeatedMeals(candidate);

  const gains = [];
  if (costDelta < -0.01) gains.push(`costs ${pound(costDelta)} less`);
  if (pantryDelta > 0) gains.push(`uses ${pantryDelta} more ingredient${pantryDelta === 1 ? '' : 's'} already in your pantry`);
  if (itemDelta < 0) gains.push(`buys ${-itemDelta} fewer item${itemDelta === -1 ? '' : 's'}`);
  if (rescueDelta > 0) gains.push(`rescues ${rescueDelta} ingredient${rescueDelta === 1 ? '' : 's'} before expiry`);
  if (leftoverDelta > 0) gains.push(`covers ${leftoverDelta} more meal${leftoverDelta === 1 ? '' : 's'} with leftovers`);

  const costs = [];
  if (costDelta > 0.01) costs.push(`costs ${pound(costDelta)} more`);
  if (repeats > 0) {
    costs.push(repeatNames.length === 1 && repeats === 1
      ? `repeats ${repeatNames[0]}`
      : `repeats ${repeats} meal${repeats === 1 ? '' : 's'}`);
  }
  if (itemDelta > 0) costs.push(`adds ${itemDelta} more item${itemDelta === 1 ? '' : 's'} to the list`);
  if (pantryDelta < 0) costs.push(`uses ${-pantryDelta} fewer pantry ingredient${pantryDelta === -1 ? '' : 's'}`);

  const lines = [];
  if (gains.length || costs.length) {
    const head = gains.length ? `This week ${gains.join(' and ')}` : 'This week does not improve on your usual week';
    lines.push(costs.length ? `${head}, but ${costs.join(' and ')}.` : `${head}.`);
  }
  return {
    strategy,
    proposal: candidate,
    lines,
    metrics: { costDelta, pantryDelta, itemDelta, rescueDelta, leftoverDelta, repeats, repeatNames },
  };
}
