import { describe, expect, it } from 'vitest';
import { accountErrorMessage } from '../src/lib/account-error.js';

describe('accountErrorMessage', () => {
  it('explains a network failure instead of showing "Failed to fetch"', () => {
    expect(accountErrorMessage(new TypeError('Failed to fetch'))).toMatch(/could not be reached/);
    expect(accountErrorMessage(new TypeError('Load failed'))).toMatch(/connection/);
  });
  it('passes a server message through', () => {
    expect(accountErrorMessage(new Error('That email is already registered.'))).toBe('That email is already registered.');
  });
  it('falls back when there is no usable message', () => {
    expect(accountErrorMessage(new Error('  '))).toMatch(/try again/);
    expect(accountErrorMessage(null, 'Nope.')).toBe('Nope.');
    expect(accountErrorMessage('x')).toMatch(/try again/);
  });
});
