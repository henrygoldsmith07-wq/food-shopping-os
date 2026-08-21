import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { kindBy, REMINDER_KINDS, REPEATS, DEFAULT_TEXT, MAX_TIMES } from '../data/reminders.js';
import { cleanTimes, daysFor, minutesOf } from '../lib/reminders.js';
import { Card, Chip } from './ui.jsx';
import { Glyph } from './icons.jsx';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const repeatOf = (days = []) => {
  const match = REPEATS.find((r) => r.key !== 'custom'
    && r.days.length === days.length && r.days.every((d) => days.includes(d)));
  return match?.key || 'custom';
};

/**
 * Making or editing one reminder: what it's about, what it says, when it goes
 * off. It won't save a reminder with no times or no days, because that would be
 * a reminder that quietly never happens.
 */
export default function ReminderForm({ editing, onDone }) {
  const app = useApp();
  const [kind, setKind] = useState(editing?.kind || 'meal');
  const [label, setLabel] = useState(editing?.label || '');
  const [times, setTimes] = useState(editing?.times || kindBy[editing?.kind || 'meal'].times);
  const [repeat, setRepeat] = useState(repeatOf(editing?.days || [0, 1, 2, 3, 4, 5, 6]));
  const [custom, setCustom] = useState(editing?.days || []);
  const [draft, setDraft] = useState('');

  const days = daysFor(repeat, custom);
  const ready = cleanTimes(times).length > 0 && days.length > 0;

  const pickKind = (key) => {
    setKind(key);
    if (!editing) setTimes(kindBy[key].times);
  };

  const addTime = () => {
    if (minutesOf(draft) === null || times.length >= MAX_TIMES) return;
    setTimes((list) => cleanTimes([...list, draft]));
    setDraft('');
  };

  const save = () => {
    const payload = { kind, label: label.trim() || DEFAULT_TEXT[kind], times, days, on: true };
    if (editing) app.updateReminder(editing.id, payload);
    else app.addReminder(payload);
    onDone?.();
  };

  return (
    <div className="space-y-4">
      {!editing && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What is it about?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REMINDER_KINDS.map((k) => (
              <Chip key={k.key} active={kind === k.key} onClick={() => pickKind(k.key)}>
                <span className="inline-flex items-center gap-1.5"><Glyph e={k.emoji} size={12} /> {k.label}</span>
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{kindBy[kind].blurb}.</p>
        </Card>
      )}

      <Card className="space-y-3">
        <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What should it say?</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={DEFAULT_TEXT[kind]}
            aria-label="Reminder text"
            maxLength={60}
            className="mt-1 w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </label>
        {kindBy[kind].reads && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            It arrives with your own figure attached — right now that would read:
            {' '}“{app.reminderLine(kind) || 'nothing yet, there’s no data behind it'}”
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>At what times?</p>
        <div className="flex flex-wrap gap-2">
          {cleanTimes(times).map((t) => (
            <button
              key={t}
              onClick={() => setTimes((list) => list.filter((x) => x !== t))}
              aria-label={`Remove ${t}`}
              className="press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8125rem] font-bold"
              style={{ borderColor: 'var(--line)' }}
            >
              {t} <X size={12} style={{ color: 'var(--faint)' }} />
            </button>
          ))}
          {!cleanTimes(times).length && (
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>No times yet — add at least one.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="time"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="New time"
            className="flex-1 rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <button
            onClick={addTime}
            disabled={minutesOf(draft) === null || times.length >= MAX_TIMES}
            className="press rounded-2xl border px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Add</span>
          </button>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>On which days?</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {REPEATS.map((r) => (
            <Chip key={r.key} active={repeat === r.key} onClick={() => setRepeat(r.key)}>{r.label}</Chip>
          ))}
        </div>
        {repeat === 'custom' && (
          <div className="flex gap-1.5">
            {WEEK.map((name, i) => (
              <Chip
                key={name}
                active={custom.includes(i)}
                onClick={() => setCustom((list) => (list.includes(i) ? list.filter((d) => d !== i) : [...list, i]))}
              >
                {name}
              </Chip>
            ))}
          </div>
        )}
      </Card>

      <button
        onClick={save}
        disabled={!ready}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Check size={15} strokeWidth={3} /> {editing ? 'Save changes' : 'Add reminder'}
        </span>
      </button>
      {!ready && (
        <p className="text-center text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          A reminder needs at least one time and one day, or it would never go off.
        </p>
      )}
    </div>
  );
}
