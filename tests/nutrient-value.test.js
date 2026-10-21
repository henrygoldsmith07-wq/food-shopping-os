import { describe, it, expect } from 'vitest';
import {
  asNutrientValue, nutrientValue, hasNutrientData, normalizePer100, scale, scaleValues, entryNumbers,
} from '../src/lib/nutrient-value.js';

describe('nutrient-value: missing is never zero', () => {
  it('keeps measured zero as zero', () => {
    expect(asNutrientValue(0).value).toBe(0);
    expect(asNutrientValue('0').value).toBe(0);
    expect(hasNutrientData(0)).toBe(true);
  });
  it.each([undefined, null, '', '   ', 'abc', NaN, Infinity, { value: '' }, { value: null }])(
    'treats %j as unknown',
    (raw) => {
      const nv = asNutrientValue(raw);
      expect(nv.value).toBeNull();
      expect(nv.confidence).toBe('low');
      expect(hasNutrientData(raw)).toBe(false);
    },
  );
  it('nutrientValue maps blank to null', () => {
    expect(nutrientValue('').value).toBeNull();
    expect(nutrientValue(5).value).toBe(5);
  });
  it('normalizePer100 leaves absent keys null', () => {
    const p = normalizePer100({ kcal: 100 });
    expect(p.kcal.value).toBe(100);
    expect(p.protein.value).toBeNull();
  });
  it('scale keeps unknown null, scales known, and blank stays null', () => {
    const s = scale({ kcal: 200, protein: '' }, 50);
    expect(s.kcal).toBe(100);
    expect(s.protein).toBeNull();
    expect(scaleValues({ kcal: 0 }, 100).kcal.value).toBe(0);
  });
  it('entryNumbers handles quick-adds and null entries', () => {
    expect(entryNumbers({ source: 'quick', nutrients: { kcal: 250 } }).kcal).toBe(250);
    expect(entryNumbers({ source: 'quick', nutrients: { kcal: 250 } }).fibre).toBeNull();
    expect(entryNumbers(null).kcal).toBeNull();
  });
});
