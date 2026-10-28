import { describe, expect, it } from 'vitest';
import { budgetGuard } from '../src/lib/budget-guard.js';
import { RECIPES } from '../src/data/recipes.js';

const dinners = RECIPES.filter((r) => !(r.tags || []).includes('breakfast') && r.costPerServing > 0);
const pricey = [...dinners].sort((a, b) => b.costPerServing - a.costPerServing)[0];
const dates = ['2026-10-26', '2026-10-27'];
const plan = { [dates[0]]: { dinner: pricey.id }, [dates[1]]: { dinner: pricey.id } };

describe('budgetGuard', () => {
  it('is inactive with no budget, no meals, or under budget', () => {
    expect(budgetGuard({ plan, dates, budget: 0, recipes: dinners }).active).toBe(false);
    expect(budgetGuard({ plan: {}, dates, budget: 10, recipes: dinners }).active).toBe(false);
    expect(budgetGuard({ plan, dates, budget: 1000, recipes: dinners }).active).toBe(false);
  });
  it('suggests cheaper same-slot swaps until the week fits', () => {
    const cost = pricey.costPerServing * 2 * 2;
    const g = budgetGuard({ plan, dates, people: 2, budget: cost - 0.5, recipes: dinners });
    expect(g.active).toBe(true);
    expect(g.over).toBeCloseTo(0.5, 2);
    expect(g.swaps.length).toBeGreaterThan(0);
    for (const s of g.swaps) {
      expect(s.to.costPerServing).toBeLessThan(s.from.costPerServing);
      expect(s.to.id).not.toBe(pricey.id);
      expect(s.slot).toBe('dinner');
    }
    expect(g.saving).toBe(Math.round(g.swaps.reduce((a, s) => a + s.saving, 0) * 100) / 100);
  });
  it('never offers a breakfast for a dinner, or a recipe already in the week', () => {
    const breakfast = { id: 'b', costPerServing: 0.1, protein: 99, tags: ['breakfast'] };
    const g = budgetGuard({ plan, dates, budget: 0.5, recipes: [breakfast, pricey] });
    expect(g.swaps).toEqual([]);
    expect(g.closes).toBe(false);
  });
  it('reports a gap that swaps cannot close', () => {
    const g = budgetGuard({ plan, dates, budget: 0.5, recipes: dinners });
    expect(g.closes).toBe(false);
    expect(g.swaps.length).toBeLessThanOrEqual(3);
  });
  it('skips swaps that drop protein below 80%', () => {
    const weak = { id: 'w', costPerServing: 0.3, protein: 0, tags: [] };
    const g = budgetGuard({ plan, dates, budget: 0.5, recipes: [weak] });
    expect(pricey.protein).toBeGreaterThan(0);
    expect(g.swaps).toEqual([]);
  });
});
