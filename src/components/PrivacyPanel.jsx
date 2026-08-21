import { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Database, HardDrive, Send, ShieldCheck, Trash2,
} from 'lucide-react';
import { PRIVACY_DISCLOSURE } from '../data/privacy.js';
import { useOptionalApp } from '../lib/store.jsx';
import { YOUTH_COPY, YOUTH_SIGNPOST } from '../lib/youth.js';
import { forgetCloudHousehold, selectedCloudHouseholdId } from '../lib/cloud.js';
import { Card } from './ui.jsx';
import HealthVaultPanel from './HealthVaultPanel.jsx';
import {
  clearProductEvents, readAnalyticsConsent, setAnalyticsConsent,
} from '../lib/product-analytics.js';
import { readForqPulseOptIn, setForqPulseOptIn } from '../lib/pulse-opt-in.js';

const ICONS = {
  device: HardDrive,
  server: Database,
  transmitted: Send,
};

const defaultRequest = (...args) => fetch(...args);
const readJson = async (response) => response.json().catch(() => ({}));

export default function PrivacyPanel({
  request = defaultRequest,
  signOutUser = signOut,
} = {}) {
  // This panel is also rendered on its own in tests, so a missing provider
  // means "no under-18 mode" rather than a crash.
  const app = useOptionalApp();
  const youth = app?.youth || { on: false, separateConsent: false, consentGiven: false };
  const [backend, setBackend] = useState(null);
  const [households, setHouseholds] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState('');
  const [analyticsConsent, setAnalyticsConsentState] = useState(() => readAnalyticsConsent());
  const [pulseShared, setPulseShared] = useState(() => readForqPulseOptIn());
  const selectedId = selectedCloudHouseholdId();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const statusResponse = await request('/api/backend/status', { credentials: 'same-origin' });
        const nextBackend = await readJson(statusResponse);
        if (cancelled) return;
        setBackend(nextBackend);
        if (!nextBackend.authenticated) return;
        const householdResponse = await request('/api/households', { credentials: 'same-origin' });
        const items = await readJson(householdResponse);
        if (!cancelled) setHouseholds(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) setBackend({ enabled: false, authenticated: false });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [request]);

  const target = useMemo(
    () => households.find((household) => household.id === selectedId)
      || households.find((household) => household.personal)
      || null,
    [households, selectedId],
  );
  const canDelete = backend?.authenticated && target?.role === 'owner';

  const deleteServerCopy = async () => {
    if (!canDelete || !confirming || deleting) return;
    setDeleting(true);
    setStatus('');
    try {
      const response = await request('/api/households', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-forq-household-id': target.id,
        },
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error || 'The server copy could not be deleted.');
      forgetCloudHousehold();
      clearProductEvents();
      setHouseholds((items) => items.filter((household) => household.id !== target.id));
      setConfirming(false);
      setStatus('Server household deleted. The copy in this browser remains.');
      try {
        await signOutUser({ redirect: false });
      } catch {
        setStatus('Server household deleted. Sign out before making more changes; the copy in this browser remains.');
      }
    } catch (error) {
      setStatus(error.message || 'The server copy could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card className="space-y-2">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-extrabold text-[0.9375rem]">Local-first, with optional services</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              No account is required. Signing in copies the selected household to Forq’s server so it can sync.
              Health entries are part of that household copy.
            </p>
          </div>
        </div>
      </Card>

      <HealthVaultPanel />

      {/* The under-18 consent flow: a separate question, with a separate
          answer stored, and the choices it makes on the user's behalf named. */}
      {youth.on && (
        <Card className="space-y-3">
          <div>
            <p className="font-extrabold text-[0.90625rem]">Under-18 privacy</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {YOUTH_COPY.consent}
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            <li>Product insights are off and cannot be turned on.</li>
            <li>Coach and trainer links never include health records.</li>
            <li>{YOUTH_COPY.sharing}</li>
          </ul>
          <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[0.78125rem] font-bold">
              {youth.consentGiven ? `Accepted ${app.youthConsent.acceptedAt}` : 'Not yet accepted'}
            </p>
            <button
              type="button"
              onClick={() => app.setYouthConsent(youth.consentGiven ? null : {})}
              className="press rounded-2xl border px-3 py-2 text-[0.75rem] font-extrabold"
              style={{ borderColor: youth.consentGiven ? 'var(--line)' : 'var(--accent)', color: youth.consentGiven ? 'var(--muted)' : 'var(--accent)' }}
            >
              {youth.consentGiven ? 'Withdraw' : 'Accept'}
            </button>
          </div>
          <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{YOUTH_SIGNPOST}</p>
        </Card>
      )}

      {!youth.separateConsent && (
      <>
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-extrabold text-[0.90625rem]">Help improve Forq</p>
            <p className="mt-1 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              Optional product insights count screens and completed planning, shopping and cooking steps.
              They never include food names, health values, recipe text or prices, and stay on this device until you sign in.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={analyticsConsent}
            aria-label="Share anonymous product insights"
            onClick={() => {
              const next = !analyticsConsent;
              setAnalyticsConsent(next);
              setAnalyticsConsentState(next);
            }}
            className="press shrink-0 rounded-full border px-3 py-2 text-[0.75rem] font-extrabold"
            style={{
              borderColor: analyticsConsent ? 'var(--accent)' : 'var(--line)',
              background: analyticsConsent ? 'var(--accent-soft)' : 'var(--card)',
              color: analyticsConsent ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {analyticsConsent ? 'On' : 'Off'}
          </button>
        </div>
        {analyticsConsent && (
          <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            When signed in, Forq uploads daily counts to your household record so the product team can see which journeys work.
            Turning this off clears the pending queue.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-extrabold text-[0.90625rem]">Share with Pulse</p>
            <p className="mt-1 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              Pulse, the personal evidence engine in this ecosystem, can read your planning, cooking and shopping
              history when both apps are served from one origin. Nothing leaves this device; the switch just decides
              whether Pulse may look at what is already here.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pulseShared}
            aria-label="Share with Pulse"
            onClick={() => {
              const next = !pulseShared;
              setForqPulseOptIn(next);
              setPulseShared(next);
            }}
            className="press shrink-0 rounded-full border px-3 py-2 text-[0.75rem] font-extrabold"
            style={{
              borderColor: pulseShared ? 'var(--accent)' : 'var(--line)',
              background: pulseShared ? 'var(--accent-soft)' : 'var(--card)',
              color: pulseShared ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {pulseShared ? 'On' : 'Off'}
          </button>
        </div>
        {pulseShared && (
          <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Off by default. Turning it off refuses Pulse immediately — its connector checks this flag before reading
            anything, and your Forq data is never deleted or moved.
          </p>
        )}
      </Card>
      </>
      )}

      {PRIVACY_DISCLOSURE.map((section) => {
        const Icon = ICONS[section.id];
        return (
          <Card key={section.id}>
            <div className="flex items-center gap-2">
              <Icon size={17} />
              <h3 className="font-extrabold text-[0.90625rem]">{section.title}</h3>
            </div>
            <p className="mt-2 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {section.summary}
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Card>
        );
      })}

      <Card className="space-y-3" style={{ borderColor: confirming ? 'var(--danger)' : 'var(--line)' }}>
        <div>
          <p className="font-extrabold text-[0.90625rem]">Delete the server household</p>
          <p className="mt-1 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            This permanently deletes the synced household, member access, invitations, coach links, audit events, queued reminders and uploaded receipts.
            It does not erase this browser’s local copy or your sign-in-provider account.
          </p>
        </div>

        {target && (
          <p className="text-[0.75rem] font-bold">
            Selected: {target.name} · {target.role}
          </p>
        )}

        {!backend?.authenticated && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Sign in under Account &amp; sync before deleting a server household.
          </p>
        )}
        {backend?.authenticated && target && target.role !== 'owner' && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Only the household owner can delete data shared with every member.
          </p>
        )}

        {confirming && canDelete && (
          <p className="text-[0.75rem] font-bold" style={{ color: 'var(--danger)' }}>
            This cannot be undone for any household member. Your local copy stays here; signing in again can create a new server copy.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="press rounded-2xl border px-3 py-3 text-[0.8125rem] font-extrabold disabled:opacity-50"
              style={{ borderColor: 'var(--line)' }}
            >
              Keep server copy
            </button>
          )}
          <button
            type="button"
            onClick={() => (confirming ? deleteServerCopy() : setConfirming(true))}
            disabled={!canDelete || deleting}
            className={`press rounded-2xl border px-3 py-3 text-[0.8125rem] font-extrabold disabled:opacity-50 ${confirming ? '' : 'col-span-2'}`}
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Trash2 size={15} />
              {deleting ? 'Deleting…' : confirming ? 'Delete permanently' : 'Delete server household'}
            </span>
          </button>
        </div>

        {status && (
          <p role="status" className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {status}
          </p>
        )}
      </Card>
    </div>
  );
}
