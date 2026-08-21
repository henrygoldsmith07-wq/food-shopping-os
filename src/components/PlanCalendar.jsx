import { ChefHat, GripVertical, Snowflake } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { byId } from '../data/recipes.js';
import { MEAL_SLOTS, WEEK_DAYS } from '../data/plan.js';
import { planCost } from '../lib/kitchen.js';
import { Card, FoodArt, Pill } from './ui.jsx';

/**
 * The calendar itself, as a week of meal slots or a month of days.
 *
 * A planned meal can be moved two ways, because a plan gets rearranged on a
 * phone as often as on a desktop: drag it (HTML5 drag-and-drop), or press its
 * grip to pick it up and tap where it goes. Both call the same `onMove`.
 */

const dayNumber = (date) => Number(date.slice(8, 10));

/** A slot that can be dropped onto — empty or filled. */
const dropProps = (target, onMove, setDragging, dragging) => ({
  onDragOver: (e) => { e.preventDefault(); },
  onDrop: (e) => {
    e.preventDefault();
    const from = dragging;
    setDragging(null);
    if (from) onMove(from, target);
  },
});

export function WeekGrid({
  dates, plan, today, leftoverPortions, onPick, moving, onGrab, onMove, dragging, setDragging,
  busyDates, onCook,
}) {
  const busy = busyDates instanceof Set ? busyDates : new Set(busyDates || []);
  return (
    <div className="space-y-2.5">
      {dates.map((date, i) => {
        const slots = plan[date] || {};
        const isToday = date === today;
        const isBusy = busy.has(date);
        return (
          <Card
            key={date}
            className="!p-3"
            style={isBusy
              ? { borderColor: 'var(--warn, #a55a12)', background: 'color-mix(in srgb, var(--warn, #a55a12) 6%, var(--card))' }
              : isToday ? { borderColor: 'var(--accent)' } : undefined}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-extrabold text-[0.875rem]">
                {WEEK_DAYS[i % 7]}
                <span className="ml-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--faint)' }}>
                  {dayNumber(date)}
                </span>
                {isToday && <span className="ml-2 text-[0.6875rem] font-bold" style={{ color: 'var(--accent)' }}>Today</span>}
                {isBusy && (
                  <span className="ml-2 text-[0.6875rem] font-bold" style={{ color: 'var(--warn, #a55a12)' }} title="Busy evening from calendar">
                    Busy evening
                  </span>
                )}
              </p>
              {planCost(slots) > 0 && <Pill tone="muted">{gbp(planCost(slots), { always: true })}/person</Pill>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MEAL_SLOTS.map(({ key, label }) => {
                const recipe = slots[key] ? byId(slots[key]) : null;
                const target = { date, slot: key };
                const armed = moving && (moving.date !== date || moving.slot !== key);
                const fromFridge = recipe && (leftoverPortions.get(recipe.id) || 0) > 0;
                return recipe ? (
                  <div
                    key={key}
                    draggable
                    onDragStart={(e) => {
                      setDragging(target);
                      e.dataTransfer?.setData?.('text/plain', `${date}|${key}`);
                    }}
                    onDragEnd={() => setDragging(null)}
                    {...dropProps(target, onMove, setDragging, dragging)}
                    className="relative rounded-xl p-2 text-left"
                    style={{
                      background: 'var(--card-2)',
                      outline: armed ? '1.5px dashed var(--accent)' : 'none',
                    }}
                  >
                    <button
                      onClick={() => (moving ? onMove(moving, target) : onPick(target))}
                      className="press block w-full text-left"
                    >
                      <FoodArt recipe={recipe} className="h-8 w-full rounded-lg" />
                      <p className="mt-1 text-[0.6875rem] font-bold leading-tight line-clamp-2">{recipe.name}</p>
                      {fromFridge && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[0.625rem] font-bold" style={{ color: 'var(--good)' }}>
                          <Snowflake size={10} /> leftovers
                        </p>
                      )}
                    </button>
                    <button
                      onClick={() => onGrab(target)}
                      aria-label={`Move ${recipe.name}`}
                      className="press absolute top-1 right-1 rounded-md p-0.5"
                      style={{ color: 'var(--faint)' }}
                    >
                      <GripVertical size={13} />
                    </button>
                    <button
                      onClick={() => onCook?.(recipe)}
                      aria-label={`Cook ${recipe.name} now`}
                      className="press mt-1 inline-flex items-center gap-1 text-[0.625rem] font-extrabold"
                      style={{ color: 'var(--accent)' }}
                    >
                      <ChefHat size={11} /> Cook now
                    </button>
                  </div>
                ) : (
                  <button
                    key={key}
                    onClick={() => (moving ? onMove(moving, target) : onPick(target))}
                    {...dropProps(target, onMove, setDragging, dragging)}
                    className="press rounded-xl p-2 flex flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold min-h-[60px]"
                    style={{
                      background: 'var(--card-2)',
                      color: 'var(--faint)',
                      outline: moving ? '1.5px dashed var(--accent)' : 'none',
                    }}
                  >
                    + {label}
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * A month at a glance. Each day shows what's planned as initials of its meals;
 * dropping a dragged meal on a day keeps its slot and changes the date.
 */
export function MonthGrid({ cells, plan, today, onOpenDay, moving, onMove, dragging, setDragging }) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {WEEK_DAYS.map((d) => (
          <p key={d} className="text-center text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            {d[0]}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ date, inMonth }) => {
          const slots = plan[date] || {};
          const meals = MEAL_SLOTS.map(({ key }) => (slots[key] ? byId(slots[key]) : null));
          const filled = meals.filter(Boolean).length;
          const target = { date, slot: moving?.slot || dragging?.slot || 'dinner' };
          return (
            <button
              key={date}
              onClick={() => (moving ? onMove(moving, target) : onOpenDay(date))}
              {...dropProps(target, onMove, setDragging, dragging)}
              className="press rounded-xl p-1 flex flex-col items-center gap-1 min-h-[52px] border"
              style={{
                background: inMonth ? 'var(--card)' : 'transparent',
                borderColor: date === today ? 'var(--accent)' : 'var(--line)',
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <span
                className="text-[0.6875rem] font-extrabold leading-none pt-0.5"
                style={{ color: date === today ? 'var(--accent)' : 'var(--ink)' }}
              >
                {dayNumber(date)}
              </span>
              <span className="flex flex-wrap justify-center gap-0.5">
                {meals.map((r, i) => (r ? (
                  <FoodArt key={i} recipe={r} className="h-3 w-3 rounded-full" />
                ) : null))}
              </span>
              {filled === 3 && (
                <span className="h-1 w-1 rounded-full" style={{ background: 'var(--good)' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
