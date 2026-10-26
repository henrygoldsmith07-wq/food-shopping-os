import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('UK/US produce and sugar wordings', () => {
  it.each([['green onion', 'spring onions'], ['powdered sugar', 'icing sugar'], ['beet', 'beetroot'], ['beets', 'beetroot'], ['rutabaga', 'swede'], ['snow peas', 'mange tout']])('%s -> %s', (a, b) => {
    expect(canonicalName(a)).toBe(b);
  });
});
