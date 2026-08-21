import { useMemo, useRef, useState } from 'react';
import { Heart, RotateCcw, Sparkles, ThumbsDown, Utensils } from 'lucide-react';
import { buildTasteDeck } from '../lib/taste.js';
import { useApp } from '../lib/store.jsx';
import { FoodArt, Pill } from './ui.jsx';

const SWIPE_DISTANCE = 72;

export default function TasteGame() {
  const app = useApp();
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const start = useRef(null);
  const sessionIds = useRef(null);
  if (!sessionIds.current) {
    sessionIds.current = buildTasteDeck(app.safeRecipes, app.tasteRatings).map((recipe) => recipe.id);
  }
  const sessionSet = useMemo(() => new Set(sessionIds.current), []);
  const deck = useMemo(() => app.safeRecipes.filter(
    (recipe) => sessionSet.has(recipe.id) && !app.tasteRatings[recipe.id],
  ), [app.safeRecipes, app.tasteRatings, sessionSet]);
  const current = deck[0];
  const recorded = sessionIds.current.filter((id) => app.tasteRatings[id]).length;

  const choose = (verdict) => {
    if (!current) return;
    app.rateRecipeTaste(current.id, verdict);
    setDrag({ x: 0, y: 0 });
    start.current = null;
  };

  const finishDrag = () => {
    if (drag.y < -SWIPE_DISTANCE) choose('love');
    else if (drag.x > SWIPE_DISTANCE) choose('like');
    else if (drag.x < -SWIPE_DISTANCE) choose('nope');
    else setDrag({ x: 0, y: 0 });
    start.current = null;
  };

  if (!current) {
    return (
      <div className="px-5 pb-12 pt-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Sparkles size={28} />
        </div>
        <h3 className="mt-4 text-xl font-extrabold">Taste profile complete</h3>
        <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Your AI plans now favour {app.tasteProfile.topCuisines.slice(0, 2).join(' and ') || 'the recipes you liked'}.
        </p>
        <button
          onClick={app.resetRecipeTaste}
          className="press mt-5 inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          <RotateCcw size={15} /> Play again
        </button>
      </div>
    );
  }

  const rotation = Math.max(-10, Math.min(10, drag.x / 16));
  const verdict = drag.y < -36 ? 'LOVE'
    : drag.x > 36 ? 'LIKE'
      : drag.x < -36 ? 'NOPE'
        : '';

  return (
    <div className="px-5 pb-10">
      <div className="flex items-start justify-between gap-3 pb-3">
        <div>
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Swipe through recipes: left to skip, right to like, up to love.
          </p>
          <p className="mt-1 text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}>
            {recorded} taste{recorded === 1 ? '' : 's'} recorded
          </p>
        </div>
        <Pill tone="accent">{Math.min(recorded + 1, sessionIds.current.length)}/{sessionIds.current.length}</Pill>
      </div>

      <div className="relative mx-auto h-[475px] max-w-sm">
        <div className="absolute inset-x-3 top-3 bottom-0 rounded-[28px]" style={{ background: 'var(--card-2)', transform: 'rotate(2deg)' }} />
        <article
          className="absolute inset-0 overflow-hidden rounded-[28px] border shadow-xl select-none"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--line)',
            transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg)`,
            transition: start.current ? 'none' : 'transform 180ms ease',
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            start.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            setDrag({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
          }}
          onPointerUp={finishDrag}
          onPointerCancel={() => {
            start.current = null;
            setDrag({ x: 0, y: 0 });
          }}
          aria-label={`Taste card: ${current.name}`}
        >
          <div className="relative h-[330px]">
            <FoodArt recipe={current} alt={`Taste card: ${current.name}`} className="h-full w-full" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/75 to-transparent" />
            {verdict && (
              <span
                className="absolute top-5 left-5 -rotate-6 rounded-xl border-4 px-3 py-1 text-2xl font-black tracking-widest"
                style={{ color: verdict === 'NOPE' ? '#ff6b78' : '#8ff0b2', borderColor: 'currentColor' }}
              >
                {verdict}
              </span>
            )}
            <div className="absolute inset-x-5 bottom-4 text-white">
              <h3 className="text-2xl font-black leading-tight">{current.name}</h3>
              <p className="mt-1 text-[0.8125rem] font-bold text-white/85">
                {current.cuisine} · {current.time} min · {current.protein}g protein
              </p>
            </div>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {(current.tags || []).slice(0, 3).map((tag) => <Pill key={tag} tone="muted">{tag}</Pill>)}
            </div>
            <p className="mt-3 line-clamp-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {(current.ingredients || []).slice(0, 5).map((item) => item.name || item).join(' · ')}
            </p>
          </div>
        </article>
      </div>

      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => choose('nope')}
          aria-label="No thanks"
          className="press flex h-14 w-14 items-center justify-center rounded-full border shadow-sm"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--danger)' }}
        >
          <ThumbsDown size={22} />
        </button>
        <button
          onClick={() => choose('like')}
          aria-label="Like it"
          className="press flex h-16 w-16 items-center justify-center rounded-full shadow-md"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Utensils size={24} />
        </button>
        <button
          onClick={() => choose('love')}
          aria-label="Love it"
          className="press flex h-14 w-14 items-center justify-center rounded-full border shadow-sm"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--accent)' }}
        >
          <Heart size={23} fill="currentColor" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 text-center text-[0.625rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        <span>No thanks</span><span>Like</span><span>Love</span>
      </div>

      {app.tasteProfile.topCuisines.length > 0 && (
        <p className="mt-4 text-center text-[0.78125rem] font-bold" style={{ color: 'var(--muted)' }}>
          Current match: {app.tasteProfile.topCuisines.slice(0, 2).join(' · ')}
        </p>
      )}
    </div>
  );
}
