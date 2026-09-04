import { Card } from './ui.jsx';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { wasteCauseBreakdown, wasteCauseInsight } from '../lib/waste-log.js';

const shortDay = (date) => {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/**
 * The waste summary as a log of causes, not just a total.
 *
 * "Binned 6 items" says money lost; saying 4 were cooked leftovers and 2
 * were bought stock that sat says what to change. Rendered where discards
 * happen so the cause stays attached to the moment it was recorded.
 */
export default function WasteCauseCard() {
  const app = useApp();
  if (!app.wasted?.count) return null;
  const breakdown = wasteCauseBreakdown(app);
  const insight = wasteCauseInsight(breakdown);
  const rows = [
    breakdown.leftoverCooked.count > 0 && {
      label: 'Leftover cooked',
      ...breakdown.leftoverCooked,
    },
    breakdown.leftoverBought.count > 0 && {
      label: 'Leftover bought',
      ...breakdown.leftoverBought,
    },
    breakdown.neverCooked > 0 && { label: 'Never cooked', count: breakdown.neverCooked, cost: 0 },
  ].filter(Boolean);

  return (
    <Card className="mt-2 !p-3">
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        Your waste, by cause
      </p>
      <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        You’ve binned {app.wasted.count} item{app.wasted.count === 1 ? '' : 's'}, worth{' '}
        {gbp(app.wasted.cost, { always: true })} at what you paid
        {app.wasted.worst?.cost > 0 && ` — the priciest was ${app.wasted.worst.name}`}.
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-[0.78125rem] font-bold">
            <span style={{ color: 'var(--muted)' }}>{row.label}</span>
            <span>
              {row.count} item{row.count === 1 ? '' : 's'}
              {row.cost > 0 && <span style={{ color: 'var(--faint)' }}> · {gbp(row.cost, { always: true })}</span>}
            </span>
          </div>
        ))}
      </div>
      {breakdown.missedMeals.length > 0 && (
        <p className="mt-2 border-t pt-2 text-[0.75rem] font-semibold leading-snug" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
          <span style={{ color: 'var(--warn)' }}>
            {breakdown.missedMeals.length} of those slipped by with nothing recorded
            {breakdown.missedMeals.length < breakdown.neverCooked ? ' — the rest were marked' : ''}:
          </span>{' '}
          {breakdown.missedMeals.slice(0, 3).map((missed) => `${missed.name || 'a planned meal'} (${shortDay(missed.date)})`).join(' · ')}
          {breakdown.missedMeals.length > 3 && ` · +${breakdown.missedMeals.length - 3} more`}.
          <span className="block mt-0.5" style={{ color: 'var(--faint)' }}>
            Review the week’s plan before it repeats.
          </span>
        </p>
      )}
      {insight && (
        <p className="mt-2 text-[0.78125rem] font-semibold leading-snug" style={{ color: 'var(--accent)' }}>
          {insight}
        </p>
      )}
    </Card>
  );
}
