import { useState } from 'react';
import { Fingerprint, Lock, LockOpen } from 'lucide-react';
import { useOptionalApp } from '../lib/store.jsx';
import { Card } from './ui.jsx';

export default function HealthVaultPanel({ app: suppliedApp = null }) {
  const contextApp = useOptionalApp();
  const app = suppliedApp || contextApp;
  const [passphrase, setPassphrase] = useState('');
  const [usePlatform, setUsePlatform] = useState(true);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    setStatus('');
    try {
      const result = await action();
      setPassphrase('');
      setStatus(result || '');
    } catch (error) {
      setStatus(error.message || 'The health vault could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  if (!app) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        {app.healthVault.unlocked ? <LockOpen size={19} /> : <Lock size={19} />}
        <div>
          <p className="font-extrabold text-[0.90625rem]">Encrypted health vault</p>
          <p className="mt-1 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            Health, body, cycle and lab records are removed from the main localStorage record and encrypted with AES-GCM.
            The passphrase never leaves this device.
          </p>
        </div>
      </div>

      {!app.healthVault.enabled || !app.healthVault.unlocked ? (
        <label className="block">
          <span className="text-[0.75rem] font-bold">Vault passphrase</span>
          <input
            type="password"
            autoComplete={app.healthVault.enabled ? 'current-password' : 'new-password'}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2.5 outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          />
        </label>
      ) : null}

      {!app.healthVault.enabled && app.healthVault.platformAvailable && (
        <label className="flex items-center gap-2 text-[0.75rem] font-bold">
          <input type="checkbox" checked={usePlatform} onChange={(event) => setUsePlatform(event.target.checked)} />
          <Fingerprint size={15} /> Require this device’s biometric or PIN check
        </label>
      )}

      <div className="grid gap-2">
        {!app.healthVault.enabled && (
          <button
            type="button"
            disabled={busy || passphrase.length < 8}
            onClick={() => run(() => app.enableHealthVault(passphrase, usePlatform))}
            className="press rounded-xl px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            Encrypt health data
          </button>
        )}
        {app.healthVault.enabled && !app.healthVault.unlocked && (
          <button
            type="button"
            disabled={busy || passphrase.length < 8}
            onClick={() => run(() => app.unlockHealthVault(passphrase))}
            className="press rounded-xl px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            Unlock health data
          </button>
        )}
        {app.healthVault.enabled && app.healthVault.unlocked && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(app.lockHealthVault)}
            className="press rounded-xl border px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ borderColor: 'var(--line)' }}
          >
            Lock now
          </button>
        )}
      </div>
      {status && <p role="status" className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{status}</p>}
    </Card>
  );
}
