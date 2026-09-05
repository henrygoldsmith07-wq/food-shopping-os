import { describe, expect, it } from 'vitest';
import { predictUnusedIngredients, predictWaste } from '../src/lib/waste-prediction.js';

const meal = (id, ingredients, extra = {}) => ({
  id,
  name: id,
  meal: 'dinner',
  servings: 1,
  ingredients,
  ...extra,
});

const TODAY = '2026-08-20';

describe('ingredient waste prediction', () => {
  it('returns an honest empty result without inventing risk', () => {
    const result = predictUnusedIngredients({ today: TODAY });

    expect(result).toMatchObject({
      items: [],
      predictions: [],
      count: 0,
      highRisk: 0,
      hasPredictions: false,
      planMeals: 0,
      score: null,
    });
    expect(result.summary).toMatch(/No ingredient is currently predicted/);
  });

  it('predicts dated pantry stock at the seven-day boundary, but not beyond it', () => {
    const result = predictUnusedIngredients({
      today: TODAY,
      expiryHorizon: 7,
      pantry: [
        { name: 'Spinach', qty: '200 g', cat: 'Fresh', expiry: '2026-08-27' },
        { name: 'Milk', qty: '1 l', cat: 'Dairy & eggs', expiry: '2026-08-28' },
      ],
    });

    expect(result.items.map((item) => item.name)).toEqual(['Spinach']);
    expect(result.items[0]).toMatchObject({
      daysLeft: 7,
      likelihood: 'watch',
      confidence: 'observed',
      date: '2026-08-27',
    });
    expect(result.items[0].action).toMatch(/before 2026-08-27/);
    expect(result.evidence.expiryRisks).toBe(1);
  });

  it('predicts a known pack remainder from the actual planned quantity', () => {
    const result = predictUnusedIngredients({
      today: TODAY,
      meals: [meal('small chicken meal', [{ name: 'Chicken breast', qty: '180 g' }])],
      dates: ['2026-08-21'],
      packageSizes: { 'chicken breast': '600 g' },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: 'Chicken breast',
      amount: 420,
      qty: '420 g',
      likelihood: 'watch',
      confidence: 'estimated',
    });
    expect(result.items[0].signals).toContain('known pack or whole-item size');
    expect(result.items[0].action).toMatch(/use Chicken breast again|smaller pack/i);
    expect(result.evidence.knownPackRemainders).toBe(1);
  });

  it('raises repeated household waste to high risk and explains the evidence', () => {
    const result = predictWaste({
      today: TODAY,
      meals: [meal('spinach meal', [{ name: 'Spinach', qty: '50 g' }])],
      dates: ['2026-08-21'],
      packageSizes: { spinach: '260 g' },
      wasteHistory: [
        { name: 'Spinach', date: '2026-08-01' },
        { name: 'spinach', date: '2026-08-08' },
      ],
    });

    expect(result.items[0]).toMatchObject({
      name: 'Spinach',
      amount: 210,
      likelihood: 'high',
      learned: true,
      confidence: 'learned',
    });
    expect(result.items[0].reasons.join(' ')).toMatch(/unused|pack/i);
    expect(result.items[0].action).toMatch(/another meal|smaller pack/i);
    expect(result.evidence.learnedRisks).toBe(1);
  });

  it('resolves a stored plan and leaves undated cupboard stock out of spoilage predictions', () => {
    const result = predictUnusedIngredients({
      today: TODAY,
      plan: {
        '2026-08-21': { dinner: 'planned-meal' },
      },
      dates: ['2026-08-21'],
      recipes: [meal('planned-meal', [{ name: 'Rice', qty: '200 g' }])],
      pantry: [
        { name: 'Rice', qty: '1 kg', cat: 'Baking & dry' },
        { name: 'Olive oil', qty: '1 bottle', cat: 'Sauces & oils' },
      ],
    });

    expect(result.planMeals).toBe(1);
    expect(result.items).toEqual([]);
  });
});
