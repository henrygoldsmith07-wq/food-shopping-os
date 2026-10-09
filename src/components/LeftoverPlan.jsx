import { useApp } from '../lib/store.jsx';
import { Card, Pill } from './ui.jsx';
import { leftoverSummary } from '../lib/leftover-planning.js';

/**
 * Leftover intelligence — first-class planning signal. Quantity, useful
 * period, reuse suggestion, one-tap use in plan.
 */
export default function LeftoverPlan({ goTab }) {
  const app = useApp();
  const rows = leftoverSummary(app.leftovers || [], app.day);
  if (!rows.length) return null;
  const useInPlan = (row) => {
    // Plan the reuse for tomorrow lunch; the plan handles portions.
    app.setPlanSlot?.(row.plannedReuse?.date || app.day, 'lunch', row.recipeId);
    goTab?.('plan');
  };
  return (
    <section className="px-5" aria-label="Leftovers to use">
      <Card>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Leftovers first
        </p>
        <ul className="mt-2 space-y-1.5">
          {rows.slice(0, 3).map((row) => (
            <li key={row.id} className="flex items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              <span className="min-w-0 flex-1">· {row.label}{row.safeUntil ? ` · use by ${row.safeUntil}` : ''}</span>
              <button type="button" onClick={() => useInPlan(row)} className="press shrink-0 rounded-xl border px-2.5 py-1.5 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
                Use in plan
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2"><Pill tone="muted">Planned before new purchases</Pill></div>
      </Card>
    </section>
  );
}
