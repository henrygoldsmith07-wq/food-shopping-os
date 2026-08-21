import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FORQ_PULSE_OPT_IN_KEY, readForqPulseOptIn, setForqPulseOptIn,
} from '../src/lib/pulse-opt-in.js';

describe('Forq Pulse opt-in', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('is off by default', () => {
    expect(readForqPulseOptIn()).toBe(false);
    expect(localStorage.getItem(FORQ_PULSE_OPT_IN_KEY)).toBeNull();
  });

  it('round-trips the flag', () => {
    setForqPulseOptIn(true);
    expect(localStorage.getItem(FORQ_PULSE_OPT_IN_KEY)).toBe('1');
    expect(readForqPulseOptIn()).toBe(true);

    setForqPulseOptIn(false);
    expect(localStorage.getItem(FORQ_PULSE_OPT_IN_KEY)).toBeNull();
    expect(readForqPulseOptIn()).toBe(false);
  });

  it('revoking never touches Forq’s own state', () => {
    localStorage.setItem('forq-state-v2', JSON.stringify({ day: '2026-08-17', plan: { '2026-08-16': { dinner: 'pasta' } } }));
    setForqPulseOptIn(true);
    setForqPulseOptIn(false);
    expect(localStorage.getItem('forq-state-v2')).toBe(JSON.stringify({ day: '2026-08-17', plan: { '2026-08-16': { dinner: 'pasta' } } }));
  });
});
