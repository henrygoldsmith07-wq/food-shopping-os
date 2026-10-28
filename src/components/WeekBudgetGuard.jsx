import { useMemo, useState } from 'react';
import { ArrowRight, PiggyBank } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { budgetGuard } from '../lib/budget-guard.js';
import { gbp, shortDate } from '../lib/utils.js';
import { Card } from './ui.jsx';

/** Plan tab card: the planned week is over the weekly budget, so here are the cheapest swaps. */
export default function WeekBudgetGuard({ dates, people }) {
  const app = useApp();
  const [dismissed, setDismissed] = useState(false);
  const guard = useMemo(() => budgetGuard({
    plan: app.plan, dates, people, budget: app.weeklyBudget, recipes: app.safeRecipes || [],
  }), [app.plan, dates, people, app.weeklyBudget, app.safeRecipes]);
  if (!guard.active || dismissed) return null;
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Over your weekly budget">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <PiggyBank size={13} /> Over your weekly budget
        </p>
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          This week’s meals come to about {gbp(guard.cost, { always: true })}, {gbp(guard.over, { always: true })} over your {gbp(guard.budget)}.
          {guard.swaps.length === 0
            ? ' No cheaper swap keeps the protein up, so it is your call.'
            : guard.closes
              ? ` ${guard.swaps.length === 1 ? 'One swap saves' : `${guard.swaps.length} swaps save`} about ${gbp(guard.saving, { always: true })}.`
              : ` These swaps save about ${gbp(guard.saving, { always: true })}, which gets you closer.`}
        </p>
        <ul className="space-y-1.5">
          {guard.swaps.map((s) => (
            <li key={`${s.date}-${s.slot}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                <span className="block truncate">{shortDate(s.date)} {s.slot}: {s.from.name}</span>
                <span className="flex items-center gap-1 truncate font-extrabold" style={{ color: 'var(--ink)' }}>
                  <ArrowRight size={12} /> {s.to.name} · saves {gbp(s.saving, { always: true })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => app.setPlanSlot(s.date, s.slot, s.to.id)}
                className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
                aria-label={`Swap ${s.from.name} for ${s.to.name} on ${shortDate(s.date)}`}
              >
                Swap
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setDismissed(true)} className="press min-h-[44px] text-[0.75rem] font-bold underline" style={{ color: 'var(--muted)' }}>
          Keep my plan
        </button>
      </Card>
    </div>
  );
}
