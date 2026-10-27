import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Heart, Undo2, X } from 'lucide-react';
import { formatCookTime, gbp } from '../lib/utils.js';
import { useApp } from '../lib/store.jsx';
import { dinnerDeck, openDinnerDates, plannedRecipeIds } from '../lib/swipe-week.js';
import { FoodArt, Pill } from './ui.jsx';

const SWIPE_PX = 90;
const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });

/**
 * Build the week by swiping (the Herbi pattern). Right — or the tick, or the
 * right arrow key — puts the dinner on the next open night; left skips it for
 * this deck only. The buttons do exactly what the gestures do, so nothing is
 * gesture-only. Undo takes back the last dinner this sheet added.
 */
export default function SwipeWeekBuilder({ dates, onDone }) {
  const app = useApp();
  const [skipped, setSkipped] = useState([]);
  const [added, setAdded] = useState([]); // [{date, id}] most recent last
  const [dx, setDx] = useState(0);
  const start = useRef(null);

  const open = openDinnerDates(app.plan, dates, app.day);
  const deck = useMemo(() => dinnerDeck(app.safeRecipes, {
    favourites: app.favourites,
    tasteProfile: app.tasteProfile,
    diets: app.planDiets,
    skipped,
    planned: plannedRecipeIds(app.plan, dates),
  }), [app.safeRecipes, app.favourites, app.tasteProfile, app.planDiets, skipped, app.plan, dates]);
  const recipe = deck[0];
  const nextNight = open[0];

  const take = () => {
    if (!recipe || !nextNight) return;
    app.setPlanSlot(nextNight, 'dinner', recipe.id);
    setAdded((list) => [...list, { date: nextNight, id: recipe.id }]);
    setDx(0);
  };
  const skip = () => {
    if (!recipe) return;
    setSkipped((list) => [...list, recipe.id]);
    setDx(0);
  };
  const undo = () => {
    const last = added.at(-1);
    if (!last) return;
    app.setPlanSlot(last.date, 'dinner', null);
    setAdded((list) => list.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') take();
      if (event.key === 'ArrowLeft') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const release = () => {
    if (dx > SWIPE_PX) take();
    else if (dx < -SWIPE_PX) skip();
    else setDx(0);
    start.current = null;
  };

  if (!nextNight) {
    return (
      <div className="px-5 pb-10 text-center space-y-3" data-testid="swipe-week-done">
        <p className="text-[1.125rem] font-extrabold">Every night this week has a dinner.</p>
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {added.length ? `You added ${added.length} here.` : 'Nothing left to fill.'} Send the week to your list when you are ready.
        </p>
        <button type="button" onClick={onDone} className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold" style={{ background: 'var(--ink)', color: 'var(--card)' }}>
          Back to the plan
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-10 space-y-4" data-testid="swipe-week">
      <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Next open night: <strong style={{ color: 'var(--ink)' }}>{dayName(nextNight)}</strong> · {open.length} to fill
      </p>
      {recipe ? (
        <div
          role="group"
          aria-roledescription="recipe card"
          aria-label={recipe.name}
          className="relative select-none overflow-hidden rounded-3xl border touch-pan-y"
          style={{
            borderColor: dx > SWIPE_PX / 2 ? 'var(--good)' : dx < -SWIPE_PX / 2 ? 'var(--bad)' : 'var(--line)',
            background: 'var(--card)',
            transform: `translateX(${dx}px) rotate(${dx / 24}deg)`,
            transition: start.current === null ? 'transform 180ms ease' : 'none',
          }}
          onPointerDown={(event) => { start.current = event.clientX; event.currentTarget.setPointerCapture?.(event.pointerId); }}
          onPointerMove={(event) => { if (start.current !== null) setDx(event.clientX - start.current); }}
          onPointerUp={release}
          onPointerCancel={() => { start.current = null; setDx(0); }}
        >
          <FoodArt recipe={recipe} className="h-44 w-full" />
          <div className="p-4 space-y-1.5">
            <p className="text-[1.125rem] font-extrabold leading-snug">{recipe.name}</p>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {formatCookTime(recipe.time)} · {gbp(recipe.costPerServing, { always: true })}/serving · {recipe.protein}g protein
            </p>
            <div className="flex flex-wrap gap-1.5">
              {app.favourites.includes(recipe.id) && <Pill tone="accent"><Heart size={11} /> Favourite</Pill>}
              {recipe.cuisine && <Pill>{recipe.cuisine}</Pill>}
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border p-4 text-[0.8125rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
          No more dinners fit your diets in this deck. Pick the rest from the plan.
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button type="button" onClick={skip} disabled={!recipe} aria-label="Skip this dinner" className="press inline-flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-[0.875rem] font-extrabold disabled:opacity-40" style={{ borderColor: 'var(--line)' }}>
          <X size={16} /> Skip
        </button>
        <button type="button" onClick={undo} disabled={!added.length} aria-label="Undo the last dinner added" className="press grid h-11 w-11 place-items-center rounded-full border disabled:opacity-30" style={{ borderColor: 'var(--line)' }}>
          <Undo2 size={16} />
        </button>
        <button type="button" onClick={take} disabled={!recipe} aria-label={recipe ? `Add ${recipe.name} for ${dayName(nextNight)}` : 'Add'} className="press inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40" style={{ background: 'var(--ink)', color: 'var(--card)' }}>
          <Check size={16} /> Add
        </button>
      </div>
      <p className="text-center text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        Swipe right to add, left to skip. Skipping only hides it from this deck.
      </p>
    </div>
  );
}
