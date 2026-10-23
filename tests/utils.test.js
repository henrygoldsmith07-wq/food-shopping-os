import { describe, it, expect } from 'vitest';
import { formatCookTime, gbp, clamp, expiryStatus, seededPick } from '../src/lib/utils.js';

describe('gbp', () => {
  it('formats whole pounds without pence by default', () => {
    expect(gbp(65)).toBe('£65');
  });
  it('always shows pence when asked', () => {
    expect(gbp(65, { always: true })).toBe('£65.00');
    expect(gbp(1.5)).toBe('£1.50');
  });
  it('coerces strings and guards bad input', () => {
    expect(gbp('65')).toBe('£65');
    expect(gbp(NaN)).toBe('—');
    expect(gbp(Infinity)).toBe('—');
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
  it('guards bad input instead of leaking NaN', () => {
    expect(expiryStatus(NaN).label).toBe('—');
    expect(expiryStatus(undefined).tone).toBe('faint');
  });
});

describe('formatCookTime', () => {
  it('keeps short times in minutes', () => {
    expect(formatCookTime(45)).toBe('45 min');
    expect(formatCookTime(20)).toBe('20 min');
    expect(formatCookTime('45')).toBe('45 min');
  });
  it('keeps the minutes on long times', () => {
    expect(formatCookTime(75)).toBe('1 h 15 min');
    expect(formatCookTime(61)).toBe('1 h 1 min');
    expect(formatCookTime(90)).toBe('1 h 30 min');
    expect(formatCookTime(120)).toBe('2 h');
    expect(formatCookTime(60)).toBe('1 h');
  });
  it('never prints a 60-minute remainder', () => {
    expect(formatCookTime(119.6)).toBe('2 h');
    expect(formatCookTime(59.6)).toBe('1 h');
  });
  it('reads missing or non-positive times as unknown', () => {
    expect(formatCookTime(null)).toBe('—');
    expect(formatCookTime(0)).toBe('—');
    expect(formatCookTime(0.4)).toBe('—');
    expect(formatCookTime(-5)).toBe('—');
    expect(formatCookTime('fast')).toBe('—');
    expect(formatCookTime(Infinity)).toBe('—');
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
  it('guards bad input', () => {
    expect(seededPick(null, 2, 1)).toEqual([]);
    expect(seededPick(arr, 0, 1)).toEqual([]);
    expect(seededPick(arr, 2)).toHaveLength(2);
  });
});
