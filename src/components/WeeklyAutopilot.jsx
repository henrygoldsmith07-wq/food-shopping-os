import { useApp } from '../lib/store.jsx';
import { Card, Pill } from './ui.jsx';
import { entriesForProposal } from '../lib/weekly-autopilot.js';

/**
 * Weekly autopilot card — one coherent household-aware proposal.
 * Secondary weight: the Week's primary action is NextActionCard; this is the
 * proposal beneath it. Applies via real plan entries; reasons per day.
 */
export default function WeeklyAutopilot({ goTab }) {
  const app = useApp();
  const proposal = app.weeklyProposal;
  if (!proposal?.days?.length) return null;
  const apply = () => {
    const entries = entriesForProposal(proposal);
    if (app.applyPlanEntries) app.applyPlanEntries(entries);
    app.recordProductEvent?.('autopilot_applied', { count: entries.length });
    goTab?.('plan');
  };
  const shown = proposal.days.slice(0, 4);
  const dismissDay = (date, recipeId) => {
    // Rejection feeds the same taste signal the engine reads — a dismissed
    // proposal day lowers that recipe's priority next week.
    if (recipeId) app.rateRecipeTaste?.(recipeId, 'nope');
    app.recordProductEvent?.('autopilot_rejected', { date, recipeId });
  };
  return (
    <section className="px-5" aria-label="Proposed week">
      <Card>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Proposed week · Forq autopilot
        </p>
        <p className="mt-1 text-[0.9375rem] font-extrabold">{proposal.summary}</p>
        {proposal.overBudget > 0 && (
          <p className="mt-1 text-[0.78125rem] font-bold" style={{ color: 'var(--warn-deep)' }}>
            About £{proposal.overBudget.toFixed(2)} over your weekly target — swap one dinner to fix it.
          </p>
        )}
        <ul className="mt-2 space-y-1.5">
          {shown.map((d) => (
            <li key={d.date} className="flex items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              <span className="min-w-0 flex-1">· {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })} — {d.recipe?.name || 'No pick'}
              {d.reasons?.[0] ? ` (${d.reasons[0]})` : ''}</span>
              {d.recipe?.id && (
                <button type="button" onClick={() => dismissDay(d.date, d.recipe.id)} aria-label={`Not this meal on ${d.date}`} className="press shrink-0 rounded-full px-2 py-1 text-[0.71875rem] font-bold" style={{ color: 'var(--faint)' }}>
                  Not this
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="muted">{proposal.confidence} confidence</Pill>
          {proposal.estimatedCost != null && <Pill tone="muted">≈ £{Number(proposal.estimatedCost).toFixed(2)}</Pill>}
          <button type="button" onClick={apply} className="press ml-auto rounded-xl px-4 py-2.5 text-[0.8125rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            Use this week
          </button>
        </div>
      </Card>
    </section>
  );
}
