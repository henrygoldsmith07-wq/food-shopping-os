import { beforeEach, describe, expect, it } from 'vitest';
import { vaultActions } from '../src/lib/vault-actions.js';
import { HEALTH_VAULT_KEY } from '../src/lib/health-vault.js';
import { EMPTY_STATE } from '../src/lib/state.js';

const setup = (init = {}) => {
  let state = { ...EMPTY_STATE, ...init };
  const refs = {
    latest: { current: state },
    set: (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; refs.latest.current = state; },
    setVaultUnlocked: (v) => { refs.unlocked = v; },
    undoHistory: { current: ['x'] },
    vaultKey: { current: null },
    vaultSalt: { current: null },
    vaultWrites: { current: Promise.resolve() },
    unlocked: false,
  };
  return { a: vaultActions(refs), refs, get: () => state };
};

describe('vault actions', () => {
  beforeEach(() => localStorage.clear());

  it('enable stores an encrypted record, unlocks and clears undo history', async () => {
    const { a, refs, get } = setup({ glucose: [{ date: '2026-10-21', value: 5.4 }] });
    const msg = await a.enableHealthVault('correct horse battery', false);
    expect(msg).toMatch(/passphrase is required/);
    const stored = localStorage.getItem(HEALTH_VAULT_KEY);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('5.4');
    expect(refs.unlocked).toBe(true);
    expect(refs.vaultKey.current).toBeTruthy();
    expect(refs.undoHistory.current).toEqual([]);
    expect(get().healthVaultEnabled).toBe(true);
  });

  it('lock wipes health data and keys; unlock with the right passphrase restores it', async () => {
    const { a, refs, get } = setup({ glucose: [{ date: '2026-10-21', value: 5.4 }] });
    await a.enableHealthVault('correct horse battery', false);
    await a.lockHealthVault();
    expect(refs.unlocked).toBe(false);
    expect(refs.vaultKey.current).toBeNull();
    expect(get().glucose).toEqual(EMPTY_STATE.glucose);
    await a.unlockHealthVault('correct horse battery');
    expect(get().glucose).toEqual([{ date: '2026-10-21', value: 5.4 }]);
    expect(refs.unlocked).toBe(true);
  });

  it('a wrong passphrase does not unlock or restore data', async () => {
    const { a, refs, get } = setup({ glucose: [{ date: '2026-10-21', value: 5.4 }] });
    await a.enableHealthVault('correct horse battery', false);
    await a.lockHealthVault();
    await expect(a.unlockHealthVault('wrong passphrase!!')).rejects.toThrow();
    expect(refs.unlocked).toBe(false);
    expect(get().glucose).toEqual(EMPTY_STATE.glucose);
  });

  it('unlock without a stored record explains why', async () => {
    const { a } = setup();
    await expect(a.unlockHealthVault('anything')).rejects.toThrow(/No encrypted health record/);
  });

  it('unlock with a corrupt stored record gives a readable error', async () => {
    const { a } = setup();
    localStorage.setItem(HEALTH_VAULT_KEY, '{not json');
    await expect(a.unlockHealthVault('anything')).rejects.toThrow(/unreadable/);
  });
});
