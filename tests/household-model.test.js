import { describe, expect, it } from 'vitest';
import {
  applyCalibration, buildHouseholdModel, calibratedConfidence, confidenceCalibration, confidenceForCount,
  confidenceForEvidence, decayEvidence, householdModelReady, householdModelSummary,
  makeFact,
} from '../src/lib/household-model.js';

const state = {
  day: '2026-09-01',
  household: 2,
  portionsOverride: 'auto',
  members: [{ id: 'm1', diets: ['vegetarian'], allergies: ['peanuts'] }],
  diets: [],
  allergies: [],
  intolerances: [],
  religious: [],
  tasteRatings: { r1: 'love', r2: 'nope' },
  favourites: ['r1'],
  cooked: [
    { recipeId: 'r1', date: '2026-08-28' },
    { recipeId: 'r1', date: '2026-08-29' },
    { recipeId: 'r3', date: '2026-08-30' },
  ],
  cookingTimeHistory: [{ recipeId: 'r1', estimatedMins: 30, actualMins: 35 }],
  preferenceEvents: [],
  waste: [
    { name: 'Milk', reason: 'expired', date: '2026-08-29' },
    { name: 'Milk', reason: 'expired', date: '2026-08-30' },
    { name: 'Bread', reason: 'cooked-too-much', date: '2026-08-30' },
  ],
  shops: [
    { date: '2026-08-20', items: [{ name: 'Milk', quantity: 2 }] },
    { date: '2026-08-27', items: [{ name: 'Milk', quantity: 2 }] },
    { date: '2026-09-01', items: [{ name: 'Milk', quantity: 2 }] },
  ],
  plan: { '2026-09-01': { dinner: 'r1' } },
  mealPlanEvents: [{ date: '2026-08-28', status: 'cooked' }],
  offers: [{ id: 'o1', used: true }],
  coupons: [],
  aliasMemory: { tomatos: 'tomatoes' },
  timeBudget: 'normal',
};

const recipes = [
  { id: 'r1', name: 'Veg curry', cuisine: 'indian', tags: ['vegan'], time: 30, ingredients: [{ name: 'Milk' }] },
  { id: 'r2', name: 'Chicken pie', cuisine: 'british', tags: ['meat'], time: 60, ingredients: [{ name: 'Chicken' }] },
  { id: 'r3', name: 'Pasta', cuisine: 'italian', tags: ['vegetarian'], time: 20, ingredients: [{ name: 'Pasta' }] },
];

describe('unified household model', () => {
  it('grades confidence by evidence count', () => {
    expect(confidenceForCount(0)).toBe('none');
    expect(confidenceForCount(1)).toBe('low');
    expect(confidenceForCount(4)).toBe('medium');
    expect(confidenceForCount(9)).toBe('high');
  });

  it('every fact carries confidence, evidence count, source and time', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    for (const [key, fact] of Object.entries(model)) {
      // calibration is the audit block (decay/conflict/prediction readings),
      // not a learned fact; version/updatedAt/evidenceScore are metadata.
      if (['version', 'updatedAt', 'evidenceScore', 'calibration'].includes(key)) continue;
      expect(fact, key).toHaveProperty('value');
      expect(fact, key).toHaveProperty('confidence');
      expect(['high', 'medium', 'low', 'none']).toContain(fact.confidence);
      expect(fact, key).toHaveProperty('evidenceCount');
      expect(fact, key).toHaveProperty('source');
      expect(fact, key).toHaveProperty('updatedAt');
    }
  });

  it('covers all required domains', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    for (const key of ['appetite', 'preferences', 'dislikes', 'dietaryConstraints', 'mealAcceptance',
      'portionAccuracy', 'effortTolerance', 'weekdayBehaviour', 'ingredientConsumption',
      'wasteProbability', 'shoppingCadence', 'priceSensitivity', 'substitutions']) {
      expect(model[key], key).toBeDefined();
    }
  });

  it('learns dislikes, constraints, waste risk and cadence from evidence', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    expect(model.dislikes.value.recipes).toContain('r2');
    expect(model.dietaryConstraints.value.diets).toContain('vegetarian');
    expect(model.dietaryConstraints.value.allergies).toContain('peanuts');
    expect(Object.keys(model.wasteProbability.value).length).toBeGreaterThan(0);
    expect(model.shoppingCadence.value.trips).toBe(3);
    expect(model.substitutions.value[0]).toMatchObject({ from: 'tomatos', to: 'tomatoes' });
  });

  it('is honest when empty', () => {
    const model = buildHouseholdModel({}, { recipes: [], today: '2026-09-01' });
    expect(model.preferences.confidence).toBe('none');
    expect(model.mealAcceptance.value).toBeNull();
    expect(householdModelSummary(model)).toMatch(/Not enough history|Every suggestion/i);
  });

  it('makeFact defaults confidence from evidence', () => {
    expect(makeFact('x', { evidenceCount: 0 }).confidence).toBe('none');
    expect(makeFact('x', { evidenceCount: 5 }).confidence).toBe('medium');
  });

  it('weighs stronger evidence more than weaker evidence', () => {
    expect(confidenceForEvidence(0, 'taste-ratings')).toBe('none');
    expect(confidenceForEvidence(1, 'taste-ratings')).toBe('low');
    expect(confidenceForEvidence(1, 'pantry')).toBe('low');
    expect(confidenceForEvidence(4, 'taste-ratings')).toBe('high');
    expect(confidenceForEvidence(4, 'pantry')).toBe('medium');
    expect(confidenceForEvidence(6, 'receipts')).toBe('high');
  });

  it('raises confidence once enough independent evidence exists', () => {
    const model = buildHouseholdModel({
      ...state,
      tasteRatings: { r1: 'love', r2: 'like', r3: 'like', r4: 'love' },
      favourites: ['r1', 'r3'],
      shops: [
        { date: '2026-08-20', items: [{ name: 'Milk' }] },
        { date: '2026-08-27', items: [{ name: 'Milk' }] },
        { date: '2026-09-01', items: [{ name: 'Milk' }] },
        { date: '2026-09-02', items: [{ name: 'Bread' }] },
      ],
    }, { recipes, today: '2026-09-01' });
    expect(model.preferences.confidence).toBe('high');
    expect(model.shoppingCadence.confidence).toBe('medium');
    expect(model.evidenceScore).toBeGreaterThan(0);
    expect(householdModelReady(model)).toBe(true);
  });

  it('does not let weak pantry evidence claim high confidence', () => {
    const model = buildHouseholdModel({
      ...state,
      pantry: [{ id: 'p1', name: 'Rice' }, { id: 'p2', name: 'Beans' }, { id: 'p3', name: 'Pasta' }, { id: 'p4', name: 'Bread' }],
      cooked: [],
      tasteRatings: {},
      favourites: [],
      shops: [],
    }, { recipes, today: '2026-09-01' });
    expect(model.preferences.confidence).toBe('none');
    expect(model.appetite.confidence).toBe('none');
  });
});

describe('confidence calibration', () => {
  it('decays old evidence with a 28-day half-life', () => {
    // Fresh: every observation from the last few days survives almost whole.
    expect(decayEvidence(4, ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-01'], '2026-09-01')).toBeCloseTo(4, 0);
    // A month old: about half the weight remains.
    expect(decayEvidence(2, ['2026-08-04', '2026-08-04'], '2026-09-01')).toBeCloseTo(1, 0);
    // Three months old: barely counts, but never zero.
    expect(decayEvidence(1, ['2026-06-01'], '2026-09-01')).toBeGreaterThan(0);
    expect(decayEvidence(1, ['2026-06-01'], '2026-09-01')).toBeLessThan(0.3);
    // Undated observations count as fresh, not discarded.
    expect(decayEvidence(5, ['2026-08-30'], '2026-09-01')).toBeCloseTo(5, 0);
    expect(decayEvidence(3, [], '2026-09-01')).toBeCloseTo(2.4, 0);
  });

  it('caps confidence when evidence conflicts with itself', () => {
    const agreeing = calibratedConfidence({ count: 10, source: 'taste-ratings', dates: [], conflicting: 0, today: '2026-09-01' });
    const split = calibratedConfidence({ count: 10, source: 'taste-ratings', dates: [], conflicting: 4, today: '2026-09-01' });
    expect(agreeing.level).toBe('high');
    expect(split.level).toBe('medium'); // a split household is "mixed signals", never "confident"
    expect(split.conflicting).toBe(true);
  });

  it('reports the decay it applied so callers can say so', () => {
    const stale = calibratedConfidence({ count: 4, source: 'cooked', dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04'], today: '2026-09-01' });
    expect(stale.decayed).toBe(true);
    expect(stale.effectiveCount).toBeLessThan(4);
  });

  it('calibrates stated confidence against what actually happened', () => {
    const snap = (confidence, probability, outcome, date = '2026-08-30') => ({
      type: 'prediction_snapshot', confidence, probability, outcome, date,
    });
    const calibration = confidenceCalibration([
      snap('high', 0.9, true), snap('high', 0.9, true), snap('high', 0.9, false), snap('high', 0.9, true),
      snap('low', 0.2, false), snap('low', 0.2, false), snap('low', 0.2, true), snap('low', 0.2, false),
    ], '2026-09-01');
    expect(calibration.ready).toBe(true);
    expect(calibration.byConfidence.high.actualRate).toBeCloseTo(0.75, 2);
    expect(calibration.byConfidence.high.gap).toBeCloseTo(-0.15, 2);
    expect(calibration.byConfidence.low.verdict).toBe('calibrated');
    // Nothing resolved yet: an honest "not ready", not zeroes.
    expect(confidenceCalibration([], '2026-09-01').ready).toBe(false);
  });

  it('the built model carries calibration readings for its main facts', () => {
    const model = buildHouseholdModel(state, { recipes, today: '2026-09-01' });
    expect(model.calibration.preferences).toHaveProperty('level');
    expect(model.calibration.acceptance).toHaveProperty('level');
    expect(model.calibration.waste).toHaveProperty('level');
    expect(model.calibration.cadence).toHaveProperty('level');
    expect(model.calibration.predictions).toHaveProperty('ready');
    // No resolved predictions in this fixture → nothing second-guessed.
    expect(model.calibration.adjustments).toEqual([]);
  });
});

describe('closing the calibration loop', () => {
  const snap = (confidence, probability, outcome) => ({
    type: 'prediction_snapshot', confidence, probability, outcome, date: '2026-08-30',
  });
  // 'high' predictions that mostly did NOT come true; 'low' ones that did.
  const overconfident = {
    ready: true,
    byConfidence: {
      high: { predicted: 10, cameTrue: 3, actualRate: 0.3, meanProbability: 0.9, gap: -0.6, verdict: 'overconfident' },
      low: { predicted: 8, cameTrue: 6, actualRate: 0.75, meanProbability: 0.25, gap: 0.5, verdict: 'underconfident' },
    },
  };

  it('past accuracy adjusts stated confidence — one bounded step', () => {
    expect(applyCalibration('high', overconfident)).toBe('medium');
    expect(applyCalibration('low', overconfident)).toBe('medium');
    // Never above high, never below low, never off the scale.
    expect(applyCalibration('medium', overconfident)).toBe('medium'); // no track record at medium
    expect(applyCalibration('high', { ready: false })).toBe('high');
  });

  it('a thin track record is not allowed to second-guess a level', () => {
    const thin = {
      ready: true,
      byConfidence: { high: { predicted: 2, cameTrue: 0, actualRate: 0, meanProbability: 0.9, gap: -0.9, verdict: 'overconfident' } },
    };
    expect(applyCalibration('high', thin)).toBe('high');
    expect(applyCalibration('high', thin, { minEvidence: 2 })).toBe('medium');
  });

  it('the model applies its prediction track record and names what moved', () => {
    const model = buildHouseholdModel({
      ...state,
      predictionSnapshots: [
        snap('high', 0.9, true), snap('high', 0.9, false), snap('high', 0.9, false),
        snap('high', 0.9, false), snap('high', 0.9, false), snap('high', 0.9, false),
        snap('low', 0.2, true), snap('low', 0.2, true), snap('low', 0.2, true),
        snap('low', 0.2, true), snap('low', 0.2, true), snap('low', 0.2, true),
      ],
    }, { recipes, today: '2026-09-01' });
    expect(model.calibration.predictions.ready).toBe(true);
    // Only levels with a real track record move, and the moves are named.
    for (const adjustment of model.calibration.adjustments) {
      expect(adjustment).toHaveProperty('fact');
      expect(adjustment).toHaveProperty('from');
      expect(adjustment).toHaveProperty('to');
      expect(adjustment.from).not.toBe(adjustment.to);
    }
  });
});
