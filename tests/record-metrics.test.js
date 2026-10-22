import { describe, expect, it } from 'vitest';
import {
  basketReconciliation, countReasons, snapshotCosts, spendAccuracy, RECENT_SHOP_WINDOW_DAYS,
} from '../src/lib/record-metrics.js';

const TODAY = '2026-10-21';

describe('countReasons', () => {
  it('tallies reasons and ignores entries without one', () => {
    expect(countReasons([{ reason: 'a' }, { reason: 'a' }, { reason: 'b' }, {}, null])).toEqual({ a: 2, b: 1 });
    expect(countReasons()).toEqual({});
    expect(countReasons(null)).toEqual({});
  });
});

describe('snapshotCosts', () => {
  it('sums row prices to pence and treats bad prices as zero', () => {
    expect(snapshotCosts([{ price: 1.1 }, { price: 2.2 }, { price: 'x' }, null])).toBe(3.3);
    expect(snapshotCosts('nope')).toBe(0);
    expect(snapshotCosts()).toBe(0);
  });
});

describe('basketReconciliation', () => {
  it('returns honest silence with no shops', () => {
    const r = basketReconciliation({}, { today: TODAY });
    expect(r.value).toBeNull();
    expect(r.samples).toBe(0);
    expect(r.evaluationWindowDays).toBe(RECENT_SHOP_WINDOW_DAYS);
  });

  it('names every excluded shop with a reason', () => {
    const r = basketReconciliation({ shops: [
      { id: 'future', date: '2026-12-01', total: 10, items: [{ price: 10 }] },
      { id: 'old', date: '2025-01-01', total: 10, items: [{ price: 10 }] },
      { id: 'zero', date: '2026-10-20', total: 0, items: [{ price: 1 }] },
      { id: 'bare', date: '2026-10-20', total: 10, items: [{ name: 'x' }] },
    ] }, { today: TODAY });
    expect(r.value).toBeNull();
    expect(r.excluded.map((e) => e.reason)).toEqual([
      'future-shop', 'outside-evaluation-window', 'zero-total', 'no-itemised-prices',
    ]);
  });

  it('scores the gap between items and the declared total', () => {
    const r = basketReconciliation({ shops: [
      { id: 'a', date: '2026-10-20', total: 10, items: [{ price: 4 }, { price: 4 }] },
    ] }, { today: TODAY });
    expect(r.value).toBe(0.2);
    expect(r.samples).toBe(1);
    expect(r.confidence).toBe('low');
  });
});

describe('spendAccuracy', () => {
  it('is silent without shops or a freeze and never throws on junk', () => {
    expect(spendAccuracy({}, { today: TODAY }).value).toBeNull();
    const r = spendAccuracy({ shops: [{ id: 's', date: '2026-10-20', total: 5, items: [{ price: 5 }] }] }, { today: TODAY });
    expect(r.value).toBeNull();
    expect(r.excluded).toHaveLength(1);
    expect(spendAccuracy({ shops: 'x' }, { today: TODAY }).value).toBeNull();
  });
});
