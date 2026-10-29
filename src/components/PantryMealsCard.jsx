import { useMemo, useState } from 'react';
import { Check, ChefHat } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { pantryMealSuggestions } from '../lib/pantry-meals.js';
import { Card } from './ui.jsx';
import { shortDate } from '../lib/utils.js';

/** Plan tab card: dinners you can already make from confirmed stock, one tap to plan. */
export default function PantryMealsCard() {
  const app = useApp();
  const [done, setDone] = useState({});
  const rows = useMemo(() => pantryMealSuggestions({
    recipes: app.safeRecipes || [], pantry: app.pantry || [], plan: app.plan, day: app.day,
  }), [app.safeRecipes, app.pantry, app.plan, app.day]);
  const shown = [...rows, ...Object.values(done).filter((d) => !rows.some((r) => r.recipe.id === d.recipe.id))];
  if (!shown.length) return null;
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Cook from the cupboard">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <ChefHat size={13} /> Cook from the cupboard
        </p>
        <ul className="space-y-1.5">
          {shown.map((row) => {
            const planned = Boolean(done[row.recipe.id]);
            const when = row.tonight ? 'tonight' : shortDate(row.date);
            return (
              <li key={row.recipe.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-extrabold">{row.recipe.name}</span>
                  <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {row.missing.length ? `You have ${row.have} of ${row.total}; just add ${row.missing[0]}` : `You have all ${row.total} ingredients`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={planned}
                  onClick={() => { app.setPlanSlot(row.date, 'dinner', row.recipe.id); setDone((d) => ({ ...d, [row.recipe.id]: row })); }}
                  className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold"
                  style={{ borderColor: 'var(--line)' }}
                  aria-label={planned ? `${row.recipe.name} planned for ${when}` : `Plan ${row.recipe.name} for ${when}`}
                >
                  {planned ? <span className="inline-flex items-center gap-1"><Check size={13} /> Planned</span> : `Plan ${when}`}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
