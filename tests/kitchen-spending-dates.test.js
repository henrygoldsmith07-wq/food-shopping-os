import { describe, expect, it } from 'vitest';
import { spendByMonth, spentInMonth, spentInWeek } from '../src/lib/kitchen-spending.js';

describe('spending windows tolerate shops with no date', () => {
  const shops = [
    { date: '2026-10-05', total: 12.5 },
    { total: 9 },
    { date: '2026-09-20', total: '7.25' },
  ];
  it('spendByMonth does not throw and ignores undated shops', () => {
    const out = spendByMonth(shops, 2, '2026-10-19');
    expect(out.map((m) => m.spend)).toEqual([7.25, 12.5]);
  });
  it('spentInMonth and spentInWeek ignore undated shops', () => {
    expect(spentInMonth(shops, '2026-10-19')).toBe(12.5);
    expect(spentInWeek(shops, '2026-10-05')).toBe(12.5);
  });
});
