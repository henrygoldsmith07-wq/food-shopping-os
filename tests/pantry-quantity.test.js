import { describe, expect, it } from 'vitest';
import { pantryQuantityRange, quantityRangeLabel } from '../src/lib/pantry-intelligence.js';

describe('an amount you typed is the amount you get back', () => {
  it('does not turn a missing range into a range of zero', () => {
    // `Number(null)` is 0 and `Number.isFinite(0)` is true, so reading
    // quantityMin/quantityMax straight through the coercion made every item
    // without an explicit range look like it had one of exactly zero. An item
    // entered as "280 g" was stored correctly and displayed as "0 g".
    const item = { name: 'Cheddar', qty: '280 g', quantityMin: null, quantityMax: null };
    expect(pantryQuantityRange(item)).toMatchObject({ min: 280, max: 280, unit: 'g' });
    expect(quantityRangeLabel(item)).toBe('280 g');
  });

  it('treats an empty string the same as a missing one', () => {
    expect(quantityRangeLabel({ name: 'Rice', qty: '500g', quantityMin: '', quantityMax: '' })).toBe('500 g');
  });

  it('still honours a range someone actually stated', () => {
    const item = { name: 'Rice', qty: '500g', quantityMin: 200, quantityMax: 400 };
    expect(pantryQuantityRange(item)).toMatchObject({ min: 200, max: 400, source: 'estimated' });
    expect(quantityRangeLabel(item)).toBe('200–400 g estimated');
  });

  it('accepts a stated range that starts at zero', () => {
    // Zero is a real answer — "somewhere between none and two" — and the fix
    // must not swap one wrong reading of 0 for another.
    expect(pantryQuantityRange({ name: 'Beans', qty: '2 tins', quantityMin: 0, quantityMax: 2 }))
      .toMatchObject({ min: 0, max: 2 });
  });
});

describe('counted things are counted, not weighed', () => {
  it('says tins when you put tins away', () => {
    // The parser converts "2 tins" to 800 g so the consumption maths has one
    // scale to work in, and keeps the count alongside. Showing someone
    // "800 g of beans" rewrites what they told us.
    expect(quantityRangeLabel({ name: 'Beans', qty: '2 tins' })).toBe('2 tins');
    expect(quantityRangeLabel({ name: 'Beans', qty: '1 tin' })).toBe('1 tin');
  });

  it('keeps the range itself in mass, because the maths depends on it', () => {
    expect(pantryQuantityRange({ name: 'Beans', qty: '2 tins' })).toMatchObject({ min: 800, unit: 'g' });
  });

  it('pluralises countable units and leaves measures alone', () => {
    expect(quantityRangeLabel({ name: 'Eggs', qty: '3 eggs' })).toBe('3 eggs');
    expect(quantityRangeLabel({ name: 'Eggs', qty: '1 egg' })).toBe('1 egg');
    // "280 gs" would read like a typo.
    expect(quantityRangeLabel({ name: 'Cheddar', qty: '280 g' })).toBe('280 g');
  });

  it('reads the vaguer things people actually write', () => {
    expect(quantityRangeLabel({ name: 'Rice', qty: 'half a bag' })).toBe('0.5 bags');
  });

  it('says so plainly when it cannot read the amount, and keeps the words', () => {
    // Echoing back what was typed beats replacing it with a shrug: someone
    // who wrote "loads" can see the app took the note and could not measure it.
    expect(quantityRangeLabel({ name: 'Rice', qty: '' })).toBe('Amount unknown');
    expect(quantityRangeLabel({ name: 'Rice', qty: 'loads' })).toBe('loads (amount unreadable)');
  });
});
