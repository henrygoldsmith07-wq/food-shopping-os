import { useMemo, useState } from 'react';
import { Check, UtensilsCrossed } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cookTwiceOffers } from '../lib/cook-twice.js';
import { householdPortionsFor } from '../lib/portions.js';
import { Card } from './ui.jsx';
import { shortDate } from '../lib/utils.js';

/** Repeat a dinner for lunch; normal plan reconciliation includes both meals. */
export default function CookTwiceCard() {
  const app = useApp();
  const [done, setDone] = useState({});
  const people = householdPortionsFor(app).portions;
  const rows = useMemo(
    () => cookTwiceOffers({ plan: app.plan, recipes: app.safeRecipes || [], people, day: app.day }),
    [app.plan, app.safeRecipes, people, app.day],
  );
  const shown = [...rows, ...Object.values(done).filter((d) => !rows.some((r) => r.recipe.id === d.recipe.id))];
  if (!shown.length) return null;
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Plan tomorrow's lunch">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <UtensilsCrossed size={13} /> Plan tomorrow’s lunch
        </p>
        <ul className="space-y-1.5">
          {shown.map((row) => {
            const planned = Boolean(done[row.recipe.id]);
            return (
              <li key={row.recipe.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-extrabold">{row.recipe.name}</span>
                  <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {planned ? `Lunch planned ${shortDate(row.lunchDate)} · shopping list updated` : `Repeat dinner ${shortDate(row.cookDate)} for lunch ${shortDate(row.lunchDate)} · ingredients added to your list`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={planned}
                  onClick={() => { app.setPlanSlot(row.lunchDate, 'lunch', row.recipe.id); setDone((d) => ({ ...d, [row.recipe.id]: row })); }}
                  className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold"
                  style={{ borderColor: 'var(--line)' }}
                  aria-label={planned ? `${row.recipe.name} planned for lunch` : `Plan ${row.recipe.name} for lunch on ${shortDate(row.lunchDate)}`}
                >
                  {planned ? <span className="inline-flex items-center gap-1"><Check size={13} /> Planned</span> : 'Plan lunch'}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
