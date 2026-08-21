import { DEFAULT_TARGETS } from '../data/nutrients.js';
import {
  ACCENT_IDS, EMPTY_STATE, rolloverDay, STATE_VERSION, STORAGE_KEY,
} from './state.js';
import { normalisePriceAlertConfig } from './price-alerts.js';
import { HEALTH_VAULT_KEY, withoutHealth } from './health-vault.js';
import { permissionsForRole } from './household.js';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const hydrate = (stored = {}) => {
  const candidate = isObject(stored) ? stored : {};
  const state = {
    ...EMPTY_STATE,
    ...candidate,
    schemaVersion: STATE_VERSION,
    members: (Array.isArray(candidate.members) ? candidate.members : []).map((member) => ({
      ...member,
      role: member.role === 'child' ? 'child' : 'adult',
      permissions: {
        ...permissionsForRole(member.role === 'child' ? 'child' : 'adult'),
        ...(member.permissions || {}),
      },
      notifications: member.notifications !== false,
    })),
    body: { ...EMPTY_STATE.body, ...(isObject(candidate.body) ? candidate.body : {}) },
    targets: { ...DEFAULT_TARGETS, ...(isObject(candidate.targets) ? candidate.targets : {}) },
  };
  Object.entries(EMPTY_STATE).forEach(([key, fallback]) => {
    if (Array.isArray(fallback) && !Array.isArray(state[key])) state[key] = [];
    else if (isObject(fallback) && !isObject(state[key])) state[key] = { ...fallback };
  });
  if (!ACCENT_IDS.includes(state.accent)) state.accent = EMPTY_STATE.accent;
  // v4: receipt-only rise/bargain + coupon vault
  if (!Array.isArray(state.coupons)) state.coupons = [];
  state.priceAlertConfig = normalisePriceAlertConfig(state.priceAlertConfig || {});
  if (!Array.isArray(state.priceAlerts)) state.priceAlerts = [];
  if (!Array.isArray(state.offers)) state.offers = [];
  return rolloverDay(state);
};

export const parseBackup = (text) => {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  const candidate = isObject(parsed?.state) ? parsed.state : parsed;
  if (!isObject(candidate) || typeof candidate.onboarded !== 'boolean') {
    throw new Error('This is not a complete Forq backup.');
  }
  return hydrate(candidate);
};

export const serialiseBackup = (state, healthVault = null) => JSON.stringify({
  format: 'forq-backup',
  version: STATE_VERSION,
  exportedAt: new Date().toISOString(),
  state: hydrate(healthVault ? withoutHealth(state, EMPTY_STATE) : state),
  ...(healthVault ? { healthVault } : {}),
}, null, 2);

export const loadStoredState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? parseBackup(raw) : null;
    const vault = localStorage.getItem(HEALTH_VAULT_KEY);
    return raw
      ? { state: parsed.healthVaultEnabled && vault ? withoutHealth(parsed, EMPTY_STATE) : parsed, issue: null }
      : { state: { ...EMPTY_STATE }, issue: null };
  } catch (error) {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* storage itself is unavailable */ }
    return {
      state: { ...EMPTY_STATE },
      issue: {
        kind: raw ? 'corrupt' : 'unavailable',
        message: raw
          ? 'Forq could not read your saved data. It has not been overwritten.'
          : 'This browser is blocking local storage, so changes cannot be saved.',
        raw,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
};
