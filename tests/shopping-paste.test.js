import { describe, it, expect } from 'vitest';
import { parsePastedList } from '../src/lib/shopping-paste.js';

/**
 * The paste parser must be boring: it handles the shapes people actually
 * write, never invents a quantity it can't justify, and leaves anything it
 * can't read as the item's name — a wrong guess is worse than an unguessable
 * line, and every row is editable once it lands on the list.
 */
describe('parsing a pasted shopping list', () => {
  it('reads "2 pints of milk" as a quantity with a unit', () => {
    expect(parsePastedList('2 pints of milk')).toEqual([{ name: 'milk', qty: '2 pints' }]);
  });

  it('reads "2x milk" and "milk x2"', () => {
    expect(parsePastedList('2x Milk')).toEqual([{ name: 'Milk', qty: '2' }]);
    expect(parsePastedList('milk x2')).toEqual([{ name: 'milk', qty: '2' }]);
  });

  it('reads "Bread: 1 loaf" with the unit attached', () => {
    expect(parsePastedList('Bread: 1 loaf')).toEqual([{ name: 'Bread', qty: '1 loaf' }]);
  });

  it('keeps colour words out of the unit slot: "2 red peppers" stays whole', () => {
    expect(parsePastedList('2 red peppers')).toEqual([{ name: 'red peppers', qty: '2' }]);
  });

  it('reads a bare count: "6 eggs"', () => {
    expect(parsePastedList('6 eggs')).toEqual([{ name: 'eggs', qty: '6' }]);
  });

  it('strips bullet characters and keeps a plain line as the name', () => {
    expect(parsePastedList('- Olive oil\n• Bananas\n> Tea')).toEqual([
      { name: 'Olive oil', qty: '' },
      { name: 'Bananas', qty: '' },
      { name: 'Tea', qty: '' },
    ]);
  });

  it('handles decimal commas: "2,5 kg potatoes"', () => {
    expect(parsePastedList('2,5 kg potatoes')).toEqual([{ name: 'potatoes', qty: '2.5 kg' }]);
  });

  it('deduplicates by name, first mention wins', () => {
    const rows = parsePastedList('Milk\n2 pints of milk\nBread');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Milk', qty: '' });
  });

  it('skips blanks and one-character fragments', () => {
    expect(parsePastedList('\n\na\n\nOK\n')).toEqual([{ name: 'OK', qty: '' }]);
  });

  it('caps pathological input instead of hanging the tab', () => {
    const rows = parsePastedList(Array.from({ length: 500 }, (_, i) => `item ${i}`).join('\n'));
    expect(rows).toHaveLength(60);
  });

  it('returns nothing for empty input', () => {
    expect(parsePastedList('')).toEqual([]);
    expect(parsePastedList(null)).toEqual([]);
  });
});

describe('pasting a copied printed grocery list (switching apps)', () => {
  // Mealime offers no export: its lists leave as copied or printed text,
  // grouped under category headers, sometimes with tick boxes. Headers name
  // no food and must never land on the list as items called "Produce".
  it('skips category headers and reads the items under them', () => {
    expect(parsePastedList('Produce:\n2 avocados\n1 red onion\n\nDairy & Eggs:\n6 eggs\n2 pints of milk')).toEqual([
      { name: 'avocados', qty: '2' },
      { name: 'red onion', qty: '1' },
      { name: 'eggs', qty: '6' },
      { name: 'milk', qty: '2 pints' },
    ]);
  });

  it('strips shared-list tick boxes', () => {
    expect(parsePastedList('[ ] Olive oil\n[x] Bananas\n( ) Tea')).toEqual([
      { name: 'Olive oil', qty: '' },
      { name: 'Bananas', qty: '' },
      { name: 'Tea', qty: '' },
    ]);
  });

  it('handles tick boxes combined with bullets and quantities', () => {
    expect(parsePastedList('- [ ] 2 tins of tomatoes\n- [x] Bread: 1 loaf')).toEqual([
      { name: 'tomatoes', qty: '2 tins' },
      { name: 'Bread', qty: '1 loaf' },
    ]);
  });

  it('still reads a quantity after a colon — only bare headers are skipped', () => {
    expect(parsePastedList('Bread: 1 loaf')).toEqual([{ name: 'Bread', qty: '1 loaf' }]);
  });
});
