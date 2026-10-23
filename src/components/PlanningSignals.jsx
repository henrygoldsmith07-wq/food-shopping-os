import { useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { SKIP_REASONS, skipReasonLabel } from '../lib/planning-intelligence.js';
import { getUseItUpMatches } from '../lib/use-it-up.js';
import { Card, Pill, Section } from './ui.jsx';
import { formatCookTime } from '../lib/utils.js';

const EMPTY_ADHERENCE = { planned: 0, completed: 0, skipped: 0, pending: 0, rate: null, rows: [] };

export default function PlanningSignals({ app, openRecipe = null }) {
  const [skipping, setSkipping] = useState(null);
  // "Use it up": the diet-safe dishes that consume the most use-soon
  // items, ranked by the same matcher as the rest of the app. Rendered
  // only when the host passes an opener — a row that cannot open its
  // recipe would be a dead end, not a suggestion.
  const useItUp = useMemo(() => getUseItUpMatches(app.safeRecipes || [], {
    useSoonRows: app.useSoonIngredients || [],
    pantry: app.pantry || [],
  }), [app.safeRecipes, app.useSoonIngredients, app.pantry]);
  const showUseItUp = typeof openRecipe === 'function' && useItUp.length > 0;
  const adherence = app.planningAdherence || EMPTY_ADHERENCE;
  const rows = adherence.rows || [];
  const pendingToday = rows.filter((row) => row.date === app.day && row.status === 'pending');
  const skippedRows = rows.filter((row) => row.status === 'skipped');
  const perishability = app.perishability || {};
  const hasPerishability = perishability.soon > 0 || perishability.past > 0 || perishability.unknown > 0;
  const hasSignals = app.useSoonIngredients?.length > 0
    || app.leftoverAwareness?.length > 0
    || app.wasteProfile?.repeated?.length > 0
    || adherence.planned > 0
    || app.repeatFatigue?.hasFatigue
    || app.cookingTimeLearning?.samples > 0
    || hasPerishability;

  if (!hasSignals) return null;

  return (
    <Section title="Plan with what’s real" className="rise rise-2">
      <Card className="!p-3 space-y-3">
        {app.useSoonIngredients?.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Use first</p>
              <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--warn, #a55a12)' }}>{app.useSoonIngredients.length} ingredient{app.useSoonIngredients.length === 1 ? '' : 's'}</span>
            </div>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.useSoonIngredients.slice(0, 4).map((row) => `${row.item.name}${row.daysLeft !== null ? ` · ${row.daysLeft <= 0 ? 'today' : `${row.daysLeft}d`}` : ''}`).join(' · ')}
              {app.useSoonIngredients.length > 4 ? ' · …' : ''}
            </p>
            {showUseItUp && (
              <ul className="mt-2 space-y-1.5" aria-label="Meals that use these ingredients">
                {useItUp.map(({ recipe, used, coverage }) => (
                  <li key={recipe.id || recipe.name}>
                    <button
                      type="button"
                      onClick={() => openRecipe(recipe)}
                      className="press flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left"
                      style={{ borderColor: 'var(--line)' }}
                      aria-label={`Open ${recipe.name}, uses ${used.join(', ')}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.78125rem] font-extrabold">{recipe.name}</span>
                        <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                          Uses {used.slice(0, 3).join(', ')}{used.length > 3 ? ' + more' : ''} · {coverage.pct}% in your kitchen{Number(recipe.time) ? ` · ${formatCookTime(recipe.time)}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {app.leftoverAwareness?.length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Leftover awareness</p>
            <ul className="mt-2 space-y-1.5" aria-label="Saved leftover portions">
              {app.leftoverAwareness.slice(0, 3).map((row) => (
                <li key={row.item.id || row.item.name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {row.item.name} · {row.item.portions} portion{row.item.portions === 1 ? '' : 's'}{row.daysLeft !== null ? ` · ${row.daysLeft <= 0 ? 'use today' : `${row.daysLeft}d left`}` : ''}
                  </span>
                  {typeof app.useLeftover === 'function' && (
                    <button
                      type="button"
                      onClick={() => app.useLeftover(row.item.id)}
                      className="press shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] font-extrabold"
                      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      aria-label={`Eat a portion of ${row.item.name}`}
                    >
                      Eat one
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasPerishability && (
          <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Perishability</p>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {perishability.soon > 0 ? `${perishability.soon} need using soon` : 'No items due soon'}
              {perishability.past > 0 ? ` · ${perishability.past} past its recorded date` : ''}
              {perishability.unknown > 0 ? ` · ${perishability.unknown} without a date` : ''}.
            </p>
          </div>
        )}
        {app.wasteProfile?.repeated?.length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Learned waste pattern</p>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.wasteProfile.repeated.slice(0, 3).map((row) => `${row.name} binned ${row.count} times`).join(' · ')}. The generator now favours plans that use these fully or avoids buying a remainder.
            </p>
          </div>
        )}
        {adherence.planned > 0 && (
          <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.75rem] font-bold uppercase tracking-wide">Meal plan adherence</p>
              <Pill tone={adherence.rate >= 75 ? 'good' : 'muted'}>{adherence.rate}%</Pill>
            </div>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {adherence.completed} of {adherence.planned} planned meal{adherence.planned === 1 ? '' : 's'} completed this week · {adherence.pending} still open.
            </p>
            {pendingToday.map((row) => (
              <div key={`${row.date}-${row.slot}`} className="rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.78125rem] font-bold truncate">{row.recipe?.name || row.recipeId}</p>
                  <button
                    type="button"
                    onClick={() => setSkipping(skipping === `${row.date}|${row.slot}` ? null : `${row.date}|${row.slot}`)}
                    className="press shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] font-extrabold"
                    style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                  >
                    Skip
                  </button>
                </div>
                {skipping === `${row.date}|${row.slot}` && (
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Why skip ${row.recipe?.name || row.recipeId}`}>
                    {SKIP_REASONS.map((reason) => (
                      <button
                        type="button"
                        key={reason.id}
                        onClick={() => { app.markMealPlanOutcome({ date: row.date, slot: row.slot, status: 'skipped', reason: reason.id }); setSkipping(null); }}
                        className="press rounded-full border px-2 py-1 text-[0.65625rem] font-bold"
                        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                      >
                        {reason.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {skippedRows.slice(-2).map((row) => (
              <p key={`${row.date}-${row.slot}-skipped`} className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {row.recipe?.name || row.recipeId} skipped: {skipReasonLabel(row.reason)}.
              </p>
            ))}
          </div>
        )}
        {app.repeatFatigue?.hasFatigue && (
          <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide">Repeat fatigue</p>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.repeatFatigue.fatigued.slice(0, 2).map((row) => `${row.recipe?.name || row.recipeId} ${row.count} times`).join(' · ')} — consider a fresh swap.
            </p>
          </div>
        )}
        {app.cookingTimeLearning?.samples > 0 && (
          <div className="border-t pt-3 flex items-start gap-2" style={{ borderColor: 'var(--line)' }}>
            <Clock3 size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Cooking-time learning: your logged meals average {app.cookingTimeLearning.averageMins} minute{app.cookingTimeLearning.averageMins === 1 ? '' : 's'} across {app.cookingTimeLearning.samples} cook{app.cookingTimeLearning.samples === 1 ? '' : 's'}.
            </p>
          </div>
        )}
      </Card>
    </Section>
  );
}
