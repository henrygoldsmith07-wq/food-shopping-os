import { describe, it, expect } from 'vitest';
import {
  normalisePriceAlertConfig, thresholdFor, baselineFor, derivePriceAnomalies, priceAnomalyForList,
} from '../src/lib/price-alerts.js';

const shop = (date, price, name = 'milk') => ({ date, store: 'Tesco', items: [{ name, price, emoji: '🥛' }] });

describe('price alerts', () => {
  it('clamps thresholds to 5-50 and falls back on junk', () => {
    const c = normalisePriceAlertConfig({ risePct: 200, bargainPct: 'x' });
    expect(c.risePct).toBe(50);
    expect(c.bargainPct).toBe(15);
    expect(normalisePriceAlertConfig({ risePct: 1 }).risePct).toBe(5);
    expect(normalisePriceAlertConfig(null).overrides).toEqual({});
  });
  it('baselineFor needs two usable prices', () => {
    expect(baselineFor(null)).toBeNull();
    expect(baselineFor({ points: [{ price: 1 }] })).toBeNull();
    expect(baselineFor({ points: [{ price: 1 }, { price: 2 }] })).toBe(1);
    expect(baselineFor({ points: [{ price: 1 }, { price: 3 }, { price: 9 }] })).toBe(2);
  });
  it('flags a rise and a bargain from receipts', () => {
    const rise = derivePriceAnomalies([shop('2026-10-01', 1), shop('2026-10-08', 1), shop('2026-10-15', 2)]);
    expect(rise.rises).toHaveLength(1);
    expect(rise.rises[0].pct).toBe(100);
    const cheap = derivePriceAnomalies([shop('2026-10-01', 2), shop('2026-10-08', 2), shop('2026-10-15', 1)]);
    expect(cheap.bargains).toHaveLength(1);
  });
  it('a single receipt is only watchable', () => {
    const r = derivePriceAnomalies([shop('2026-10-01', 1)]);
    expect(r.rises).toHaveLength(0);
    expect(r.watchable[0].times).toBe(1);
  });
  it('per-item override applies, even with different capitalisation', () => {
    const cfg = { overrides: { Milk: { risePct: 50 } } };
    expect(thresholdFor('milk', 'rise', normalisePriceAlertConfig(cfg))).toBe(0.5);
  });
  it('matches list items to anomalies', () => {
    const shops = [shop('2026-10-01', 1), shop('2026-10-08', 2)];
    const out = priceAnomalyForList([{ name: 'milk' }, { name: 'eggs' }], shops);
    expect(out).toHaveLength(1);
    expect(out[0].anomaly.tone).toBe('danger');
  });
});
