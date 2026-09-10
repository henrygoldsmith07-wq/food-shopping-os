import { describe, expect, it } from 'vitest';
import {
  evaluateHousehold, evaluateHouseholdTrend, evaluateLearningStages,
  householdLearningStage, recommendationFunnel,
} from '../src/lib/eval-metrics.js';

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
    for (const key of ['predictionError', 'wasteReduction', 'unplannedShops', 'recommendationAcceptance', 'portionAccuracy', 'autopilotUndoRate', 'trend']) {
      expect(evalResult[key]).toHaveProperty('value');
      expect(evalResult[key]).toHaveProperty('confidence');
      expect(evalResult[key]).toHaveProperty('evidence');
      expect(evalResult[key]).toHaveProperty('assumption');
    }
    // The funnel and stage blocks carry the same honesty contract.
    expect(evalResult.recommendationFunnel).toHaveProperty('confidence');
    expect(evalResult.recommendationFunnel).toHaveProperty('assumption');
    expect(evalResult.learningStages).toHaveProperty('assumption');
  });

  it('compares the household’s first month with its latest month', () => {
    const state = {
      cooked: [
        { date: '2026-06-20' }, { date: '2026-06-21' }, { date: '2026-06-22' },
        { date: '2026-08-20' }, { date: '2026-08-21' }, { date: '2026-08-22' }, { date: '2026-08-23' },
      ],
      waste: [
        { date: '2026-06-21' }, { date: '2026-06-22' },
        { date: '2026-08-21' },
      ],
      shops: [
        { date: '2026-06-20' }, { date: '2026-06-25' },
        { date: '2026-08-20' },
      ],
      mealPlanEvents: [
        { date: '2026-06-22', status: 'skipped' },
        { date: '2026-08-22', status: 'cooked' },
      ],
    };
    const trend = evaluateHouseholdTrend(state, { today: '2026-09-01' });
    expect(trend.ready).toBe(true);
    expect(trend.windowDays).toBe(56);
    expect(trend.baseline.cooked).toBe(3);
    expect(trend.latest.cooked).toBe(4);
    expect(trend.changes.planCompletion).toBeGreaterThan(0);
    expect(trend.changes.wastePerCooked).toBeLessThan(0);
    expect(trend.conclusion).toMatch(/plan completion up/i);
  });

  it('does not invent a trend before there is a full window', () => {
    const trend = evaluateHouseholdTrend({
      cooked: [{ date: '2026-08-30' }],
      waste: [{ date: '2026-08-30' }],
      shops: [{ date: '2026-08-30' }],
    }, { today: '2026-09-01' });
    expect(trend.ready).toBe(false);
    expect(trend.conclusion).toMatch(/not enough history/i);
  });
});

describe('recommendation funnel', () => {
  const ev = (id, type, at, extra = {}) => ({ id, type, at, day: String(at).slice(0, 10), origin: 'user', ...extra });

  it('follows recommendation → action → outcome through the ledger', () => {
    const state = {
      householdLedger: [
        ev('a1', 'RecommendationAccepted', '2026-08-28T18:00:00.000Z', { recipeId: 'curry' }),
        ev('a2', 'RecommendationAccepted', '2026-08-29T18:00:00.000Z', { recipeId: 'roast' }),
        ev('a3', 'RecommendationAccepted', '2026-08-30T18:00:00.000Z', { recipeId: 'pasta' }),
        ev('r1', 'RecommendationRejected', '2026-08-31T18:00:00.000Z', { recipeId: 'noodles' }),
        // curry got cooked after acceptance; pasta got skipped instead.
        ev('c1', 'MealCooked', '2026-08-28T20:00:00.000Z', { recipeId: 'curry' }),
        ev('s1', 'MealSkipped', '2026-08-30T21:00:00.000Z', { date: '2026-08-30', slot: 'dinner' }),
      ],
    };
    const funnel = recommendationFunnel(state, { today: '2026-09-01' });
    expect(funnel.total).toBe(4);
    expect(funnel.acceptanceRate).toBeCloseTo(0.75, 2);
    // Only curry became a meal: 1 of 3 accepted.
    expect(funnel.followThrough).toBeCloseTo(0.33, 2);
    expect(funnel.actedOn).toBe(1);
    expect(funnel.open).toBe(1); // roast: accepted, neither cooked nor skipped
    expect(funnel.confidence).toBe('medium');
  });

  it('an empty ledger is an honest empty funnel', () => {
    const funnel = recommendationFunnel({}, { today: '2026-09-01' });
    expect(funnel.total).toBe(0);
    expect(funnel.acceptanceRate).toBeNull();
    expect(funnel.followThrough).toBeNull();
    expect(funnel.confidence).toBe('none');
  });
});

describe('learning stages', () => {
  it('grades the stage from the earliest dated observation', () => {
    expect(householdLearningStage({}, { today: '2026-09-01' })).toMatchObject({ stage: 'cold-start', daysOfHistory: 0 });
    expect(householdLearningStage({ cooked: [{ date: '2026-08-25' }] }, { today: '2026-09-01' }))
      .toMatchObject({ stage: 'cold-start' });
    expect(householdLearningStage({ cooked: [{ date: '2026-08-01' }] }, { today: '2026-09-01' }))
      .toMatchObject({ stage: 'early' });
    expect(householdLearningStage({ cooked: [{ date: '2026-05-01' }] }, { today: '2026-09-01' }))
      .toMatchObject({ stage: 'established' });
  });

  it('compares cold-start, early and established windows without inventing any', () => {
    const ev = (id, type, at, extra = {}) => ({ id, type, at, day: String(at).slice(0, 10), origin: 'user', ...extra });
    const state = {
      // 70 days of history: cold-start + early + established all active.
      cooked: [
        { recipeId: 'curry', date: '2026-07-01' }, { recipeId: 'roast', date: '2026-07-02' },
        { recipeId: 'curry', date: '2026-08-15' }, { recipeId: 'roast', date: '2026-08-16' },
        { recipeId: 'pasta', date: '2026-08-20' },
      ],
      waste: [{ date: '2026-07-02' }, { date: '2026-08-16' }],
      mealPlanEvents: [
        { date: '2026-07-01', status: 'cooked' },
        { date: '2026-07-03', status: 'skipped' },
        { date: '2026-08-20', status: 'cooked' },
      ],
      householdLedger: [
        ev('a1', 'RecommendationAccepted', '2026-07-01T10:00:00.000Z', { recipeId: 'curry' }),
        ev('a2', 'RecommendationAccepted', '2026-08-15T10:00:00.000Z', { recipeId: 'curry' }),
      ],
    };
    const stages = evaluateLearningStages(state, { today: '2026-09-01' });
    expect(stages.ready).toBe(true);
    expect(stages.stages['cold-start'].active).toBe(true);
    expect(stages.stages.early.active).toBe(true);
    // Established window is open (62 days of history) but empty so far —
    // its numbers read null, never zero.
    expect(stages.stages.established.active).toBe(true);
    expect(stages.stages.established.cooked).toBe(0);
    expect(stages.stages.established.followThrough).toBeNull();
    // Follow-through: day-1 acceptance → cooked; day-45 acceptance → cooked.
    expect(stages.stages['cold-start'].followThrough).toBe(1);
    expect(stages.stages.early.followThrough).toBe(1);
    // Waste per cook improved between windows.
    expect(stages.stages['cold-start'].wastePerCooked).toBeGreaterThan(stages.stages.early.wastePerCooked);
  });

  it('a fresh household has no stages to compare and says so', () => {
    const stages = evaluateLearningStages({}, { today: '2026-09-01' });
    expect(stages.ready).toBe(false);
    expect(stages.conclusion).toMatch(/cold-start numbers are the defaults/i);
  });
});
