import { describe, expect, it } from 'vitest';
import { consumptionRateFor, runoutPredictionFor } from '../src/lib/consumption-predictions.js';

const shops = [
  { date: '2026-08-01', items: [{ name: 'Milk', quantity: 2 }] },
  { date: '2026-08-05', items: [{ name: 'Milk', quantity: 2 }] },
  { date: '2026-08-09', items: [{ name: 'Milk', quantity: 2 }] },
  { date: '2026-08-13', items: [{ name: 'Milk', quantity: 2 }] },
  { date: '2026-08-17', items: [{ name: 'Milk', quantity: 2 }] },
];

describe('consumption predictions', () => {
  it('derives average purchased quantity and cadence', () => {
    expect(consumptionRateFor('Milk', shops)).toMatchObject({ purchases: 5, averageQuantity: 2, averageIntervalDays: 4, confidence: 'high' });
  });
  it('predicts runout and an earlier buy-by date', () => {
    expect(runoutPredictionFor({ name: 'Milk', quantity: 2 }, shops, { today: '2026-08-17', safetyDays: 1 })).toMatchObject({ runoutDate: '2026-08-21', buyByDate: '2026-08-20', action: 'plan' });
  });
  it('does not pretend to predict with one purchase', () => {
    expect(runoutPredictionFor({ name: 'Milk', quantity: 2 }, shops.slice(0, 1), { today: '2026-08-01' }).action).toBe('observe');
  });
});
