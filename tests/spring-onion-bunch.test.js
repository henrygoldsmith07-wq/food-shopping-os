import { describe, expect, it } from 'vitest';
import { shoppableQty } from '../src/lib/shoppable-qty.js';
describe('spring onions in bunches and stems', () => {
  it('adds a bunch and loose stems into bunches', () => {
    expect(shoppableQty('1 bunch + 4', 'Spring onions')).toBe('2 bunches');
    expect(shoppableQty('1 bunch + 2', 'Spring onions')).toBe('2 bunches');
    expect(shoppableQty('3 + 4', 'scallions')).toBe('1 bunch');
  });
});
