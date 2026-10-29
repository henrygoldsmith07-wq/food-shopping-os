import { useMemo, useState } from 'react';
import { Check, Leaf } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { rescueSuggestions } from '../lib/expiry-rescue.js';
import { Card } from './ui.jsx';
import ThawAheadCard from './ThawAheadCard.jsx';
import CookTwiceCard from './CookTwiceCard.jsx';
import PantryMealsCard from './PantryMealsCard.jsx';
import FreezeRescueCard from './FreezeRescueCard.jsx';
import { shortDate } from '../lib/utils.js';

/** Plan tab card: dinners that rescue food going off, each one tap from the plan. */
export default function ExpiryRescueCard() {
  return <><DinnerRescue /><FreezeRescueCard /><ThawAheadCard /><CookTwiceCard /><PantryMealsCard /></>;
}

function DinnerRescue() {
  const app = useApp();
  const [done, setDone] = useState({});
  const rows = useMemo(() => rescueSuggestions({
    recipes: app.safeRecipes || [], useSoonRows: app.useSoonIngredients || [], pantry: app.pantry || [], plan: app.plan, day: app.day,
  }), [app.safeRecipes, app.useSoonIngredients, app.pantry, app.plan, app.day]);
  const shown = [...rows, ...Object.values(done).filter((d) => !rows.some((r) => r.recipe.id === d.recipe.id))];
  if (!shown.length) return null;
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Rescue food going off">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <Leaf size={13} /> Rescue food going off
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
                    Uses up {row.used.slice(0, 3).join(', ')}{row.used.length > 3 ? ' + more' : ''}
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
