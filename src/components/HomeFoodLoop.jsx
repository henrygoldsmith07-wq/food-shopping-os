import { Package } from 'lucide-react';
import { Card, Pill } from './ui.jsx';

/**
 * Where you are in this week's loop — plan, shop, cook — and the one thing to
 * do next.
 *
 * The step counts are real: meals actually planned, shops actually recorded,
 * meals actually cooked. That is why the card can say "start with a plan" to
 * someone who has done nothing without it reading as a scold — it is a
 * description of the week, not a target missed.
 */
export default function HomeFoodLoop({ app, foodLoop, expiring, low, goTab, openPantry }) {
  return (
    <section className="px-5 rise rise-1" aria-labelledby="food-loop-title">
      <Card className="!p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="food-loop-title" className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              This week’s food loop
            </p>
            <p className="mt-1 text-[1rem] font-extrabold tracking-tight">
              {foodLoop.next === 'plan' && 'Start with a plan'}
              {foodLoop.next === 'shop' && 'Your list is ready'}
              {foodLoop.next === 'cook' && 'Your next meal is waiting'}
              {foodLoop.next === 'steady' && 'Keep the week moving'}
            </p>
          </div>
          <Pill tone={foodLoop.steps.filter((step) => step.done).length === 3 ? 'good' : 'muted'}>
            {foodLoop.steps.filter((step) => step.done).length}/3
          </Pill>
        </div>
        <details className="mt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
            <span>Week progress</span>
            <span style={{ color: 'var(--muted)' }}>{foodLoop.steps.filter((step) => step.done).length}/3 complete</span>
          </summary>
          {/* Three equal cells stay available on demand, rather than competing with today's action. */}
          <div className="mt-2 grid grid-cols-3 gap-2" aria-label="Weekly plan, shop and cook progress">
            {foodLoop.steps.map((step) => (
              <div
                key={step.id}
                className="min-w-0 rounded-xl border px-2.5 py-2 text-center"
                style={{
                  borderColor: step.done ? 'var(--good)' : 'var(--line)',
                  background: step.done ? 'color-mix(in srgb, var(--good) 8%, transparent)' : 'var(--card-2)',
                }}
              >
                <p className="text-[0.75rem] font-extrabold [overflow-wrap:anywhere]">{step.done ? '✓ ' : ''}{step.label}</p>
                <p className="text-[0.65625rem] font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--muted)' }}>
                  {step.id === 'plan' ? `${foodLoop.plannedMeals} meal${foodLoop.plannedMeals === 1 ? '' : 's'}`
                    : step.id === 'shop' ? `${foodLoop.shops} shop${foodLoop.shops === 1 ? '' : 's'}`
                      : `${foodLoop.cookedMeals} cooked`}
                </p>
              </div>
            ))}
          </div>
        </details>
        <button
          type="button"
          onClick={() => goTab(foodLoop.next === 'shop' ? 'shop' : 'plan')}
          className="press mt-3 w-full rounded-xl px-3.5 py-2.5 text-[0.78125rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {foodLoop.next === 'plan' ? 'Plan this week'
            : foodLoop.next === 'shop' ? 'Open shopping list'
              : foodLoop.next === 'cook' ? 'Open today’s plan' : 'Review this week'}
        </button>
        {app.pantry.length === 0 && !app.starterRecipeIds.length && (
          <button
            type="button"
            onClick={openPantry}
            className="press mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[0.75rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            <Package size={13} /> Add what’s in your cupboards
          </button>
        )}
        {(expiring.length > 0 || low.length > 0) && (
          <button
            type="button"
            onClick={openPantry}
            className="press mt-2 w-full rounded-xl border px-3.5 py-2.5 text-[0.75rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            Review pantry · {expiring.length + low.length} item{expiring.length + low.length === 1 ? '' : 's'} need attention
          </button>
        )}
      </Card>
    </section>
  );
}
