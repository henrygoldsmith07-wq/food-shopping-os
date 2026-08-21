import { useEffect, useState } from 'react';
import {
  Bell, BellOff, BellRing, CalendarArrowDown, Check, ChevronLeft, Info, Pencil, Plus, Sparkles, Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { kindBy, NOTIFY_TRUTH, SNOOZE_MINUTES } from '../data/reminders.js';
import { nextLabel, scheduleLabel } from '../lib/reminders.js';
import { icsFor, notificationPresets, suggestedReminders } from '../lib/reminder-suggest.js';
import { askPermission, downloadFile, notifySupport, showNotification } from '../lib/notify.js';
import { Card, Chip, Pill, Toggle } from './ui.jsx';
import { Glyph } from './icons.jsx';
import ReminderForm from './ReminderForm.jsx';

/* ---------- What the browser will actually do ---------- */

function PermissionCard() {
  const [support, setSupport] = useState(notifySupport);

  const ask = async () => {
    await askPermission();
    setSupport(notifySupport());
  };

  const granted = support.permission === 'granted';
  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5">
          {granted ? <Bell size={15} /> : <BellOff size={15} style={{ color: 'var(--muted)' }} />}
          Notifications
        </p>
        <Pill tone={granted ? 'good' : 'muted'}>
          {granted ? 'On' : support.permission === 'denied' ? 'Blocked' : support.supported ? 'Not asked' : 'Unsupported'}
        </Pill>
      </div>
      {support.reason && (
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{support.reason}</p>
      )}
      {support.supported && support.permission === 'default' && (
        <button
          onClick={ask}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Allow notifications
        </button>
      )}
      <div className="rounded-2xl p-3 space-y-1.5" style={{ background: 'var(--card-2)' }}>
        <p className="text-[0.78125rem] font-semibold">{NOTIFY_TRUTH.open}</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{NOTIFY_TRUTH.closed}</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{NOTIFY_TRUTH.caughtUp}</p>
      </div>
    </Card>
  );
}

/* ---------- The one path that works with the app shut ---------- */

function CalendarCard() {
  const app = useApp();
  const [done, setDone] = useState(null);
  const { text, events } = icsFor(app.reminders, { from: app.day });

  const send = () => {
    const ok = downloadFile('forq-reminders.ics', text);
    setDone(ok ? `${events} alarm${events === 1 ? '' : 's'} sent to your calendar file.` : 'This browser wouldn’t take the file. Nothing was saved.');
  };

  return (
    <Card className="space-y-2.5">
      <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><CalendarArrowDown size={15} /> Send to your calendar</p>
      <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{NOTIFY_TRUTH.calendar}</p>
      <button
        onClick={send}
        disabled={!events}
        className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
        style={{ borderColor: 'var(--line)' }}
      >
        {events ? `Download ${events} repeating alarm${events === 1 ? '' : 's'}` : 'Nothing switched on to send'}
      </button>
      {done && <p className="text-[0.78125rem] font-semibold">{done}</p>}
    </Card>
  );
}

/* ---------- Reminders the app would set up for you ---------- */

function SuggestionsCard() {
  const app = useApp();
  const suggestions = suggestedReminders(app)
    .filter((s) => !app.reminders.some((r) => r.kind === s.kind && r.times.join() === s.times.join()));
  if (!suggestions.length) return null;

  return (
    <Card className="space-y-2.5">
      <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Sparkles size={15} /> From your own records</p>
      {suggestions.map((s) => (
        <div key={s.key} className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
          <p className="text-[0.84375rem] font-bold inline-flex items-center gap-1.5">
            <Glyph e={s.emoji} size={13} /> {s.label} · {s.times.join(', ')}
          </p>
          <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{s.why}</p>
        </div>
      ))}
      <button
        onClick={() => app.addSuggestedReminders(suggestions)}
        className="press w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {suggestions.length === 1 ? 'Set it up' : `Set up all ${suggestions.length}`}
      </button>
    </Card>
  );
}

function NotificationPresetsCard() {
  const app = useApp();
  const presets = notificationPresets(app.reminders, app.productMode);
  if (!presets.length) return null;

  return (
    <Card className="space-y-2.5">
      <div>
        <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5">
          <BellRing size={15} /> Notification presets
        </p>
        <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Suggested schedules only. Add them, then change any time or day.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.key}
            onClick={() => app.addSuggestedReminders([preset])}
            className="press rounded-2xl p-3 text-left"
            style={{ background: 'var(--card-2)' }}
          >
            <span className="text-[0.8125rem] font-extrabold inline-flex items-center gap-1.5">
              <Glyph e={preset.emoji} size={13} /> {kindBy[preset.kind].label}
            </span>
            <span className="mt-0.5 block text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {scheduleLabel(preset)}
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={() => app.addSuggestedReminders(presets)}
        className="press w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {presets.length === 1 ? 'Set it up' : `Set up all ${presets.length}`}
      </button>
    </Card>
  );
}

/* ---------- Due now ---------- */

export function DueList({ compact = false }) {
  const app = useApp();
  const due = app.remindersDue;
  if (!due.length) return null;

  return (
    <Card className="space-y-2.5">
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        Due now
      </p>
      {due.map(({ reminder, stamp, time, lateBy }) => (
        <div key={`${reminder.id}-${time}`} className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-extrabold inline-flex items-center gap-1.5">
                <Glyph e={kindBy[reminder.kind]?.emoji || '🔔'} size={14} /> {reminder.label}
              </p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {time}{lateBy >= 5 ? ` · ${lateBy} min ago` : ''}
                {app.reminderLine(reminder.kind) ? ` · ${app.reminderLine(reminder.kind)}` : ''}
              </p>
            </div>
            <button
              onClick={() => app.completeReminder(reminder.id, stamp, time)}
              aria-label={`Done: ${reminder.label} at ${time}`}
              className="press shrink-0 rounded-full p-2"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              <Check size={14} strokeWidth={3} />
            </button>
          </div>
          {!compact && (
            <div className="mt-2 flex gap-1.5">
              {SNOOZE_MINUTES.map((m) => (
                <Chip key={m} onClick={() => app.snoozeReminder(reminder.id, m)}>{m} min</Chip>
              ))}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

/* ---------- What you missed while it was shut ---------- */

function MissedCard() {
  const app = useApp();
  const missed = app.remindersMissed;
  if (!missed.length) return null;
  const shown = missed.slice(-5).reverse();

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          While Forq was closed
        </p>
        <button onClick={app.markRemindersSeen} className="press text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}>
          Clear
        </button>
      </div>
      {shown.map((m) => (
        <p key={`${m.reminder.id}-${m.stamp}-${m.time}`} className="text-[0.8125rem] font-semibold">
          <span className="font-extrabold">{m.time}</span> · {m.reminder.label}
          <span style={{ color: 'var(--faint)' }}> · {m.stamp === app.day ? 'today' : m.stamp}</span>
        </p>
      ))}
      {missed.length > shown.length && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          and {missed.length - shown.length} more.
        </p>
      )}
      <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
        <Info size={13} className="mt-0.5 shrink-0" /> {NOTIFY_TRUTH.closed}
      </p>
    </Card>
  );
}

/* ---------- The page ---------- */

/**
 * Reminders: yours to set, honest about when they can reach you.
 *
 * While this is open, a due reminder becomes a real notification. While it is
 * closed nothing here can fire — so the page says so, catches you up when you
 * return, and offers the calendar export for alarms that must work regardless.
 */
export default function RemindersPanel() {
  const app = useApp();
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const due = app.remindersDue;

  // One notification per firing, while the app is open — the only moment a web
  // app is allowed to interrupt you.
  useEffect(() => {
    for (const { reminder, stamp, time } of due) {
      showNotification(reminder.label, {
        body: app.reminderLine(reminder.kind) || undefined,
        tag: `${stamp}|${reminder.id}|${time}`,
      });
    }
  }, [due, app]);

  if (adding || editing) {
    return (
      <div className="px-5 pb-10 space-y-4">
        <button
          onClick={() => { setAdding(false); setEditing(null); }}
          className="press inline-flex items-center gap-1 text-[0.8125rem] font-extrabold"
          style={{ color: 'var(--muted)' }}
        >
          <ChevronLeft size={15} /> Back
        </button>
        <ReminderForm editing={editing} onDone={() => { setAdding(false); setEditing(null); }} />
      </div>
    );
  }

  return (
    <div className="px-5 pb-10 space-y-4">
      <MissedCard />
      <DueList />

      {app.reminders.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            No reminders. Forq won’t invent a routine for you — add the ones you want, or take one
            of the suggestions below if your records support it.
          </p>
        </Card>
      ) : (
        <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
          {app.reminders.map((reminder) => (
            <div key={reminder.id} className="flex items-center gap-3 p-3">
              <Glyph e={kindBy[reminder.kind]?.emoji || '🔔'} size={18} style={{ color: 'var(--muted)' }} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[0.84375rem] truncate">{reminder.label}</p>
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {scheduleLabel(reminder)} · {nextLabel(reminder, app.now)}
                </p>
              </div>
              <button onClick={() => setEditing(reminder)} aria-label={`Edit ${reminder.label}`} className="press p-1" style={{ color: 'var(--faint)' }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => app.removeReminder(reminder.id)} aria-label={`Delete ${reminder.label}`} className="press p-1" style={{ color: 'var(--faint)' }}>
                <Trash2 size={14} />
              </button>
              <Toggle label={`${reminder.label} reminder`} on={reminder.on} onChange={() => app.toggleReminder(reminder.id)} />
            </div>
          ))}
        </Card>
      )}

      <button
        onClick={() => setAdding(true)}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-1.5"><Plus size={15} /> New reminder</span>
      </button>

      <NotificationPresetsCard />
      <SuggestionsCard />
      <PermissionCard />
      <CalendarCard />
    </div>
  );
}
