import { describe, expect, it } from 'vitest';
import { applyWasteLearning, learnedWasteInsights, wasteLearningProfile, WASTE_REASONS } from '../src/lib/waste-learning.js';

describe('waste learning', () => {
  const purchases = Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, items: [{ name: 'Spinach', qty: '1 bag' }] }));
  const waste = [1, 2, 3, 4, 5].map((index) => ({ name: 'Spinach', date: `2026-08-${String(index + 2).padStart(2, '0')}`, reason: 'expired', quantity: 1 }));

  it('keeps the reason distribution and learns only from repeated evidence', () => {
    const profile = wasteLearningProfile({ purchases, waste, today: '2026-08-10' });
    expect(profile[0]).toMatchObject({ name: 'Spinach', purchases: 7, wasteEvents: 5, topReason: 'expired', learned: true });
    expect(WASTE_REASONS).toContain('bought-too-much');
  });

  it('reduces future discrete purchase suggestions without rewriting measured quantities', () => {
    const profile = wasteLearningProfile({ purchases, waste, today: '2026-08-10' });
    const result = applyWasteLearning([{ name: 'Spinach', qty: '2 bags' }, { name: 'Milk', qty: '2 litres' }], profile);
    expect(result[0].qty).toBe('2 bags'); // one bag is the minimum sensible discrete suggestion
    expect(result[0].wasteLearning.reduced).toBe(true);
    expect(result[1].qty).toBe('2 litres');
  });

  it('produces a human explanation for learned ingredients', () => {
    const profile = wasteLearningProfile({ purchases, waste, today: '2026-08-10' });
    expect(learnedWasteInsights(profile)[0].message).toMatch(/bought Spinach 7 times.*wasted some on 5 occasions/i);
  });
});
