import { useMemo, useState } from 'react';
import { Check, Snowflake } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { thawCandidates, THAWED_DAYS } from '../lib/thaw-ahead.js';
import { Card } from './ui.jsx';

/** Plan tab card: frozen food a planned meal needs soon, moved to the fridge in one tap. */
export default function ThawAheadCard() {
  const app = useApp();
  const [done, setDone] = useState({});
  const rows = useMemo(
    () => thawCandidates({ plan: app.plan, recipes: app.safeRecipes || [], pantry: app.pantry || [], day: app.day }).slice(0, 4),
    [app.plan, app.safeRecipes, app.pantry, app.day],
  );
  const shown = [...rows, ...Object.values(done).filter((d) => !rows.some((r) => r.item.id === d.item.id))];
  if (!shown.length) return null;
  const when = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Thaw ahead">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <Snowflake size={13} /> Thaw ahead
        </p>
        <ul className="space-y-1.5">
          {shown.map((row) => {
            const thawed = Boolean(done[row.item.id]);
            return (
              <li key={row.item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-extrabold">{row.item.name}</span>
                  <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {thawed ? `In the fridge · use within ${THAWED_DAYS[row.item.cat] ?? 3} days` : `Frozen · ${row.recipe.name} ${when(row.daysAway)}`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={thawed}
                  onClick={() => { app.thawPantryItem(row.item.id); setDone((d) => ({ ...d, [row.item.id]: row })); }}
                  className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold"
                  style={{ borderColor: 'var(--line)' }}
                  aria-label={thawed ? `${row.item.name} in the fridge` : `Move ${row.item.name} to the fridge to thaw`}
                >
                  {thawed ? <span className="inline-flex items-center gap-1"><Check size={13} /> Thawing</span> : 'Thaw it'}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
