/**
 * Forq's own Pulse opt-in.
 *
 * Pulse reads Forq's state from the same shared origin, so the switch here is
 * the gate: while it is off, Pulse refuses to read anything (its connector
 * checks this flag), and turning it off only clears the flag — Forq's own
 * state is untouched, because that state is Forq's data, not a Pulse mirror.
 */

export const FORQ_PULSE_OPT_IN_KEY = 'forq-pulse-opt-in';

const browserStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export const readForqPulseOptIn = () =>
  browserStorage()?.getItem(FORQ_PULSE_OPT_IN_KEY) === '1';

export const setForqPulseOptIn = (enabled) => {
  const storage = browserStorage();
  if (!storage) return false;
  if (enabled) storage.setItem(FORQ_PULSE_OPT_IN_KEY, '1');
  else storage.removeItem(FORQ_PULSE_OPT_IN_KEY);
  globalThis.dispatchEvent?.(new CustomEvent('forq-pulse-opt-in', { detail: { enabled: Boolean(enabled) } }));
  return true;
};
