import { describe, it, expect } from 'vitest';
import { COMMON_STAPLES, staplePantryItems, staplesNotAlreadyIn } from '../src/lib/seed-staples.js';

describe('smart seeding — 10 common pantry staples', () => {
  it('offers exactly ten universal staples', () => {
    expect(COMMON_STAPLES).toHaveLength(10);
    COMMON_STAPLES.forEach((staple) => {
      expect(staple.name).toBeTruthy();
      expect(staple.cat).toBeTruthy();
      expect(staple.location).toBeTruthy();
      expect(staple.qty).toBeTruthy();
    });
  });

  it('marks seeded items as starter data so they never read as observed', () => {
    const items = staplePantryItems('2026-09-01');
    expect(items).toHaveLength(10);
    items.forEach((item) => {
      expect(item.purchaseSource).toBe('starter');
      expect(item.purchaseDate).toBe('2026-09-01');
      expect(item.addedAt).toBe('2026-09-01');
    });
  });

  it('gives perishable staples an expiry but keeps cupboard goods open-ended', () => {
    const items = staplePantryItems('2026-09-01');
    const milk = items.find((item) => item.name === 'Milk');
    const rice = items.find((item) => item.name === 'Rice');
    expect(milk.expiry).toBe('2026-09-06');
    expect(rice.expiry).toBeNull();
  });

  it('skips staples the pantry already tracks', () => {
    const missing = staplesNotAlreadyIn([{ name: '  milk ' }, { name: 'Rice' }]);
    expect(missing.map((staple) => staple.name)).not.toContain('Milk');
    expect(missing.map((staple) => staple.name)).not.toContain('Rice');
    expect(missing).toHaveLength(8);
  });
});
