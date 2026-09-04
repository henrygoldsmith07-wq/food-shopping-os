import { useMemo } from 'react';
import { ChefHat, ChevronRight, Clock, Plus } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { MEAL_SLOTS } from '../data/plan.js';
import { RECIPES } from '../data/recipes.js';
import { gbp } from '../lib/utils.js';
import { Glyph } from './icons.jsx';
import { Card } from './ui.jsx';

/**
 * Cook is a tab, not a hunt: the meals planned for today, each one able to
 * start its cooking mode in a tap. Nothing planned yet reads as an action —
 * plan something — rather than an empty screen.
 */
export default function CookTab({ openRecipe, goTab }) {
  const app = useApp();
  const byId = useMemo(() => {
    const map = new Map();
    for (const recipe of [...(app.myRecipes || []), ...RECIPES]) if (recipe?.id) map.set(recipe.id, recipe);
    return map;
  }, [app.myRecipes]);

  const todayPlan = app.plan?.[app.day] || {};
  const rows = MEAL_SLOTS
    .map(({ key, label }) => {
      const recipeId = todayPlan[key];
      const recipe = recipeId ? byId.get(recipeId) : null;
      return recipe ? { label, key, recipe } : null;
    })
    .filter(Boolean);

  return (
    <div className="px-5 pt-5 pb-6 space-y-3">
      {rows.length === 0 && (
        <Card className="!p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--card-2)', color: 'var(--faint)' }}>
            <ChefHat size={22} />
          </div>
          <p className="mt-3 text-[1rem] font-extrabold">Nothing planned to cook today</p>
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Plan a meal and it will be waiting here, ready to start.
          </p>
          <button
            type="button"
            onClick={() => goTab('plan')}
            className="press mx-auto mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[0.875rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <Plus size={16} /> Plan something
          </button>
        </Card>
      )}

      {rows.map(({ label, recipe }) => (
        <Card key={label} className="!p-0 overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[1.4rem]" style={{ background: 'var(--card-2)' }}>
              <Glyph e={recipe.emoji || '🍽️'} size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
              <p className="truncate text-[0.9375rem] font-extrabold">{recipe.name}</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                <Clock size={11} className="inline" /> {recipe.time <= 60 ? `${recipe.time} min` : `${Math.round(recipe.time / 60)} h`}
                {recipe.kcal ? ` · ${recipe.kcal} kcal` : ''}
                {recipe.costPerServing ? ` · ${gbp(recipe.costPerServing, { always: true })}/serving` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openRecipe(recipe, { startCooking: true })}
              className="press inline-flex shrink-0 items-center gap-1 rounded-2xl px-3.5 py-2.5 text-[0.78125rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Start cooking <ChevronRight size={14} />
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
