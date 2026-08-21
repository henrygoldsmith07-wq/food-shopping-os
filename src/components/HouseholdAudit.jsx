import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { listHouseholdAudit } from '../lib/cloud.js';
import { Card } from './ui.jsx';

const actionLabel = (event) => {
  if (event.action === 'household.sync') {
    return `changed ${event.fields?.length ? event.fields.join(', ') : 'household data'}`;
  }
  if (event.action === 'coach-share.created') return 'created coach access';
  if (event.action === 'coach-share.revoked') return 'revoked coach access';
  if (event.action === 'coach-share.viewed') return 'opened the coach dashboard';
  if (event.action === 'invitation.created') return 'created a household invitation';
  if (event.action === 'invitation.accepted') return 'accepted a household invitation';
  return event.action;
};

export default function HouseholdAudit() {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState('Loading server activity…');

  useEffect(() => {
    listHouseholdAudit()
      .then((rows) => {
        setEvents(rows);
        setMessage(rows.length ? '' : 'No synced household changes yet.');
      })
      .catch((error) => setMessage(error.message));
  }, []);

  return (
    <div className="space-y-3">
      <Card>
        <p className="inline-flex items-center gap-2 font-extrabold text-[0.875rem]"><History size={15} /> Server audit trail</p>
        <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Read-only record of who changed which area. Sensitive values are never copied into the audit log.
        </p>
      </Card>
      {events.map((event) => (
        <Card key={event.id} className="!p-3">
          <p className="text-[0.8125rem] font-bold">{event.actorName} {actionLabel(event)}</p>
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            {new Date(event.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            {event.version ? ` · version ${event.version}` : ''}
          </p>
        </Card>
      ))}
      {message && <p className="px-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{message}</p>}
    </div>
  );
}
