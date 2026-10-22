'use client';

import { accountErrorMessage } from '../../lib/account-error.js';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Where the password-reset email lands: the link carries the address and a
 * one-time token; this page only asks for the new password.
 */
export default function ResetPasswordPage() {
  const [link, setLink] = useState({ email: '', token: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLink({ email: params.get('email') || '', token: params.get('token') || '' });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/password-reset', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...link, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The password could not be changed.');
      setDone(true);
    } catch (caught) {
      setError(accountErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 w-full rounded-2xl border px-4 py-3 text-[0.9375rem] font-semibold outline-none';
  const fieldStyle = { background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' };

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-12" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <p className="text-[0.6875rem] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>Forq</p>
      <h1 className="mt-3 text-[1.75rem] font-extrabold tracking-tight">Choose a new password</h1>
      {done ? (
        <div className="mt-4 space-y-4">
          <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Password changed. Sign in with it from Settings → Account &amp; sync.
          </p>
          <Link href="/" className="press inline-flex rounded-2xl px-5 py-3 text-[0.875rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>Open Forq</Link>
        </div>
      ) : !link.token || !link.email ? (
        <p className="mt-4 text-[0.9375rem] font-semibold" style={{ color: 'var(--muted)' }}>
          This page needs the link from your reset email. Ask for a new one from “Forgot your password?” on the sign-in form.
        </p>
      ) : (
        <form onSubmit={submit} aria-describedby={error ? 'reset-error' : undefined} className="mt-4 grid gap-3">
          <p className="text-[0.875rem] font-semibold" style={{ color: 'var(--muted)' }}>For {link.email}</p>
          <label className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            New password
            <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={field} style={fieldStyle} />
          </label>
          <label className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Type it again
            <input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} style={fieldStyle} />
          </label>
          <button type="submit" disabled={busy} className="press rounded-2xl px-4 py-3 text-[0.875rem] font-extrabold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {busy ? 'One moment…' : 'Change password'}
          </button>
          {error && <p id="reset-error" role="alert" className="text-[0.8125rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
