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
import { Check, CheckCircle2, RefreshCw } from 'lucide-react';
import { MAX_STARTER_PICKS } from '../lib/starter-recipes.js';
import { FoodArt } from './ui.jsx';
import { formatCookTime } from '../lib/utils.js';

export default function StarterPicker({ starters, picked, onToggle, onMore }) {
  return (
    <fieldset>
      <legend className="text-[0.8125rem] font-extrabold tracking-tight">
        Choose your first dinners
      </legend>
      <div className="flex items-end justify-between gap-3">
        <span className="shrink-0 text-[0.6875rem] font-bold" style={{ color: 'var(--accent)' }}>
          {picked.length} of {MAX_STARTER_PICKS} selected
        </span>
      </div>
      <p className="mt-1 text-[0.75rem] font-medium" style={{ color: 'var(--muted)' }}>
        Start small. Each pick becomes a planned dinner and helps build your first list.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3">
        {starters.options.map(({ recipe, reasons }) => {
          const selected = picked.includes(recipe.id);
          return (
            <button
              key={recipe.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(recipe.id)}
              disabled={!selected && picked.length >= MAX_STARTER_PICKS}
              className="press relative overflow-hidden rounded-[1.25rem] border text-left transition-colors disabled:opacity-55"
              style={{
                background: 'var(--card)',
                borderColor: selected ? 'var(--accent)' : 'var(--line)',
                boxShadow: selected ? '0 0 0 1px var(--accent), 0 12px 30px color-mix(in srgb, var(--accent) 10%, transparent)' : '0 4px 18px color-mix(in srgb, var(--ink) 4%, transparent)',
              }}
            >
              <span className="relative block">
                <FoodArt recipe={recipe} className="h-28 w-full sm:h-32" px={30} />
                <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border" style={{ background: selected ? 'var(--accent)' : 'color-mix(in srgb, var(--card) 92%, transparent)', borderColor: selected ? 'var(--accent)' : 'var(--line)', color: selected ? 'var(--on-accent)' : 'var(--muted)' }}>
                  {selected ? <Check size={15} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full" style={{ background: 'var(--line)' }} />}
                </span>
              </span>
              <span className="block p-3">
                <span className="block min-h-[2.2rem] text-[0.78125rem] font-extrabold leading-tight">{recipe.name}</span>
                <span className="mt-1 block text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {formatCookTime(recipe.time)} · £{recipe.costPerServing.toFixed(2)}/serving
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
                <span className="mt-2 inline-flex min-h-8 items-center gap-1.5 border-t pt-2 text-[0.6875rem] font-extrabold" style={{ borderColor: 'var(--line)', color: selected ? 'var(--accent)' : 'var(--muted)' }}>
                  {selected ? (
                    <><CheckCircle2 size={13} /><span aria-hidden="true">In your week</span><span className="sr-only">Selected</span></>
                  ) : (
                    <><span aria-hidden="true">Add this dinner</span><span className="sr-only">Choose</span></>
                  )}
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
          className="press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
        >
          <RefreshCw size={14} /> Show me different choices
        </button>
      )}

      <p className="mt-3 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
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
