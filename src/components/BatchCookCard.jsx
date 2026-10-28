import { useMemo } from 'react';
import { ChefHat } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { RECIPES } from '../data/recipes.js';
import { batchCookPairs } from '../lib/batch-cook.js';
import { Card } from './ui.jsx';

/** Plan tab card: two planned dishes that share ingredients, to prep in one session. */
export default function BatchCookCard({ dates }) {
  const app = useApp();
  const pairs = useMemo(() => {
    const byId = new Map();
    for (const r of [...RECIPES, ...(app.myRecipes || [])]) if (r?.id) byId.set(r.id, r);
    return batchCookPairs(app.plan, dates, byId, { limit: 2 });
  }, [app.plan, app.myRecipes, dates]);
  if (!pairs.length) return null;
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Batch-cook day">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <ChefHat size={13} /> Cook these together
        </p>
        <ul className="space-y-2">
          {pairs.map((p) => (
            <li key={p.id}>
              <span className="block text-[0.8125rem] font-extrabold">{p.recipes.map((r) => r.recipe.name).join(' + ')}</span>
              <span className="block text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Both use {p.shared.slice(0, 4).join(', ').toLowerCase()}
                {p.minutesSaved ? ` · prep once, save about ${p.minutesSaved} min` : ''}
              </span>
              <ol className="mt-1 list-decimal pl-4 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {p.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
