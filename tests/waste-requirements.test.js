import { describe, it, expect } from 'vitest';
import {
  round, clamp, daysBetween, ingredientRequirements, stockGroups,
  primaryMeasurement, isPerishable, packageFor,
} from '../src/lib/waste-requirements.js';

describe('waste-requirements helpers', () => {
  it('round and clamp tolerate junk input', () => {
    expect(round('abc')).toBe(0);
    expect(round(1.005 * 1000, 0)).toBe(1005);
    expect(round(2.345, 1)).toBe(2.3);
    expect(clamp(150)).toBe(100);
    expect(clamp(-5)).toBe(0);
    expect(clamp(undefined)).toBe(0);
  });

  it('daysBetween needs two valid YYYY-MM-DD stamps', () => {
    expect(daysBetween('2026-10-20', '2026-10-23')).toBe(3);
    expect(daysBetween('2026-10-23', '2026-10-20')).toBe(-3);
    expect(daysBetween('2026-10-20', '')).toBeNull();
    expect(daysBetween('20/10/2026', '2026-10-21')).toBeNull();
    // Across the UK clock change the answer is still whole days.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('isPerishable: expiry or a fresh category', () => {
    expect(isPerishable({ expiry: '2026-10-25' })).toBe(true);
    expect(isPerishable({ cat: 'Dairy & eggs' })).toBe(true);
    expect(isPerishable({ cat: 'Tins' })).toBe(false);
    expect(isPerishable(null)).toBe(false);
  });

  it('primaryMeasurement reads the first dimension', () => {
    expect(primaryMeasurement({ dimensions: [], measurements: {}, units: {} })).toBeNull();
    expect(primaryMeasurement({ dimensions: ['mass'], measurements: { mass: 300 }, units: { mass: 'g' } }))
      .toEqual({ dim: 'mass', amount: 300, unit: 'g' });
  });

  it('stockGroups sums a food across rows and skips leftovers and blanks', () => {
    const groups = stockGroups([
      { name: 'Rice', qty: '500 g' },
      { name: 'rice', qty: '250 g' },
      { name: 'Lasagne', qty: '2 portions', cat: 'Leftovers' },
      { name: '  ', qty: '1' },
      'flour',
    ]);
    const rice = [...groups.values()].find((g) => /rice/i.test(g.name));
    expect(rice.items).toHaveLength(2);
    expect(rice.measurements.mass).toBe(750);
    expect([...groups.values()].some((g) => /lasagne/i.test(g.name))).toBe(false);
    expect([...groups.values()].some((g) => /flour/i.test(g.name))).toBe(true);
  });

  it('ingredientRequirements keeps unknown quantities out of the totals', () => {
    const out = ingredientRequirements([
      { name: 'Pasta', ingredients: [{ name: 'spaghetti', qty: '200 g' }, { name: 'salt', qty: 'to taste' }] },
      { name: 'Pasta 2', ingredients: [{ name: 'spaghetti', qty: '100 g' }] },
    ]);
    const rows = out instanceof Map ? [...out.values()] : Object.values(out);
    const spag = rows.find((r) => /spaghetti/.test(r.name));
    expect(spag.measurements.mass).toBe(300);
    const salt = rows.find((r) => /salt/.test(r.name));
    if (salt) expect(Object.keys(salt.measurements)).toHaveLength(0);
  });

  it('packageFor prefers a household override and returns null when nothing is known', () => {
    const req = { name: 'mystery', dimensions: [], units: {}, measurements: {} };
    expect(packageFor('mystery', req, {})).toBeNull();
    const withOverride = packageFor('mystery', req, { mystery: '400 g' });
    expect(withOverride?.source).toBe('household');
  });
});
