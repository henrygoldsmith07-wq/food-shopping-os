import { useState } from 'react';
import { Copy, Mail, UserPlus } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { createHouseholdInvitation, acceptHouseholdInvitation } from '../lib/cloud.js';
import { Card, Chip } from './ui.jsx';

const PERMISSIONS = [
  { id: 'shopping', label: 'Shopping' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'health', label: 'Health' },
];

/**
 * Inviting someone into the household, and joining one.
 *
 * The server already issued and accepted invitation tokens; this is the front
 * door. Create posts an email, a role and exactly the areas the invitee may
 * touch — the token comes back once and is shown once, because the server
 * keeps only its hash. Accept checks the token against the signed-in account's
 * email, so the person accepting must be the person invited.
 *
 * Both halves live behind sign-in; without a backend the card explains what
 * would be here rather than showing buttons that cannot work.
 */
export default function HouseholdInvites() {
  const app = useApp();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('adult');
  const [permissions, setPermissions] = useState(['shopping', 'pantry']);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');

  const validEmail = /.+@.+\..+/.test(email.trim());
  // Cloud status kinds that imply an authenticated session on the backend;
  // 'signed-out', 'disabled' and 'checking' mean invitations cannot work yet.
  const signedIn = !['signed-out', 'disabled', 'checking', undefined].includes(app.cloudStatus?.kind);

  const togglePermission = (id) => setPermissions((current) => (
    current.includes(id) ? current.filter((p) => p !== id) : [...current, id]
  ));

  const send = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await createHouseholdInvitation({ email: email.trim(), role, permissions });
      setIssued(result);
      setEmail('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setMessage('');
    try {
      await acceptHouseholdInvitation(token.trim());
      setMessage('Joined the household — syncing now points at it.');
      setToken('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage('Copy failed — select the token text manually.');
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-extrabold text-[0.875rem] inline-flex items-center gap-2"><UserPlus size={15} /> Invite someone</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          They accept with the same email they sign in with. You choose exactly what they can touch.
        </p>
      </div>

      {signedIn ? (
        <>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="their@email.com"
            aria-label="Invitee email"
            type="email"
            className="w-full rounded-xl border px-3 py-2.5 text-[0.8125rem] font-semibold outline-none"
            style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <div className="flex gap-2">
            <Chip active={role === 'adult'} onClick={() => setRole('adult')}>Adult</Chip>
            <Chip active={role === 'child'} onClick={() => setRole('child')}>Child</Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERMISSIONS.map((permission) => (
              <Chip
                key={permission.id}
                active={permissions.includes(permission.id)}
                onClick={() => togglePermission(permission.id)}
              >
                {permission.label}
              </Chip>
            ))}
          </div>
          <button
            onClick={send}
            disabled={busy || !validEmail || !permissions.length}
            className="press w-full rounded-xl py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center justify-center gap-2"><Mail size={14} /> Create invitation</span>
          </button>

          {issued && (
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--accent)' }}>
              <p className="text-[0.75rem] font-bold">Their link token — shown once:</p>
              <textarea
                readOnly
                value={issued.token}
                aria-label="Invitation token"
                rows={2}
                className="mt-1.5 w-full rounded-lg border p-2 text-[0.6875rem] font-semibold outline-none"
                style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--muted)' }}
              />
              <button onClick={copyToken} className="press mt-1.5 w-full rounded-lg border py-2 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
                <span className="inline-flex items-center justify-center gap-1.5"><Copy size={12} /> {copied ? 'Copied' : 'Copy token'}</span>
              </button>
              <p className="mt-1.5 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
                Expires in {issued.expiresInHours || 168} hours. The server stores only a hash, so this is the only copy.
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Sign in to invite someone — invitations travel through your household's private server record, so both accounts need to exist.
        </p>
      )}

      <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[0.8125rem] font-extrabold">Got a token?</p>
        <textarea
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste the invitation token here"
          aria-label="Invitation token to accept"
          rows={2}
          className="mt-1.5 w-full rounded-xl border p-2 text-[0.6875rem] font-semibold outline-none"
          style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={join}
          disabled={busy || token.trim().length < 32}
          className="press mt-1.5 w-full rounded-xl py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Join household
        </button>
      </div>

      {message && <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--warn)' }}>{message}</p>}
    </Card>
  );
}
