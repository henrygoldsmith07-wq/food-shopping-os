import { describe, expect, it } from 'vitest';
import { bestSubstitution, rankSubstitutions } from '../src/lib/intelligent-substitutions.js';

describe('intelligent substitutions', () => {
  const recipe = { name: 'Chicken traybake', ingredients: [{ name: 'Chicken breast', price: 6.0, per100: { kcal: 165, protein: 31, fat: 3.6 } }] };
  it('prefers a cheaper compatible option and explains the evidence', () => {
    const result = bestSubstitution(recipe, 'Chicken breast', [
      { name: 'Chicken thighs', price: 3.9, per100: { kcal: 180, protein: 18, fat: 10 } },
      { name: 'Tofu', price: 4.8, per100: { kcal: 90, protein: 10, fat: 5 }, incompatibleWith: ['chicken'] },
    ], { allergies: [], diets: [] });
    expect(result.best.name).toBe('Chicken thighs');
    expect(result.best.saving).toBeGreaterThan(0);
    expect(result.best.evidence.recipeCompatible).toBe(true);
    expect(result.recommendation).toMatch(/saves approximately/);
  });
  it('never recommends a dietary blocker', () => {
    const rows = rankSubstitutions(recipe, 'Chicken breast', [{ name: 'Peanut pieces', price: 1 }], { allergies: ['peanuts'] });
    expect(rows).toEqual([]);
  });
});
