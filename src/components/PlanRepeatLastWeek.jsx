import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { repeatLastWeek, lastWeekSummary, lastWeekDinnerCount, thisWeekDinnerCount } from '../lib/plan-repeat.js';
import { Card } from './ui.jsx';

/**
 * "Copy last week's plan" — offered only when it beats what's here now.
 *
 * Planning seven dinners from scratch each week is the chore that makes
 * people abandon planning. This card appears on this week's view only when
 * last week held more dinners than this one does, so it never nags a fuller
 * plan, and it never overwrites a slot already decided. Nothing here is
 * generated — it is the household's own previous answer.
 */
export default function PlanRepeatLastWeek({ dates }) {
  const app = useApp();
  const [status, setStatus] = useState('');
  // Once copied, the card stays just long enough to say what it did — the
  // offer-guard below would otherwise hide it the instant the week filled.
  if (status) {
    return (
      <Card className="!p-3.5">
        <p className="text-[0.8125rem] font-extrabold inline-flex items-center gap-1.5">
          <CalendarClock size={14} style={{ color: 'var(--accent)' }} /> Repeat last week
        </p>
        <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{status}</p>
      </Card>
    );
  }
  const offer = lastWeekSummary(app.plan, app.day);
  const onCurrentWeek = dates && dates.some((date) => date === app.day);
  if (!offer || !onCurrentWeek) return null;
  if (thisWeekDinnerCount(app.plan, dates) >= lastWeekDinnerCount(app.plan, app.day)) return null;

  const copy = () => {
    const result = repeatLastWeek(app.plan, app.day);
    if (!result.count) return;
    app.set({ plan: result.plan });
    setStatus(result.status);
  };

  return (
    <Card className="!p-3.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-extrabold inline-flex items-center gap-1.5">
          <CalendarClock size={14} style={{ color: 'var(--accent)' }} /> Repeat last week
        </p>
        <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {status || offer}
        </p>
      </div>
      <button
        onClick={copy}
        className="press shrink-0 rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Copy
      </button>
    </Card>
  );
}
