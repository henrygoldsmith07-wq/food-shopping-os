import { it, expect } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';
import { shoppingItemsForRecipe } from '../src/lib/recipe-shopping.js';
it('tinned/canned prefixes fold into the known ingredient', () => {
  expect(canonicalName('Canned chickpeas')).toBe(canonicalName('Chickpeas'));
  expect(canonicalName('tin of kidney beans')).toBe(canonicalName('kidney beans'));
  expect(canonicalName('Chickpeas (canned)')).toBe(canonicalName('chickpeas'));
  expect(canonicalName('canned unicorn')).toBe('canned unicorn');
});
it('one recipe listing canned and plain chickpeas gives one shopping row', () => {
  const rows = shoppingItemsForRecipe({ id: 'r', name: 'R', ingredients: [{ name: 'Canned chickpeas', qty: '1 tin' }, { name: 'Chickpeas', qty: '1 tin' }] }, [], { today: '2026-09-22' });
  expect(rows).toHaveLength(1);
  expect(rows[0].qty).toMatch(/800 g|2/);
});
