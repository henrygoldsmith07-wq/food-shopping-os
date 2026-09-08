import { describe, expect, it } from 'vitest';
import { evaluateHousehold } from '../src/lib/eval-metrics.js';

describe('household evaluation', () => {
  it('is honest when empty', () => {
    const evalResult = evaluateHousehold({}, { today: '2026-09-01' });
    expect(evalResult.ready).toBe(false);
    expect(evalResult.predictionError.value).toBeNull();
    expect(evalResult.recommendationAcceptance.value).toBeNull();
    expect(evalResult.portionAccuracy.value).toBeNull();
    expect(evalResult.autopilotUndoRate.value).toBeNull();
  });

  it('measures acceptance, portions and undo rate from evidence', () => {
    const state = {
      cooked: [{ recipeId: 'r1', date: '2026-08-28' }, { recipeId: 'r2', date: '2026-08-29' }],
      waste: [{ name: 'Rice', reason: 'cooked-too-much', date: '2026-08-29' }],
      shops: [{ date: '2026-08-20' }, { date: '2026-08-27' }],
      plan: { '2026-08-28': { dinner: 'r1' } },
      householdLedger: [
        { type: 'RecommendationAccepted', recommendationId: 'a', day: '2026-08-28' },
        { type: 'RecommendationAccepted', recommendationId: 'b', day: '2026-08-28' },
        { type: 'RecommendationRejected', recommendationId: 'c', day: '2026-08-29' },
      ],
      autopilotOutcomes: [
        { actionId: 'use-expiring', completed: true },
        { actionId: 'restock-low', completed: true, undone: true },
      ],
      predictionCorrections: [],
    };
    const evalResult = evaluateHousehold(state, { today: '2026-09-01' });
    expect(evalResult.recommendationAcceptance.value).toBeCloseTo(0.67, 2);
    expect(evalResult.portionAccuracy.value).toBeLessThan(1);
    expect(evalResult.autopilotUndoRate.value).toBe(0.5);
    expect(evalResult.ready).toBe(true);
  });

  it('counts unplanned shops against plan coverage', () => {
    const planned = evaluateHousehold(
      { shops: [{ date: '2026-08-28' }], plan: { '2026-08-28': { dinner: 'r1' } } },
      { today: '2026-09-01' },
    );
    const unplanned = evaluateHousehold(
      { shops: [{ date: '2026-08-28' }], plan: {} },
      { today: '2026-09-01' },
    );
    expect(planned.unplannedShops.value).toBe(0);
    expect(unplanned.unplannedShops.value).toBe(1);
  });

  it('every metric carries confidence, evidence and an assumption', () => {
    const evalResult = evaluateHousehold({ shops: [{ date: '2026-08-28' }] }, { today: '2026-09-01' });
    for (const key of ['predictionError', 'wasteReduction', 'unplannedShops', 'recommendationAcceptance', 'portionAccuracy', 'autopilotUndoRate']) {
      expect(evalResult[key]).toHaveProperty('value');
      expect(evalResult[key]).toHaveProperty('confidence');
      expect(evalResult[key]).toHaveProperty('evidence');
      expect(evalResult[key]).toHaveProperty('assumption');
    }
  });
});
