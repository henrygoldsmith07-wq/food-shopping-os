import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { selectedCloudHouseholdId } from '../lib/cloud.js';
import { Card, Toggle } from './ui.jsx';

const headers = () => {
  const householdId = selectedCloudHouseholdId();
  return { 'content-type': 'application/json', ...(householdId ? { 'x-forq-household-id': householdId } : {}) };
};

/**
 * The one reminder that reaches you with Forq closed: a morning email of the
 * day's reminders, plan, list and use-soon food. Only offered where the
 * server can send email and you are signed in; it goes to your address only.
 */
export default function ReminderEmailCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/reminders/digest', { headers: headers() })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (live) setStatus(body && typeof body === 'object' && !Array.isArray(body) ? body : null); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!status?.available || !status.email) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/reminders/digest', { method: 'POST', headers: headers(), body: JSON.stringify({ on: !status.on }) });
      const parsed = await response.json().catch(() => ({}));
      const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      if (!response.ok) throw new Error(body.error || 'That did not save. Try again.');
      setStatus(body);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2">
      <div className="flex items-start gap-3">
        <Mail size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[0.84375rem]">Morning email</p>
          <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Each morning, today’s reminders with their times, what’s planned, what’s on the list and what to use up — sent to {status.email}. The one reminder that reaches you with Forq closed.
          </p>
        </div>
        <Toggle label="Morning reminder email" on={status.on} onChange={toggle} />
      </div>
      {error && <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}
    </Card>
  );
}
