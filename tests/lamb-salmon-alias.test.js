import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('lamb mince and salmon wordings merge', () => {
  it.each([
    ['lamb mince', 'ground lamb'], ['minced lamb', 'lamb mince'],
    ['fillet of salmon', 'salmon fillet'], ['skinless salmon fillets', 'salmon'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('lamb mince is not beef or pork mince', () => {
    expect(canonicalName('lamb mince')).not.toBe(canonicalName('beef mince'));
    expect(canonicalName('lamb mince')).not.toBe(canonicalName('pork mince'));
  });
});
