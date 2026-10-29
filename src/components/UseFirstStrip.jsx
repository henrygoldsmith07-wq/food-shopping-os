import { useMemo } from 'react';
import { Leaf } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { firstItems, firstWhen } from '../lib/use-first.js';
import { Card } from './ui.jsx';

/** Home card: the three things in the kitchen to use first, each with a recipe that uses it up. */
export default function UseFirstStrip({ openRecipe, openPantry }) {
  const app = useApp();
  const rows = useMemo(
    () => firstItems({ pantry: app.pantry || [], recipes: app.safeRecipes || [], day: app.day }),
    [app.pantry, app.safeRecipes, app.day],
  );
  if (!rows.length) return null;
  return (
    <section className="px-5" aria-label="Use first">
      <Card className="!p-3 space-y-2" label="Use first">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <Leaf size={13} /> Use first
        </p>
        <ul className="space-y-1.5">
          {rows.map(({ item, daysLeft, recipe, alsoUses }) => (
            <li key={item.id || item.name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-extrabold">{item.name}</span>
                <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Goes off {firstWhen(daysLeft)}{recipe ? ` · ${recipe.name}${alsoUses.length ? ` also uses ${alsoUses[0]}` : ''}` : ''}
                </span>
              </span>
              {recipe ? (
                <button type="button" onClick={() => openRecipe?.(recipe)} className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }} aria-label={`Open ${recipe.name}`}>
                  See recipe
                </button>
              ) : (
                <button type="button" onClick={() => openPantry?.()} className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }} aria-label={`Open pantry for ${item.name}`}>
                  Pantry
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
