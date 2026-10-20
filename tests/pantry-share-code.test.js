import { describe, expect, it } from 'vitest';
import { pantryFromShareCode, pantryShareCode } from '../src/lib/pantry-share-code.js';

const enc = (v) => `FORQ-PANTRY-1.${btoa(unescape(encodeURIComponent(JSON.stringify(v))))}`;

describe('pantry share code', () => {
  it('round-trips a pantry', () => {
    const rows = pantryFromShareCode(pantryShareCode([{ name: ' Milk ', qty: '1 pint', cost: 1.2, expiry: '2026-11-01', cat: 'Dairy' }]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Milk', qty: '1 pint', cost: 1.2, expiry: '2026-11-01', cat: 'Dairy' });
  });
  it('rejects damaged codes', () => {
    expect(() => pantryFromShareCode('nope')).toThrow(/invalid/);
    expect(() => pantryFromShareCode(enc([{ name: 5 }]))).toThrow(/invalid/);
  });
  it('drops unknown fields and caps long ones from untrusted codes', () => {
    const [row] = pantryFromShareCode(enc([{ name: 'Rice', evil: '<script>', id: 'x', emoji: 'a'.repeat(500), store: 's'.repeat(500), expiry: 'junk', cost: -4 }]));
    expect(row.evil).toBeUndefined();
    expect(row.id).toBeUndefined();
    expect(row.emoji.length).toBeLessThanOrEqual(8);
    expect(row.store.length).toBeLessThanOrEqual(60);
    expect(row.expiry).toBeNull();
    expect(row.cost).toBe(0);
  });
});
