import { describe, it, expect } from 'vitest';
import {
  simulatePlan, compareSimulations, robustScenario, sensitivityAnalysis, explainTradeoffs, DEFAULT_SIMULATION,
} from '../src/lib/plan-simulator.js';

const candidates = [
  [{ name: 'A', ingredients: [{ name: 'rice' }], timeMins: 20 }],
  [{ name: 'B', ingredients: [{ name: 'beans' }], timeMins: 90 }],
];

describe('plan-simulator', () => {
  it('handles no candidates without throwing', () => {
    const r = simulatePlan([], {});
    expect(r.best).toBeNull();
    expect(r.summary).toBe('No plan could be scored.');
    expect(r.tradeoffs).toEqual([]);
    expect(r.dimensions).toEqual([]);
    expect(robustScenario([], {}).best).toBeNull();
    expect(compareSimulations([], {}, {}).scoreDelta).toBe(0);
    expect(compareSimulations([], {}, {}).changedWinner).toBe(false);
  });
  it('merges context over defaults and summarises the best plan', () => {
    const r = simulatePlan(candidates, { today: '2026-10-21', weeklyBudget: 40 });
    expect(r.options.weeklyBudget).toBe(40);
    expect(r.options.strictEquipment).toBe(DEFAULT_SIMULATION.strictEquipment);
    expect(r.summary).toMatch(/^Plan score \d+\/100 across 1 meals\.$/);
    expect(r.dimensions.every((d) => d.value === null || (d.value >= 0 && d.value <= 100))).toBe(true);
  });
  it('explainTradeoffs flags low pantry cover, long times, missing equipment; dedupes and caps at 6', () => {
    expect(explainTradeoffs(null)).toEqual([]);
    const out = explainTradeoffs({
      reasons: ['x', 'x'],
      metrics: { pantryCoverage: 0.2, timeFit: 50, equipmentFit: 0.5 },
    });
    expect(out).toHaveLength(4);
    expect(out[0]).toBe('x');
    expect(explainTradeoffs({ metrics: { pantryCoverage: 0.9, timeFit: 100, equipmentFit: 1 } })).toEqual([]);
    expect(explainTradeoffs({ reasons: ['1', '2', '3', '4', '5', '6', '7'] })).toHaveLength(6);
  });
  it('compareSimulations reports metric changes with null deltas for missing values', () => {
    const c = compareSimulations(candidates, {}, { maxTimeMins: 30 });
    expect(c.metricChanges.length).toBeGreaterThan(0);
    const missing = c.metricChanges.find((m) => m.before === null || m.after === null);
    if (missing) expect(missing.delta).toBeNull();
  });
  it('robustScenario runs three scenarios and leaves unset limits null', () => {
    const r = robustScenario(candidates, { today: '2026-10-21', weeklyBudget: 100, maxTimeMins: 40 });
    expect(r.scenarios).toHaveLength(3);
    expect(r.scenarios[1].options.weeklyBudget).toBe(85);
    expect(r.scenarios[2].options.maxTimeMins).toBe(30);
    const unset = robustScenario(candidates, { today: '2026-10-21' });
    expect(unset.scenarios[1].options.weeklyBudget).toBeNull();
    expect(unset.scenarios[2].options.maxTimeMins).toBeNull();
  });
  it('sensitivityAnalysis flips equipment and nudges budget and time', () => {
    const s = sensitivityAnalysis(candidates, { weeklyBudget: 40, maxTimeMins: 40, strictEquipment: false });
    const by = Object.fromEntries(s.map((d) => [d.key, d.scenarios.map((x) => x.value)]));
    expect(by.weeklyBudget).toEqual([30, 50]);
    expect(by.maxTimeMins).toEqual([30, 50]);
    expect(by.strictEquipment).toEqual([true]);
  });
});
