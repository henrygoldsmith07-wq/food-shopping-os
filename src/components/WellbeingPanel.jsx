import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { prettyDate } from '../lib/utils.js';
import { CYCLE_SYMPTOMS, FLOW_LEVELS, SLEEP_QUALITY, STRESS_LEVELS } from '../data/health.js';
import { symptomCounts } from '../lib/health.js';
import { Card, Chip, Meter } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';

/**
 * Rest and cycle: sleep, how the days have felt, and periods.
 *
 * Both pages summarise only what you logged — an average over three nights
 * says "three nights", and a cycle prediction that hasn't got two cycles
 * behind it says that instead of guessing one.
 */

/* ---------- Sleep and stress ---------- */

export function RestView() {
  const app = useApp();
  const [hours, setHours] = useState('');
  const [quality, setQuality] = useState(3);
  const [level, setLevel] = useState(3);
  const [note, setNote] = useState('');
  const sleep = app.sleepSummary;
  const stress = app.stressSummary;

  return (
    <>
      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Last night</p>
        <NumberField label="Hours slept" value={hours} onChange={setHours} suffix="h" step={0.5} />
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {SLEEP_QUALITY.map((q) => (
            <Chip key={q.value} active={quality === q.value} onClick={() => setQuality(q.value)}>{q.label}</Chip>
          ))}
        </div>
        <button
          onClick={() => { app.logSleep({ hours, quality }); setHours(''); }}
          disabled={!Number(hours)}
          className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Log sleep
        </button>
      </Card>

      {sleep.nights > 0 && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Last {sleep.nights} night{sleep.nights === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-[1.375rem] font-extrabold">{sleep.avgHours} h <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>average</span></p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {sleep.shortest}–{sleep.longest} h · {sleep.under7} night{sleep.under7 === 1 ? '' : 's'} under seven
            {sleep.avgQuality ? ` · quality ${sleep.avgQuality}/5` : ''}
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Today’s stress</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {STRESS_LEVELS.map((s) => (
            <Chip key={s.value} active={level === s.value} onClick={() => setLevel(s.value)}>{s.label}</Chip>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What’s going on? (optional)"
          aria-label="Stress note"
          className="w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={() => { app.logStress({ level, note }); setNote(''); }}
          className="press w-full rounded-2xl border py-3 text-[0.875rem] font-extrabold"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Log how today felt
        </button>
      </Card>

      {stress.days > 0 && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Stress · {stress.days} day{stress.days === 1 ? '' : 's'} logged
          </p>
          <p className="mt-0.5 text-[1.125rem] font-extrabold">{stress.avg}/5 average</p>
          <div className="mt-2"><Meter value={stress.avg} max={5} color={stress.avg >= 4 ? 'var(--warn)' : 'var(--accent)'} /></div>
          {stress.high > 0 && (
            <p className="mt-1.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {stress.high} day{stress.high === 1 ? '' : 's'} at four or five.
            </p>
          )}
          {stress.notes.map((n) => (
            <p key={n.id} className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {prettyDate(n.date)}: {n.note}
            </p>
          ))}
        </Card>
      )}
    </>
  );
}

/* ---------- Cycle ---------- */

export function CycleView() {
  const app = useApp();
  const [start, setStart] = useState(app.day);
  const [flow, setFlow] = useState(null);
  const [symptoms, setSymptoms] = useState([]);
  const cycle = app.cycle;
  const counts = symptomCounts(app.cycles);

  const toggle = (s) => setSymptoms((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));

  return (
    <>
      <Card>
        {cycle.logged === 0 ? (
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{cycle.reason}</p>
        ) : (
          <>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Day of cycle</p>
            <p className="text-[1.5rem] font-extrabold">{cycle.dayOfCycle}</p>
            {cycle.ready ? (
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Average {cycle.avgLength} days from {cycle.basis} (range {cycle.shortest}–{cycle.longest}).
                Next one estimated {prettyDate(cycle.next)}, {cycle.daysUntilNext >= 0 ? `in ${cycle.daysUntilNext} days` : `${Math.abs(cycle.daysUntilNext)} days ago`}.
              </p>
            ) : (
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{cycle.reason}</p>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Log a period</p>
        <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Started</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="Period start"
            className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FLOW_LEVELS.map((f) => <Chip key={f} active={flow === f} onClick={() => setFlow(f)}>{f}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {CYCLE_SYMPTOMS.map((s) => (
            <Chip key={s} active={symptoms.includes(s)} onClick={() => toggle(s)}>{s}</Chip>
          ))}
        </div>
        <button
          onClick={() => { app.logCycle({ start, flow, symptoms }); setSymptoms([]); setFlow(null); }}
          className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Save
        </button>
      </Card>

      {counts.length > 0 && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--faint)' }}>What you’ve noted</p>
          {counts.map((c) => (
            <div key={c.name} className="flex justify-between text-[0.8125rem] font-semibold">
              <span>{c.name}</span>
              <span style={{ color: 'var(--muted)' }}>{c.times}×</span>
            </div>
          ))}
        </Card>
      )}

      {app.cycles.length > 0 && (
        <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
          {[...app.cycles].reverse().slice(0, 6).map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3">
              <div>
                <p className="font-bold text-[0.84375rem]">{prettyDate(c.start)}</p>
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {[c.flow, c.symptoms?.join(', ')].filter(Boolean).join(' · ') || 'no details'}
                </p>
              </div>
              <button onClick={() => app.removeCycle(c.id)} aria-label={`Delete ${c.start}`} className="press p-1" style={{ color: 'var(--faint)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}
      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Predictions here are the average of your own logged cycles and nothing else — no model,
        no population average standing in for you.
      </p>
    </>
  );
}
