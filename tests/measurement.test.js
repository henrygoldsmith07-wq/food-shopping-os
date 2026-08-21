import { describe, expect, it } from 'vitest';
import { measurementAnalytics } from '../src/lib/analytics.js';

const TODAY = '2026-07-28';

const shops = [
  { date: '2026-06-01', items: [{ name: 'Milk' }] },
  { date: '2026-06-08', items: [{ name: 'Milk' }, { name: 'Bread' }, { name: 'Rice' }] },
  { date: '2026-07-10', items: [{ name: 'Eggs' }, { name: 'Bread' }, { name: 'Rice' }] },
  { date: '2026-07-20', items: [{ name: 'Oats' }, { name: 'Bread' }, { name: 'Rice' }] },
];

describe('household outcome measurements', () => {
  it('compares shop outcomes and reports the transparent time-saving proxy', () => {
    const report = measurementAnalytics({
      day: TODAY,
      shops,
      shoppingList: [{
        name: 'Milk',
        forRecipes: ['Porridge', 'Curry'],
        alsoKnownAs: ['Semi-skimmed milk'],
        purchaseWarning: { date: '2026-07-27' },
      }],
      waste: [
        { name: 'Spinach', cost: 4, date: '2026-06-12' },
        { name: 'Herbs', cost: 1, date: '2026-07-22' },
      ],
    }, TODAY);

    expect(report.householdTimeSaved).toMatchObject({
      estimatedMinutes: 5,
      consolidatedLines: 2,
      purchaseWarnings: 1,
      confidence: 'proxy',
    });
    expect(report.emergencyShopReduction.trend).toMatchObject({
      baseline: 50,
      recent: 0,
      reductionPct: 100,
    });
    expect(report.duplicatePurchaseReduction).toMatchObject({
      itemLines: 10,
      duplicateLines: 1,
      recentPurchaseWarnings: 1,
    });
    expect(report.duplicatePurchaseReduction.trend).toMatchObject({
      baseline: 25,
      recent: 0,
      reductionPct: 100,
    });
    expect(report.foodWasteReduction.trend).toMatchObject({
      baselineCost: 4,
      recentCost: 1,
      reductionPct: 75,
    });
  });

  it('matches cooked recipes to planned slots and counts pantry confirmations', () => {
    const report = measurementAnalytics({
      day: TODAY,
      plan: {
        '2026-07-20': { dinner: 'r1', lunch: 'r2' },
        '2026-07-21': { dinner: 'r3' },
      },
      cooked: [
        { recipeId: 'r1', date: '2026-07-20' },
        { recipeId: 'r3', date: '2026-07-21' },
      ],
      pantryEvents: [
        { type: 'recipe_consumption', date: '2026-07-20', confirmationNeeded: [{ itemId: 'p1' }] },
        { type: 'recipe_consumption', date: '2026-07-21', confirmationNeeded: [] },
        { type: 'recipe_consumption', date: '2026-07-22', confirmationNeeded: 2 },
      ],
      pantryConflicts: [{ status: 'open' }, { status: 'resolved' }],
    }, TODAY);

    expect(report.plannedMealCompletion).toMatchObject({
      planned: 3,
      completed: 2,
      incomplete: 1,
      completionPct: 66.7,
    });
    expect(report.pantryConfirmationBurden).toMatchObject({
      consumptionEvents: 3,
      eventsNeedingConfirmation: 2,
      confirmationRequests: 3,
      burdenPct: 66.7,
      openConflicts: 1,
    });
  });

  it('does not invent reductions or completion rates without observations', () => {
    const report = measurementAnalytics({ day: TODAY }, TODAY);
    expect(report.householdTimeSaved.estimatedMinutes).toBeNull();
    expect(report.emergencyShopReduction.trend).toBeNull();
    expect(report.duplicatePurchaseReduction.trend).toBeNull();
    expect(report.foodWasteReduction.trend).toBeNull();
    expect(report.plannedMealCompletion.completionPct).toBeNull();
    expect(report.pantryConfirmationBurden.burdenPct).toBeNull();
  });
});
