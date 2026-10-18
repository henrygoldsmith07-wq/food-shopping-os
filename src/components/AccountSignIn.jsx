import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { LogIn, Mail } from 'lucide-react';

/** What a sign-in error in the URL (from Auth.js's redirect back) means. */
const URL_ERRORS = {
  OAuthAccountNotLinked: 'This email already has a password account — sign in with your email and password instead.',
  AccessDenied: 'Sign-in was cancelled.',
  Callback: 'Sign-in did not finish. Try again.',
  OAuthCallback: 'Sign-in did not finish. Try again.',
};

const urlError = () => {
  try {
    const code = new URLSearchParams(window.location.search).get('error');
    return code ? URL_ERRORS[code] || 'Sign-in did not work. Try again.' : '';
  } catch {
    return '';
  }
};

const field = 'mt-1 w-full rounded-2xl border px-4 py-3 text-[0.9375rem] font-semibold outline-none';
const fieldStyle = { background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' };

/**
 * The ways in: Google (when the server has it) and email + password.
 *
 * `providers` is the backend status's provider map. A successful sign-in
 * reloads the page so cloud sync starts from the new session: a returning
 * person's household loads in, and a new one's on-device data is kept.
 */
export function SignInOptions({ providers = {}, callbackUrl = '/' }) {
  const [mode, setMode] = useState(null); // null | 'signin' | 'create'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setError(urlError()); }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'create') {
        const response = await fetch('/api/account/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'The account could not be created.');
        }
      }
      const result = await signIn('password', { email, password, redirect: false });
      if (!result || result.error) {
        throw new Error(mode === 'create' ? 'Account created, but signing in failed — try signing in.' : 'That email and password do not match.');
      }
      window.location.assign(callbackUrl);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      {providers.google && (
        <button
          type="button"
          className="press rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          onClick={() => signIn('google', { callbackUrl })}
        >
          <span className="inline-flex items-center gap-2"><LogIn size={15} /> Continue with Google</span>
        </button>
      )}
      {providers.password && !mode && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('signin')} className="press rounded-2xl border px-3 py-3 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
            <span className="inline-flex items-center gap-2"><Mail size={15} /> Sign in with email</span>
          </button>
          <button type="button" onClick={() => setMode('create')} className="press rounded-2xl border px-3 py-3 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
            Create an account
          </button>
        </div>
      )}
      {providers.password && mode && (
        <form onSubmit={submit} aria-describedby={error ? 'account-signin-error' : undefined} className="grid gap-2 rounded-2xl border p-3" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.8125rem] font-extrabold">{mode === 'create' ? 'Create an account' : 'Sign in with email'}</p>
          <label className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} style={fieldStyle} />
          </label>
          <label className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Password
            <input
              type="password"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'create' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              style={fieldStyle}
            />
          </label>
          {mode === 'create' && (
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>At least 8 characters.</p>
          )}
          <button type="submit" disabled={busy} className="press rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {busy ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in'}
          </button>
          <button type="button" onClick={() => { setMode(mode === 'create' ? 'signin' : 'create'); setError(''); }} className="text-[0.75rem] font-bold underline" style={{ color: 'var(--muted)' }}>
            {mode === 'create' ? 'I already have an account' : 'New here? Create an account'}
          </button>
        </form>
      )}
      {/* Tied to the form rather than a live region: the app keeps a fixed set of announcers. */}
      {error && <p id="account-signin-error" className="text-[0.75rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}

/**
 * The first screen's account card. Only shown where the server offers
 * accounts; signing in is optional and the copy says what it is for.
 */
export default function OnboardingAccount() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/backend/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (live) setStatus(body); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const providers = status?.providers || {};
  if (!status?.enabled || !(providers.google || providers.password)) return null;

  return (
    <section aria-labelledby="onboarding-account" className="rounded-3xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <h2 id="onboarding-account" className="text-[0.9375rem] font-extrabold">
        {status.authenticated ? `Signed in as ${status.user?.email || status.user?.name}` : 'Sign in to keep your kitchen on every device'}
      </h2>
      <p className="mt-1 mb-3 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {status.authenticated
          ? 'Your plan, list and pantry will sync once setup is done.'
          : 'Already have an account? Your week loads straight in. Or skip this and keep everything on this device.'}
      </p>
      {!status.authenticated && <SignInOptions providers={providers} />}
    </section>
  );
}
