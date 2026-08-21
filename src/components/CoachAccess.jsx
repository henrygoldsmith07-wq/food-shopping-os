import { useEffect, useState } from 'react';
import { Clipboard, Link2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  createCoachShare, listCoachShares, revokeCoachShare,
} from '../lib/cloud.js';
import { useOptionalApp } from '../lib/store.jsx';
import { YOUTH_COPY, youthShareScopes } from '../lib/youth.js';
import { Card, Chip } from './ui.jsx';

const SCOPES = [
  ['diary', 'Food diary'],
  ['nutrition', 'Nutrition'],
  ['plan', 'Meal plan'],
  ['health', 'Health records'],
];

export default function CoachAccess() {
  const app = useOptionalApp();
  const strict = Boolean(app?.youth?.strictSharing);
  // Health records are never in an under-18 coach link, so the scope isn't
  // offered and is stripped again on the way out.
  const offered = strict ? SCOPES.filter(([id]) => youthShareScopes([id]).length) : SCOPES;
  const [label, setLabel] = useState('My coach');
  const [scopes, setScopes] = useState(['diary', 'nutrition', 'plan']);
  const [shares, setShares] = useState([]);
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => listCoachShares()
    .then(setShares)
    .catch((error) => setStatus(error.message));

  useEffect(() => {
    refresh();
  }, []);

  const toggle = (scope) => setScopes((current) => (
    current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
  ));

  const create = async () => {
    setBusy(true);
    setStatus('');
    try {
      const share = await createCoachShare({
        label,
        scopes: strict ? youthShareScopes(scopes) : scopes,
        expiresInDays: 30,
      });
      setLink(`${window.location.origin}/coach/${share.token}`);
      setShares((current) => [share, ...current]);
      setStatus('Read-only link created. It expires in 30 days.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('Coach link copied.');
    } catch {
      setStatus('Copy is unavailable. Select the link manually.');
    }
  };

  const revoke = async (id) => {
    setBusy(true);
    try {
      await revokeCoachShare(id);
      setShares((current) => current.map((share) => (
        share.id === id ? { ...share, revokedAt: new Date().toISOString() } : share
      )));
      setStatus('Coach access revoked.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck size={17} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-extrabold text-[0.875rem]">Coach or trainer access</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Create a read-only, revocable link. Health records stay off unless you select them explicitly.
          </p>
        </div>
      </div>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        aria-label="Coach share label"
        className="w-full rounded-xl border px-3 py-2.5 font-semibold"
        style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}
      />
      <div className="flex flex-wrap gap-2">
        {offered.map(([id, name]) => (
          <Chip key={id} active={scopes.includes(id)} onClick={() => toggle(id)}>{name}</Chip>
        ))}
      </div>
      {strict && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {YOUTH_COPY.sharing}
        </p>
      )}
      {!strict && scopes.includes('health') && (
        <p className="rounded-xl border p-2.5 text-[0.75rem] font-bold" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
          Health includes body measurements, sleep, cycle, exercise, blood results and glucose records.
        </p>
      )}
      <button
        type="button"
        onClick={create}
        disabled={busy || !label.trim() || !scopes.length}
        className="press w-full rounded-xl py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}
      >
        <span className="inline-flex items-center gap-1.5"><Link2 size={14} /> Create 30-day link</span>
      </button>
      {link && (
        <div className="space-y-2">
          <textarea readOnly value={link} rows={2} aria-label="New coach share link" className="w-full rounded-xl border p-2 text-[0.75rem] font-semibold" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }} />
          <button type="button" onClick={copy} className="press w-full rounded-xl border py-2 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
            <span className="inline-flex items-center gap-1.5"><Clipboard size={13} /> Copy link</span>
          </button>
        </div>
      )}
      {shares.filter((share) => !share.revokedAt).map((share) => (
        <div key={share.id} className="flex items-center gap-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--line)' }}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-bold">{share.label}</p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {share.scopes.join(' · ')} · {share.viewCount || 0} views
            </p>
          </div>
          <button type="button" onClick={() => revoke(share.id)} disabled={busy} aria-label={`Revoke ${share.label}`} className="press p-2" style={{ color: 'var(--danger)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {status && <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{status}</p>}
    </Card>
  );
}
