import { describe, it, expect } from 'vitest';
import { compareStores } from '../src/lib/shopping-prices.js';

describe('compareStores store names', () => {
  it('treats differently-cased store names as one shop', () => {
    const shops = [
      { store: 'Tesco', date: '2026-10-01', items: [{ name: 'milk', price: 1.5 }] },
      { store: 'tesco ', date: '2026-10-08', items: [{ name: 'eggs', price: 2 }] },
    ];
    const rows = compareStores([{ name: 'milk' }, { name: 'eggs' }], shops);
    expect(rows).toHaveLength(1);
    expect(rows[0].store).toBe('Tesco');
    expect(rows[0].covered).toBe(2);
    expect(rows[0].total).toBe(3.5);
  });
});
