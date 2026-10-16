import { describe, it, expect } from 'vitest';
import { PLANNING_STRATEGIES, strategyFor, strategyComparison } from '../src/lib/planning-strategies.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

/**
 * Planning strategies — the household steers the week in words.
 *
 * The contract here: every strategy names its trade-off up front, the
 * comparison is measured from the same proposals the list is built from,
 * and the sentences it produces are about things a person can act on
 * (cost, pantry, repetition) — never a raw optimisation score.
 */
const day = '2026-07-28';

const app = (extra = {}) => {
  const state = {
    ...EMPTY_STATE,
    day,
    onboarded: true,
    portions: 2,
    ...extra,
  };
  return { ...state, ...deriveApp(state) };
};

describe('planning strategies', () => {
  it('names every strategy and its trade-off, and falls back to the usual week', () => {
    for (const strategy of PLANNING_STRATEGIES) {
      expect(strategy.label).toBeTruthy();
      // A strategy that asks the engine to lean somewhere names what it gives
      // up. The usual week is the baseline the others trade against — it
      // leans nowhere, so there is nothing for it to give up.
      if (strategy.emphasis === null) {
        expect(strategy.id).toBe('usual');
        expect(strategy.tradeOff).toBeTruthy();
      } else {
        expect(strategy.tradeOff).toContain('but');
      }
    }
    expect(PLANNING_STRATEGIES[0].id).toBe('usual');
    expect(strategyFor('nonsense').id).toBe('usual');
  });

  it('the usual week is its own baseline — nothing to trade off', () => {
    const result = strategyComparison(app(), { seed: 2, strategyId: 'usual' });
    expect(result.lines).toEqual([]);
    expect(result.proposal.stats.meals).toBeGreaterThan(0);
  });

  it('compares a strategy week in sentences, not scores', () => {
    const result = strategyComparison(app(), { seed: 2, strategyId: 'lowest-cost' });
    expect(result.strategy.id).toBe('lowest-cost');
    expect(result.proposal.stats.meals).toBeGreaterThan(0);
    expect(Array.isArray(result.lines)).toBe(true);
    // Whatever the catalogue says this week, the sentence only ever names
    // concrete, checkable quantities — never a meaningless score.
    const prose = result.lines.join(' ');
    if (result.metrics.costDelta < -0.01) expect(prose).toMatch(/less/);
    if (result.metrics.repeats > 0) expect(prose).toMatch(/repeats/);
  });

  it('measures the trade-off from the proposal the list would be built from', () => {
    const result = strategyComparison(app(), { seed: 4, strategyId: 'pantry-first' });
    // The metric and the sentence must agree — one need source.
    expect(result.metrics.pantryDelta).toBe(
      (result.proposal.coverage?.coveredByPantry || 0) - (strategyComparison(app(), { seed: 4, strategyId: 'usual' }).proposal.coverage?.coveredByPantry || 0),
    );
  });
});
