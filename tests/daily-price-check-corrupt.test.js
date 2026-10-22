// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { dailyCheckSettings, setDailyCheckEnabled } from '../src/lib/daily-price-check.js';

const KEY = (() => {
  localStorage.clear();
  setDailyCheckEnabled(true);
  const key = Object.keys(localStorage).length ? localStorage.key(0) : null;
  localStorage.clear();
  return key;
})();

describe('daily price check storage', () => {
  beforeEach(() => localStorage.clear());

  it('treats a stored array as empty state instead of spreading its indices', () => {
    localStorage.setItem(KEY, '["a","b"]');
    expect(dailyCheckSettings().enabled).toBe(false);
    setDailyCheckEnabled(true);
    const saved = JSON.parse(localStorage.getItem(KEY));
    expect(Array.isArray(saved)).toBe(false);
    expect(saved).toEqual({ enabled: true });
  });
});
