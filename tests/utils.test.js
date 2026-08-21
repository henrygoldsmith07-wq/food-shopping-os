import { describe, it, expect } from 'vitest';
import { gbp, clamp, expiryStatus, seededPick } from '../src/lib/utils.js';

describe('gbp', () => {
  it('formats whole pounds without pence by default', () => {
    expect(gbp(65)).toBe('£65');
  });
  it('always shows pence when asked', () => {
    expect(gbp(65, { always: true })).toBe('£65.00');
    expect(gbp(1.5)).toBe('£1.50');
  });
});

describe('clamp', () => {
  it('bounds values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('expiryStatus', () => {
  it('flags expired and urgent items', () => {
    expect(expiryStatus(0).tone).toBe('danger');
    expect(expiryStatus(1).tone).toBe('danger');
    expect(expiryStatus(3).tone).toBe('warn');
    expect(expiryStatus(7).tone).toBe('muted');
    expect(expiryStatus(30).tone).toBe('faint');
  });
});

describe('seededPick', () => {
  const arr = ['a', 'b', 'c', 'd', 'e'];
  it('is deterministic for a seed', () => {
    expect(seededPick(arr, 3, 42)).toEqual(seededPick(arr, 3, 42));
  });
  it('returns n unique items when the pool is big enough', () => {
    const out = seededPick(arr, 4, 7);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });
  it('never exceeds the pool', () => {
    expect(seededPick(arr, 10, 1)).toHaveLength(5);
  });
});
