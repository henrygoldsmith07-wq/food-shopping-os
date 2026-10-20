import { describe, it, expect } from 'vitest';
import { parseVoiceShopping } from '../src/lib/shopping-voice.js';

describe('parseVoiceShopping number words', () => {
  it('does not eat the start of words that begin with a number word', () => {
    const { items } = parseVoiceShopping('add apples, tenderstem broccoli, onions, fewer eggs');
    expect(items.map((i) => i.name)).toEqual(['apples', 'tenderstem broccoli', 'onions', 'fewer eggs']);
    expect(items.every((i) => i.qty === '')).toBe(true);
  });
  it('still reads real quantities', () => {
    const { items } = parseVoiceShopping('add two apples, 2kg potatoes, a loaf of bread');
    expect(items).toEqual([
      { name: 'apples', qty: '2' }, { name: 'potatoes', qty: '2 kg' }, { name: 'bread', qty: '1 loaf' },
    ]);
  });
});
