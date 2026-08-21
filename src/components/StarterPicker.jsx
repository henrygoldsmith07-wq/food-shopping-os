/**
 * The first-run recipe choice.
 *
 * Everything it shows has already passed the hard restrictions and the
 * household's dietary patterns in `lib/starter-recipes.js` — this component
 * has no filtering of its own to do, which is the point: a screen that decides
 * for itself what is safe is a second answer to the same question.
 *
 * Each card says why the recipe is there, and what the filters removed is
 * stated as a count rather than as rows you can tap through.
 */
import { Check, RefreshCw } from 'lucide-react';
import { MAX_STARTER_PICKS } from '../lib/starter-recipes.js';
import { FoodArt } from './ui.jsx';

export default function StarterPicker({ starters, picked, onToggle, onMore }) {
  return (
    <fieldset>
      <legend className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        Choose up to {MAX_STARTER_PICKS} dinners
      </legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {starters.options.map(({ recipe, reasons }) => {
          const selected = picked.includes(recipe.id);
          return (
            <button
              key={recipe.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(recipe.id)}
              disabled={!selected && picked.length >= MAX_STARTER_PICKS}
              className="press overflow-hidden rounded-2xl border text-left disabled:opacity-60"
              style={{
                background: 'var(--card)',
                borderColor: selected ? 'var(--accent)' : 'var(--line)',
                boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
              }}
            >
              <FoodArt recipe={recipe} className="h-24 w-full" px={28} />
              <span className="block p-2.5">
                <span className="block text-[0.75rem] font-extrabold leading-tight">{recipe.name}</span>
                <span className="mt-1 block text-[0.65625rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {recipe.time} min · £{recipe.costPerServing.toFixed(2)}/serving
                </span>
                {/* Why this one, in its own words — a suggestion nobody can see
                    the reason for is just a guess with a photo on it. */}
                <span className="mt-1.5 block space-y-0.5">
                  {reasons.slice(0, 2).map((reason) => (
                    <span key={reason} className="block text-[0.65625rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
                      {reason}
                    </span>
                  ))}
                </span>
                <span className="mt-1.5 inline-flex items-center gap-1 text-[0.65625rem] font-extrabold" style={{ color: selected ? 'var(--accent)' : 'var(--faint)' }}>
                  {selected && <Check size={11} strokeWidth={3} />}
                  {selected ? 'Selected' : 'Choose'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Offered only when there is genuinely something else to show. */}
      {starters.more && (
        <button
          type="button"
          onClick={onMore}
          className="press mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
        >
          <RefreshCw size={14} /> Show me different choices
        </button>
      )}

      <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {starters.patterns.length
          ? `Chosen to fit how you eat — ${starters.hidden.suitable} dinners in the book do, and the rest are not shown.`
          : 'Optional. Choose nothing to start with an empty app.'}
        {starters.hidden.unsafe > 0
          && ` ${starters.hidden.unsafe} recipes containing something you avoid are left out entirely.`}
      </p>
      {starters.short && (
        <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Your rules leave {starters.hidden.suitable} suitable dinner
          {starters.hidden.suitable === 1 ? '' : 's'}, so that is all we are offering — nothing is
          added back by relaxing them.
        </p>
      )}
    </fieldset>
  );
}
