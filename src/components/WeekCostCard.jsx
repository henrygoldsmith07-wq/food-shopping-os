import { Check, Layers, ShoppingCart } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { Card } from './ui.jsx';

const dayLetter = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' });

/**
 * The week at a glance (the Herbi card): what it costs, what that is per
 * serving, which nights have a dinner, and the two next moves — fill the
 * open nights, or send the week to the list. Every number comes from
 * planStats via weekCostSummary, so it matches the cost shown on each day.
 */
export default function WeekCostCard({
  summary, people, title = 'This week’s food', openNights = 0, onBuild, onAddToList, addedToList = false, aheadNextWeek = 0, onNextWeek,
}) {
  const { cost, meals, perServing, nights, dinnersPlanned } = summary;
  return (
    <Card className="rise rise-1" label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{title}</p>
          <p className="mt-0.5 text-[2rem] font-extrabold leading-none tabular-nums" data-testid="week-cost">
            {meals ? `about ${gbp(cost, { always: true })}` : gbp(0, { always: true })}
          </p>
          <p className="mt-1.5 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {meals
              ? `${meals} meal${meals === 1 ? '' : 's'} planned · about ${gbp(perServing, { always: true })} a serving for ${people}`
              : 'Tap any slot to plan a meal, swipe to fill the week, or let the generator do it.'}
            {aheadNextWeek > 0 && (
              <button type="button" onClick={onNextWeek} className="ml-1.5 font-bold underline" style={{ color: 'var(--accent)' }}>
                + {aheadNextWeek} more next week
              </button>
            )}
          </p>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label={`${dinnersPlanned} of ${nights.length} dinners planned`}>
        {nights.map((night) => (
          <li key={night.date} className="flex flex-col items-center gap-1" aria-hidden="true">
            <span
              className="grid h-8 w-full place-items-center rounded-xl"
              style={night.planned
                ? { background: 'var(--ink)', color: 'var(--card)' }
                : { background: 'var(--card-2)', border: '1px dashed var(--line)' }}
            >
              {night.planned && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>{dayLetter(night.date)}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onBuild}
          disabled={openNights === 0}
          className="press inline-flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-[0.8125rem] font-extrabold disabled:opacity-50"
          style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
        >
          <Layers size={15} /> {openNights === 0 ? 'Week is full' : `Swipe to fill ${openNights}`}
        </button>
        <button
          type="button"
          onClick={onAddToList}
          disabled={!meals}
          className="press inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-[0.8125rem] font-extrabold disabled:opacity-50"
          style={{ background: 'var(--ink)', color: 'var(--card)' }}
        >
          <ShoppingCart size={15} /> {addedToList ? 'Open the list' : 'Add week to list'}
        </button>
      </div>
    </Card>
  );
}
