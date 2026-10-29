import { describe, it, expect } from 'vitest';
import { wasteReport } from '../src/lib/waste-report.js';

const today = '2026-10-29';
describe('wasteReport', () => {
  it('returns null with nothing to say', () => {
    expect(wasteReport({ waste: [], today })).toBeNull();
    expect(wasteReport({ waste: [{ name: 'a', date: today }], today: 'bad' })).toBeNull();
  });
  it('counts the last 7 days against the 7 before', () => {
    const r = wasteReport({ today, waste: [
      { name: 'Milk', date: '2026-10-28', reason: 'expired' },
      { name: 'milk', date: '2026-10-25', reason: 'expired' },
      { name: 'Kale', date: '2026-10-24', reason: 'forgotten' },
      { name: 'Bread', date: '2026-10-20', reason: 'expired' },
      { name: 'Old', date: '2026-10-01', reason: 'expired' },
    ] });
    expect(r.binned).toBe(3);
    expect(r.lastWeek).toBe(1);
    expect(r.trend).toBe('up');
    expect(r.topReason).toEqual({ reason: 'expired', count: 2 });
    expect(r.repeat).toEqual({ name: 'milk', count: 2 });
    expect(r.tip).toMatch(/went off/);
    expect(r.cost).toBeNull();
  });
  it('sums cost only when every row has one', () => {
    const r = wasteReport({ today, waste: [{ name: 'a', date: today, cost: 1.5 }, { name: 'b', date: today, cost: 2 }] });
    expect(r.cost).toBe(3.5);
  });
  it('celebrates a clean week after a wasteful one', () => {
    const r = wasteReport({ today, waste: [{ name: 'a', date: '2026-10-20' }], cooked: [{ date: today }] });
    expect(r.binned).toBe(0);
    expect(r.trend).toBe('down');
  });
});
