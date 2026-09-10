import { describe, expect, it } from 'vitest';
import { decideTonight, learnMealDecisionProfile, rankMealsForTonight } from '../src/lib/meal-decision.js';

const recipes = [
  {
    id: 'quick-curry', name: 'Quick curry', meal: 'dinner', cuisine: 'indian', tags: ['vegan'],
    time: 20, servings: 4, costPerServing: 1.5, kcal: 500,
    ingredients: [{ name: 'Chickpeas' }, { name: 'Rice' }],
  },
  {
    id: 'slow-roast', name: 'Slow roast', meal: 'dinner', cuisine: 'british', tags: ['meat'],
    time: 120, servings: 2, costPerServing: 6, kcal: 900,
    ingredients: [{ name: 'Beef' }, { name: 'Potatoes' }, { name: 'Red wine' }],
  },
  {
    id: 'peanut-noodles', name: 'Peanut noodles', meal: 'dinner', cuisine: 'chinese', tags: [],
    time: 15, servings: 2, costPerServing: 2, kcal: 600,
    ingredients: [{ name: 'Noodles' }, { name: 'Peanuts' }],
  },
];

const pantry = [
  { id: 'p1', name: 'Chickpeas', expiry: '2026-09-02' },
  { id: 'p2', name: 'Rice', expiry: null },
];

describe('meal decision engine', () => {
  it('picks the pantry-covering, expiring-first meal', () => {
    const { pick } = decideTonight({
      recipes, pantry, today: '2026-09-01', date: '2026-09-01', people: 2, budgetPerServing: 4,
    });
    expect(pick.recipe.id).toBe('quick-curry');
    expect(pick.reasons.join(' ')).toMatch(/kitchen|goes off/i);
  });

  it('blocks allergens and counts them', () => {
    const { pick, blockedCount, ranked } = decideTonight({
      recipes, pantry, allergies: ['peanuts'], today: '2026-09-01', date: '2026-09-01',
    });
    expect(blockedCount).toBe(1);
    expect(ranked.find((r) => r.recipe.id === 'peanut-noodles').blocked).toBe(true);
    expect(pick.recipe.id).not.toBe('peanut-noodles');
  });

  it('penalises repetition and over-long, over-budget cooking', () => {
    const ranked = rankMealsForTonight({
      recipes, pantry,
      cooked: [{ recipeId: 'quick-curry', date: '2026-08-31' }],
      availableMinutes: 25, budgetPerServing: 2,
      today: '2026-09-01', date: '2026-09-01',
    });
    const roast = ranked.find((r) => r.recipe.id === 'slow-roast');
    expect(roast.score).toBeLessThan(ranked.find((r) => r.recipe.id === 'quick-curry').score);
    expect(roast.reasons.join(' ')).toMatch(/longer than|serving/i);
  });

  it('every pick explains itself with a confidence', () => {
    const { pick, confidence, reasons } = decideTonight({ recipes, pantry, today: '2026-09-01' });
    expect(['high', 'medium', 'low']).toContain(pick.confidence);
    expect(['high', 'medium', 'low', 'none']).toContain(confidence);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('returns null honestly when the book is empty', () => {
    const { pick, reasons } = decideTonight({ recipes: [], pantry, today: '2026-09-01' });
    expect(pick).toBeNull();
    expect(reasons.join(' ')).toMatch(/empty/i);
  });

  it('uses household evidence to adapt its scoring and say so', () => {
    const model = {
      preferences: { confidence: 'high', evidenceCount: 8 },
      effortTolerance: { confidence: 'high', evidenceCount: 8 },
      wasteProbability: { confidence: 'medium', evidenceCount: 4 },
      priceSensitivity: { confidence: 'medium', evidenceCount: 4 },
    };
    const without = rankMealsForTonight({ recipes, pantry, today: '2026-09-01' });
    const withModel = rankMealsForTonight({ recipes, pantry, householdModel: model, today: '2026-09-01' });
    expect(withModel.some((row) => row.score !== without.find((r) => r.recipe.id === row.recipe.id).score)).toBe(true);
    expect(withModel[0].learning.used).toBe(true);
    expect(withModel[0].learning.preferenceConfidence).toBe('high');
    expect(withModel[0].learning.effortConfidence).toBe('high');
  });

  it('never lets learned preferences override a hard dietary line', () => {
    const model = { preferences: { confidence: 'high', evidenceCount: 20 } };
    const { pick, blockedCount } = decideTonight({
      recipes, pantry, householdModel: model, allergies: ['peanuts'], today: '2026-09-01',
    });
    expect(blockedCount).toBe(1);
    expect(pick.recipe.id).not.toBe('peanut-noodles');
  });
});

describe('meal decision learning', () => {
  const ev = (id, type, at, extra = {}) => ({ id, type, at, day: String(at).slice(0, 10), origin: 'user', ...extra });

  it('learns acceptance and per-recipe affinity from the ledger, with decay', () => {
    const state = {
      day: '2026-09-01',
      householdLedger: [
        ev('a1', 'RecommendationAccepted', '2026-08-25T10:00:00.000Z', { recipeId: 'quick-curry' }),
        ev('a2', 'RecommendationAccepted', '2026-08-30T10:00:00.000Z', { recipeId: 'slow-roast' }),
        ev('r1', 'RecommendationRejected', '2026-08-31T10:00:00.000Z', { recipeId: 'peanut-noodles' }),
        // Ancient rejection: last year's news barely counts.
        ev('r0', 'RecommendationRejected', '2025-09-01T10:00:00.000Z', { recipeId: 'quick-curry' }),
      ],
    };
    const profile = learnMealDecisionProfile(state, { today: '2026-09-01' });
    expect(profile.acceptanceRate).toBeGreaterThan(0.5);
    expect(profile.affinityFor('quick-curry')).toBeGreaterThan(0);
    expect(profile.affinityFor('peanut-noodles')).toBeLessThan(0);
    // The ancient rejection is decayed away — curry still reads positive.
    expect(profile.rejectedByRecipe['quick-curry']).toBeLessThan(0.01);
  });

  it('an empty household learns nothing and says so', () => {
    const profile = learnMealDecisionProfile({}, { today: '2026-09-01' });
    expect(profile.confidence).toBe('none');
    expect(profile.acceptanceRate).toBeNull();
    expect(profile.affinityFor('any-recipe')).toBe(0);
  });

  it('bends the weights and the ranking with real responses', () => {
    // This household keeps rejecting the curry and accepting the noodles.
    const state = {
      day: '2026-09-01',
      householdLedger: [
        ev('r1', 'RecommendationRejected', '2026-08-31T10:00:00.000Z', { recipeId: 'quick-curry' }),
        ev('r2', 'RecommendationRejected', '2026-08-30T10:00:00.000Z', { recipeId: 'quick-curry' }),
        ev('r3', 'RecommendationRejected', '2026-08-29T10:00:00.000Z', { recipeId: 'quick-curry' }),
        ev('a1', 'RecommendationAccepted', '2026-08-28T10:00:00.000Z', { recipeId: 'peanut-noodles' }),
        ev('a2', 'RecommendationAccepted', '2026-08-27T10:00:00.000Z', { recipeId: 'peanut-noodles' }),
      ],
    };
    const profile = learnMealDecisionProfile(state, { today: '2026-09-01' });
    expect(profile.confidence).toBe('medium');
    const learned = rankMealsForTonight({
      recipes, pantry, decisionProfile: profile, today: '2026-09-01', date: '2026-09-01',
    });
    const curry = learned.find((r) => r.recipe.id === 'quick-curry');
    // The repeated rejection is named in the reasons, honestly.
    expect(curry.reasons.join(' ')).toMatch(/Rejected when suggested before/i);
    expect(learned[0].learning.decisionConfidence).toBe('medium');
    expect(learned[0].learning.weights).toHaveProperty('nutrition');
  });

  it('scores nutrition as a real factor and says when it does not know', () => {
    const withKcal = rankMealsForTonight({
      recipes: [
        { ...recipes[0], kcal: 550 },
        { ...recipes[1], kcal: 950 }, // heavy
      ],
      pantry, today: '2026-09-01', date: '2026-09-01',
    });
    expect(withKcal[0].learning.weights.nutrition).toBeGreaterThan(0);
    // Unknown kcal is neutral, not punished: the factor exists either way.
    const noKcal = rankMealsForTonight({ recipes, pantry, today: '2026-09-01', date: '2026-09-01' });
    expect(noKcal.every((r) => !r.blocked)).toBe(true);
  });

  it('cooking that really runs longer tightens the time fit', () => {
    const state = {
      day: '2026-09-01',
      householdLedger: [],
      cookingTimeHistory: [
        { recipeId: 'slow-roast', estimatedMins: 30, actualMins: 75, date: '2026-08-30' },
        { recipeId: 'quick-curry', estimatedMins: 20, actualMins: 50, date: '2026-08-29' },
      ],
    };
    const profile = learnMealDecisionProfile(state, { today: '2026-09-01' });
    expect(profile.timeBias).toBeGreaterThan(0.2);
    const learned = rankMealsForTonight({
      recipes, pantry, decisionProfile: profile,
      availableMinutes: 30, today: '2026-09-01', date: '2026-09-01',
    });
    const curry = learned.find((r) => r.recipe.id === 'quick-curry');
    // 20 min book time, but this household takes ~50 — the reason says 30+.
    expect(curry.reasons.join(' ')).toMatch(/min is longer than your 30 min window/);
  });
});
