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
  const [mode, setMode] = useState(null); // null | 'signin' | 'create' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);

  useEffect(() => {
    setError(urlError());
    // Back from the confirmation link in the email.
    try {
      const verified = new URLSearchParams(window.location.search).get('verified');
      if (verified === '1') { setNotice('Email confirmed — sign in below.'); setMode('signin'); }
      if (verified === '0') setError('That confirmation link has expired or was already used. Sign in to get a new one.');
    } catch {
      // No URL to read is the same as no link followed.
    }
  }, []);

  const post = async (url, body, method = 'POST') => {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'That did not work. Try again.');
    return data;
  };

  const resend = async () => {
    setError('');
    try {
      await post('/api/account/verify', { email });
      setNotice(`Sent — check ${email} for the confirmation link.`);
    } catch (caught) {
      setError(caught.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        await post('/api/account/password-reset', { email });
        setNotice('If an account uses that address, a reset link is on its way. It works for an hour.');
        setBusy(false);
        return;
      }
      if (mode === 'create') {
        const created = await post('/api/account/register', { email, password });
        if (created.verify) {
          // The password signs in once the address is confirmed.
          setNeedsVerify(true);
          setMode('signin');
          setNotice(created.sent
            ? `We've emailed a confirmation link to ${email}. Open it, then sign in here.`
            : 'Account created, but the confirmation email did not send. Tap “Resend the link”.');
          setBusy(false);
          return;
        }
      }
      const result = await signIn('password', { email, password, redirect: false });
      if (result?.error === 'unverified') {
        setNeedsVerify(true);
        throw new Error('Confirm your email first — we sent a link when you signed up.');
      }
      if (!result || result.error) {
        throw new Error(mode === 'create' ? 'Account created, but signing in failed — try signing in.' : 'That email and password do not match.');
      }
      window.location.assign(callbackUrl);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };

  const title = { create: 'Create an account', forgot: 'Reset your password', signin: 'Sign in with email' }[mode];
  const action = { create: 'Create account', forgot: 'Email me a reset link', signin: 'Sign in' }[mode];

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
          <p className="text-[0.8125rem] font-extrabold">{title}</p>
          <label className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} style={fieldStyle} />
          </label>
          {mode !== 'forgot' && (
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
          )}
          {mode === 'create' && (
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              At least 8 characters.{providers.emailVerification ? ' We’ll email you a link to confirm the address.' : ''}
            </p>
          )}
          <button type="submit" disabled={busy} className="press rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {busy ? 'One moment…' : action}
          </button>
          {needsVerify && providers.emailVerification && email && (
            <button type="button" onClick={resend} className="text-[0.75rem] font-bold underline" style={{ color: 'var(--accent)' }}>Resend the link</button>
          )}
          {mode === 'signin' && providers.emailVerification && (
            <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} className="text-[0.75rem] font-bold underline" style={{ color: 'var(--muted)' }}>Forgot your password?</button>
          )}
          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'create' : 'signin'); setError(''); setNotice(''); }} className="text-[0.75rem] font-bold underline" style={{ color: 'var(--muted)' }}>
            {mode === 'signin' ? 'New here? Create an account' : mode === 'forgot' ? 'Back to sign in' : 'I already have an account'}
          </button>
        </form>
      )}
      {notice && <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--good)' }}>{notice}</p>}
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
