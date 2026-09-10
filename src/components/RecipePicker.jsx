import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { useApp } from '../lib/store.jsx';
import { filterByDiet } from '../lib/goals.js';
import { monthOf, seasonalHits } from '../data/seasons.js';
import { tasteScore } from '../lib/taste.js';
import { Card, Chip, Pill, FoodArt } from './ui.jsx';

/**
 * Pick a recipe for one slot. Defaults to dishes for that meal — breakfasts for
 * a breakfast slot — filtered by everyone's dietary patterns, favourites first,
 * with what's in season and what your pantry covers called out.
 */
export default function RecipePicker({ slot, onPick, onClear, hasMeal, initialQuery = '' }) {
  const app = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [anyMeal, setAnyMeal] = useState(false);
  const [inSeason, setInSeason] = useState(false);
  const month = monthOf(app.day);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = anyMeal || q ? app.safeRecipes : app.safeRecipes.filter((recipe) => recipe.meal === slot);
    const matched = q
      ? pool.filter((r) => r.name.toLowerCase().includes(q)
        || String(r.cuisine || '').toLowerCase().includes(q)
        || (r.ingredients || []).some((i) => String(i.name || i).toLowerCase().includes(q)))
      : pool;
    const allowed = filterByDiet(matched, app.planDiets);
    const seasonal = inSeason ? allowed.filter((r) => seasonalHits(r, month).length > 0) : allowed;
    return seasonal
      .sort((a, b) => (
        Number(app.favourites.includes(b.id)) - Number(app.favourites.includes(a.id))
        || tasteScore(b, app.tasteProfile) - tasteScore(a, app.tasteProfile)
      ));
  }, [query, anyMeal, inSeason, slot, month, app.safeRecipes, app.favourites, app.planDiets, app.tasteProfile]);
  return (
    <div className="px-5 pb-10 space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${app.safeRecipes.length} recipes…`}
        aria-label="Search recipes"
        className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {list.length} {anyMeal || query ? 'recipes' : `${slot} recipes`}{app.planDiets.length ? ' that fit your diet' : ''}
        </p>
        <div className="flex gap-2">
          <Chip active={inSeason} onClick={() => setInSeason((v) => !v)}>In season</Chip>
          <Chip active={!anyMeal} onClick={() => setAnyMeal((v) => !v)}>{`Just ${slot}`}</Chip>
        </div>
      </div>
      {hasMeal && (
        <button
          onClick={onClear}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <span className="inline-flex items-center gap-1.5"><X size={14} /> Clear this slot</span>
        </button>
      )}
      <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
        {list.slice(0, 120).map((r) => {
          const seasonal = seasonalHits(r, month);
          const portions = app.leftoverPortions.get(r.id) || 0;
          return (
            <button
              key={r.id}
              onClick={() => onPick(r.id)}
              className="press flex w-full items-center gap-3 p-3 text-left"
              style={{ borderColor: 'var(--line)' }}
            >
              <FoodArt recipe={r} className="h-11 w-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[0.875rem] truncate">{r.name}</span>
                <span className="block text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {r.time} min · {gbp(r.costPerServing, { always: true })}/serving · {r.protein}g protein
                </span>
              </span>
              {portions > 0 && <Pill tone="good">{portions} in fridge</Pill>}
              {!portions && seasonal.length > 1 && <Pill tone="accent">In season</Pill>}
              {app.favourites.includes(r.id) && <Pill tone="accent">Favourite</Pill>}
            </button>
          );
        })}
      </Card>
    </div>
  );
}
