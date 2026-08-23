import { describe, it, expect } from 'vitest';
import {
  parseQuantity, convert, scaleQuantity, unitPriceOf, DIMENSIONS,
} from '../src/lib/measure.js';
import { scaleQty } from '../src/lib/week-loop.js';

const round = (n) => Math.round(n * 1000) / 1000;

describe('measure engine — invariants that must never break', () => {
  it('parses into a dimension-tagged quantity', () => {
    const p = parseQuantity('500 g');
    expect(p).toMatchObject({ amount: 500, dim: 'mass', unit: 'g' });
    expect(DIMENSIONS).toContain(p.dim);
  });

  it('refuses to convert across dimensions — grams are never millilitres', () => {
    const mass = parseQuantity('500 g');
    expect(convert(mass, 'volume')).toBeNull();
    const count = parseQuantity('3');
    expect(convert(count, 'mass')).toBeNull();
  });

  it('scales linearly: two half-steps equal one full step', () => {
    const p = parseQuantity('400 g');
    const direct = scaleQuantity(p, 3);
    const stepped = scaleQuantity(scaleQuantity(p, 1.5), 2);
    expect(stepped.amount).toBeCloseTo(direct.amount, 6);
    expect(direct.dim).toBe('mass');
    expect(direct.unit).toBe('g');
  });

  it('unit price is linear in pack size: double the grams, half the per-100g', () => {
    const small = unitPriceOf(2, parseQuantity('500 g'));
    const large = unitPriceOf(4, parseQuantity('1000 g'));
    expect(round(small.value)).toBe(round(large.value));
    expect(round(small.value * 5)).toBe(2); // £/100g × 5 = £ total for 500 g
  });

  it('string scaling keeps units attached: "400 g" × 2 → "800 g"', () => {
    expect(scaleQty('400 g', 2)).toMatch(/800/);
    expect(scaleQty('400 g', 0.5)).toMatch(/200/);
  });
});
