import { describe, expect, it } from 'vitest';
import { householdWasteMetrics } from '../src/lib/waste-metrics.js';

describe('household waste metrics', () => {
  it('reports weekly cost, items, avoidable rate, and the main improvement', () => {
    const state = {
      day: '2026-08-15',
      waste: [
        { name: 'Spinach', cost: 2, quantity: 1, reason: 'expired', date: '2026-07-10' },
        { name: 'Carrots', cost: 1, quantity: 1, reason: 'expired', date: '2026-07-12' },
        { name: 'Spinach', cost: 1, quantity: 1, reason: 'expired', date: '2026-08-05' },
        { name: 'Poor fish', cost: 3, quantity: 1, reason: 'poor-quality', date: '2026-08-06' },
      ],
      shops: [],
    };
    const result = householdWasteMetrics(state);
    expect(result.previous.avoidableCost).toBe(3);
    expect(result.current.avoidableCost).toBe(1);
    expect(result.previous.weeklyCost).toBeCloseTo(0.68, 2);
    expect(result.current.weeklyCost).toBeCloseTo(0.47, 2);
    expect(result.current.avoidableRate).toBe(50);
    expect(result.mainImprovement).toBe('spinach');
  });

  it('does not call quality problems avoidable or invent prevention', () => {
    const result = householdWasteMetrics({ day: '2026-08-15', waste: [{ name: 'Fish', cost: 4, reason: 'poor-quality', date: '2026-08-10' }] });
    expect(result.current.avoidableCost).toBe(0);
    expect(result.estimatedWastePrevented).toBe(0);
    expect(result.comparison.confidence).toBe('early estimate');
  });
});
