import { describe, it, expect } from 'vitest';
import { scaleQuantity } from '../src/lib/measure.js';

/**
 * Recipe scaling properties: however a dish is scaled, the food maths must
 * stay self-consistent — proportions frozen, dimensions intact.
 */
const baseIngredients = [
  { name: 'Flour', qty: '500 g' },
  { name: 'Milk', qty: '300 ml' },
  { name: 'Eggs', qty: '3' },
];

const scaleRecipe = (ingredients, factor) =>
  ingredients.map((ing) => ({ ...ing, parsed: scaleQuantity(parseOf(ing), factor) }));

import { parseQuantity } from '../src/lib/measure.js';
const parseOf = (ing) => parseQuantity(ing.qty);

describe('recipe scaling properties', () => {
  it('proportions are frozen under any factor', () => {
    for (const factor of [0.5, 1.5, 2, 4]) {
      const scaled = scaleRecipe(baseIngredients, factor);
      const flour = scaled[0].parsed.amount;
      const milk = scaled[1].parsed.amount;
      const eggs = scaled[2].parsed.amount;
      expect(round(milk / flour)).toBe(round(300 / 500));
      expect(round(eggs / flour)).toBeCloseTo(3 / 500, 4);
    }
  });

  it('scaling is multiplicative: f(g(x)) === fg(x)', () => {
    const p = parseOf(baseIngredients[0]);
    const direct = scaleQuantity(scaleQuantity(p, 0.7), 2.5).amount;
    const once = scaleQuantity(p, 1.75).amount;
    expect(round(direct)).toBe(round(once));
  });

  it('dimensions survive scaling — mass stays mass, count stays count', () => {
    for (const ing of baseIngredients) {
      const out = scaleQuantity(parseOf(ing), 2);
      expect(out.dim).toBe(parseOf(ing).dim);
    }
  });

  it('a factor of one is the identity', () => {
    for (const ing of baseIngredients) {
      expect(scaleQuantity(parseOf(ing), 1).amount).toBe(parseOf(ing).amount);
    }
  });
});

const round = (n) => Math.round(n * 10000) / 10000;
