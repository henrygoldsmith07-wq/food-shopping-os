import { describe, expect, it } from 'vitest';
import { compareBaskets } from '../src/lib/basket-optimizer.js';

describe('practical basket optimization', () => {
  it('does not choose a deceptively cheap store with missing items', () => {
    const result = compareBaskets(
      [{ name: 'Chicken' }, { name: 'Tomatoes' }, { name: 'Rice' }, { name: 'Milk' }],
      {
        Tesco: { chicken: { price: 10 }, tomatoes: { price: 5 }, rice: { price: 8 }, milk: { price: 25 } },
        Aldi: { chicken: { price: 8 }, tomatoes: { price: 4 }, rice: { price: 7 } },
      },
      { unmatchedPenalty: 30 },
    );
    expect(result.rows.find((row) => row.store === 'Aldi')).toMatchObject({ total: 19, unavailable: 1, availability: 75 });
    expect(result.best.store).toBe('Tesco');
  });

  it('includes delivery, travel, and substitutions in the practical comparison', () => {
    const result = compareBaskets(
      [{ name: 'Milk' }, { name: 'Bread' }],
      { Tesco: { milk: { price: 2 }, bread: { price: 2, substitution: 'Wholemeal bread' } } },
      { delivery: { Tesco: 3 }, travel: { Tesco: 1.5 } },
    );
    expect(result.best).toMatchObject({ total: 8.5, productTotal: 4, delivery: 3, travel: 1.5, substitutions: 1 });
    expect(result.best.explanation).toMatch(/Tesco.*£8\.50/);
  });
});
