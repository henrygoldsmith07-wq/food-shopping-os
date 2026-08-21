import {
  createHealthVault, decryptHealth, HEALTH_CREDENTIAL_KEY, HEALTH_VAULT_KEY,
  platformUnlockAvailable, registerPlatformUnlock, verifyPlatformUnlock, withoutHealth,
} from './health-vault.js';
import { EMPTY_STATE } from './state.js';

export const vaultActions = ({
  latest, set, setVaultUnlocked, undoHistory, vaultKey, vaultSalt, vaultWrites,
}) => ({
  enableHealthVault: async (passphrase, usePlatform = true) => {
    const vault = await createHealthVault(latest.current, passphrase);
    if (usePlatform && platformUnlockAvailable()) {
      await registerPlatformUnlock(latest.current.name || 'Forq user');
    }
    localStorage.setItem(HEALTH_VAULT_KEY, JSON.stringify(vault.record));
    vaultKey.current = vault.key;
    vaultSalt.current = vault.salt;
    setVaultUnlocked(true);
    set({ healthVaultEnabled: true });
    undoHistory.current = [];
    return usePlatform && platformUnlockAvailable()
      ? 'Health data encrypted. Your passphrase and device verification are required after locking.'
      : 'Health data encrypted. Your passphrase is required after locking.';
  },
  unlockHealthVault: async (passphrase) => {
    if (localStorage.getItem(HEALTH_CREDENTIAL_KEY)) await verifyPlatformUnlock();
    const record = JSON.parse(localStorage.getItem(HEALTH_VAULT_KEY) || 'null');
    if (!record) throw new Error('No encrypted health record was found on this device.');
    const vault = await decryptHealth(record, passphrase);
    vaultKey.current = vault.key;
    vaultSalt.current = vault.salt;
    setVaultUnlocked(true);
    set(() => ({ ...vault.snapshot, healthVaultEnabled: true }));
    return 'Health data unlocked for this tab.';
  },
  lockHealthVault: async () => {
    await vaultWrites.current;
    undoHistory.current = [];
    vaultKey.current = null;
    vaultSalt.current = null;
    setVaultUnlocked(false);
    set((current) => withoutHealth(current, EMPTY_STATE));
    return 'Health data locked.';
  },
});
