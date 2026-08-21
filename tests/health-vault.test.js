import { describe, expect, it } from 'vitest';
import {
  createHealthVault, decryptHealth, HEALTH_FIELDS, healthSnapshot, withoutHealth,
} from '../src/lib/health-vault.js';
import { EMPTY_STATE } from '../src/lib/state.js';

describe('health vault', () => {
  it('removes every sensitive field from the ordinary storage record', () => {
    const state = {
      ...EMPTY_STATE,
      body: { ...EMPTY_STATE.body, weightKg: 72 },
      glucose: [{ date: '2026-07-30', value: 5.4 }],
      bloods: [{ date: '2026-07-30', values: { cholesterol: 4.2 } }],
    };
    const stored = withoutHealth(state, EMPTY_STATE);
    for (const field of HEALTH_FIELDS) expect(stored[field]).toEqual(EMPTY_STATE[field]);
  });

  it('round-trips health data through authenticated encryption', async () => {
    const state = {
      ...EMPTY_STATE,
      body: { ...EMPTY_STATE.body, weightKg: 72 },
      glucose: [{ date: '2026-07-30', value: 5.4 }],
    };
    const vault = await createHealthVault(state, 'correct horse battery staple');
    // A short digit sequence can legitimately appear in random base64. Check
    // that the encrypted payload is not the serialised health snapshot itself.
    expect(vault.record.ciphertext).not.toBe(JSON.stringify(healthSnapshot(state)));
    const unlocked = await decryptHealth(vault.record, 'correct horse battery staple');
    expect(unlocked.snapshot).toEqual(healthSnapshot(state));
    await expect(decryptHealth(vault.record, 'wrong passphrase')).rejects.toThrow(/incorrect|damaged/);
  });
});
