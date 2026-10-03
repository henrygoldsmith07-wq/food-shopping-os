import { useMemo, useState } from 'react';
import { ArrowRight, Check, Lock, RefreshCw, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { byId } from '../data/recipes.js';
import {
  autopilotWeekProposal,
  autopilotWeekSummary,
  regenerateProposalMeal,
} from '../lib/autopilot-week.js';
import { gbp } from '../lib/utils.js';
import { Card, FoodArt, Pill, Stepper } from './ui.jsx';
import { recordProductEvent } from '../lib/product-analytics.js';

const dayShort = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

/**
 * Autopilot Week — "Your week is ready".
 *
 * One screen that proposes the whole week with zero configuration and lets
 * the household steer it before anything is written: regenerate one meal,
 * lock one, mark a day as eating out, change people. Accepting writes through
 * the normal plan path (`applyPlanEntries`) so the plan, the list and the
 * loop see exactly the same week a hand-built plan would.
 */
export default function AutopilotWeek({ onAccept, onOpenRecipe }) {
  const app = useApp();
  const [seed, setSeed] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const [locked, setLocked] = useState(() => new Set());
  const [eatingOut, setEatingOut] = useState(() => new Set());
  const [peopleOverride, setPeopleOverride] = useState(null);
  const [status, setStatus] = useState('');

  const base = useMemo(() => autopilotWeekProposal(app, { seed }), [app, seed]);
  const proposal = useMemo(() => {
    if (!peopleOverride) return base;
    // People changed: rescale the same week rather than rerolling it — the
    // meals stay, only quantities follow.
    return { ...base, portions: peopleOverride, form: { ...base.form, people: peopleOverride } };
  }, [base, peopleOverride]);

  const summary = autopilotWeekSummary(proposal);
  const dates = proposal.model.planDates;

  const regenerateMeal = (date) => {
    if (locked.has(date)) return;
    const next = regenerateProposalMeal(app, proposal, date, {
      seed: seed + 1,
      exclude: [...locked].map((d) => proposal.plan?.[d]?.dinner).filter(Boolean),
    });
    if (!next) {
      setStatus('No alternative dinner found for that day — try "Not this week" instead.');
      return;
    }
    setSeed((s) => s + 1);
    setStatus(`${dayShort(date)} swapped to ${next.plan[date].dinner ? byId(next.plan[date].dinner)?.name : 'a new meal'}.`);
  };

  const toggleLock = (date) => {
    setLocked((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleEatingOut = (date) => {
    setEatingOut((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const acceptWeek = () => {
    const entries = proposal.entries.filter((e) => e?.recipeId && !eatingOut.has(e.date));
    app.applyPlanEntries(entries);
    recordProductEvent('autopilot_week_accepted', {
      meals: entries.length,
      people: proposal.portions,
      eatingOut: eatingOut.size,
    });
    setAccepted(true);
    setStatus('Week accepted — the list built itself from it.');
    onAccept?.(proposal);
  };

  if (accepted) {
    return (
      <Card className="space-y-2">
        <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
          <Check size={16} /> Your week is in the plan
        </p>
        <p className="text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          {proposal.stats.meals} dinners planned. The shopping list has been updated from it — pantry already subtracted.
        </p>
        {status && <p role="status" className="text-[0.75rem] font-semibold" style={{ color: 'var(--accent)' }}>{status}</p>}
      </Card>
    );
  }

  return (
    <section aria-label="Your week is ready">
      <Card className="!p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Sparkles size={16} />
          </span>
          <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Your week is ready</h2>
        </div>

        <ul className="space-y-1">
          {summary.map((line) => (
            <li key={line} className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              · {line}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
          <div>
            <p className="text-[0.78125rem] font-extrabold">Cooking for {proposal.portions}</p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Follows your recorded cooks</p>
          </div>
          <Stepper
            value={proposal.portions}
            min={1}
            max={12}
            onChange={(n) => setPeopleOverride(n)}
          />
        </div>
      </Card>

      <div className="mt-3 space-y-2">
        {dates.map((date) => {
          const recipeId = proposal.plan?.[date]?.dinner;
          const recipe = recipeId ? byId(recipeId) : null;
          const isOut = eatingOut.has(date);
          const isLocked = locked.has(date);
          return (
            <Card key={date} className="!p-3">
              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-[0.75rem] font-extrabold" style={{ color: 'var(--muted)' }}>
                  {dayShort(date)}
                </span>
                {isOut ? (
                  <p className="min-w-0 flex-1 text-[0.8125rem] font-bold" style={{ color: 'var(--muted)' }}>
                    Eating out
                  </p>
                ) : recipe ? (
                  <button
                    type="button"
                    onClick={() => onOpenRecipe?.(recipe)}
                    className="press min-w-0 flex-1 flex items-center gap-3 text-left"
                  >
                    <FoodArt recipe={recipe} className="h-10 w-10 shrink-0 rounded-xl" />
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] font-extrabold truncate">{recipe.name}</span>
                      <span className="block text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                        {recipe.time} min · {gbp(recipe.costPerServing, { always: true })}/serving
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="min-w-0 flex-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--faint)' }}>
                    No dinner needed
                  </p>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => regenerateMeal(date)}
                  disabled={isLocked || isOut}
                  className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold disabled:opacity-40"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <RefreshCw size={11} className="mr-1 inline" /> Swap
                </button>
                <button
                  type="button"
                  onClick={() => toggleLock(date)}
                  aria-pressed={isLocked}
                  className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                  style={{
                    borderColor: isLocked ? 'var(--accent)' : 'var(--line)',
                    color: isLocked ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  <Lock size={11} className="mr-1 inline" /> {isLocked ? 'Locked' : 'Lock'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleEatingOut(date)}
                  aria-pressed={isOut}
                  className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                  style={{
                    borderColor: isOut ? 'var(--accent)' : 'var(--line)',
                    color: isOut ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  <UtensilsCrossed size={11} className="mr-1 inline" /> {isOut ? 'Eating out' : 'Eat out'}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {status && (
        <p role="status" className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--accent)' }}>{status}</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={acceptWeek}
          className="press flex-1 rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Accept week <ArrowRight size={15} className="ml-1 inline" />
        </button>
        <button
          type="button"
          onClick={() => { setSeed((s) => s + 7); setStatus('A different week — everything except locked meals changed.'); }}
          className="press rounded-2xl border px-4 py-3.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <X size={14} className="mr-1 inline" /> Not this week
        </button>
      </div>
    </section>
  );
}
