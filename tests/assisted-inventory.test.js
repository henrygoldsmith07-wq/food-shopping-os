import { describe, expect, it } from 'vitest';
import { assistedInventory } from '../src/lib/kitchen-inventory.js';

const reply = (ok, body) => async () => ({ ok, json: async () => body });

describe('assistedInventory', () => {
  it('returns text, read and model', async () => {
    expect(await assistedInventory({ text: 'milk' }, { fetchImpl: reply(true, { text: 'milk', read: 'photo', model: 'm' }) }))
      .toEqual({ text: 'milk', read: 'photo', model: 'm' });
  });
  it('survives a null success body', async () => {
    expect(await assistedInventory({ text: 'x' }, { fetchImpl: reply(true, null) })).toEqual({ text: '', read: 'text', model: null });
  });
  it('drops non-string fields', async () => {
    expect(await assistedInventory({ text: 'x' }, { fetchImpl: reply(true, { text: 5, read: {}, model: 3 }) })).toEqual({ text: '', read: 'text', model: null });
  });
  it('uses a plain message when the error is not a string', async () => {
    await expect(assistedInventory({ text: 'x' }, { fetchImpl: reply(false, { error: [1] }) })).rejects.toThrow('That could not be read.');
  });
});
