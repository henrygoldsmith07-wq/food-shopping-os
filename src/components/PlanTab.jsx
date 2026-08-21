import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, ClipboardList, Info, Move, ShoppingCart, Snowflake,
  Sparkles, X,
} from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { useApp } from '../lib/store.jsx';
import { byId } from '../data/recipes.js';
import { MEAL_SLOTS } from '../data/plan.js';
import { weekDates } from '../lib/kitchen.js';
import {
  batchGroups, coveredByLeftovers, monthDates, monthGrid, monthLabel, planStats,
  mealPlanIcs, shiftMonth, shiftWeek, shoppingForPlan, weekOffset,
} from '../lib/mealplan.js';
import { prepChecklist, prepProgress } from '../lib/prep-checklist.js';
import { downloadFile } from '../lib/notify.js';
import { filterByDiet } from '../lib/goals.js';
import { monthOf, seasonalHits } from '../data/seasons.js';
import { tasteScore } from '../lib/taste.js';
import { Section, Card, Chip, Pill, Sheet, FoodArt } from './ui.jsx';
import { MonthGrid, WeekGrid } from './PlanCalendar.jsx';
import PlanGenerator from './PlanGenerator.jsx';
import PrimaryAction from './PrimaryAction.jsx';
import CalendarAvailability from './CalendarAvailability.jsx';
import MonthMealRow from './MonthMealRow.jsx';
import PlanningSignals from './PlanningSignals.jsx';

const dayLabel = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Pick a recipe for one slot. Defaults to dishes for that meal — breakfasts for
 * a breakfast slot — filtered by everyone's dietary patterns, favourites first,
 * with what's in season and what your pantry covers called out.
 */
function RecipePicker({ slot, onPick, onClear, hasMeal }) {
  const app = useApp();
  const [query, setQuery] = useState('');
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
          {list.length} {anyMeal || query ? 'recipes' : `${slot} recipes`}
          {app.planDiets.length ? ' that fit your diet' : ''}
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
export default function PlanTab({ openRecipe, goTab, focusDate }) {
  const app = useApp();
  const [view, setView] = useState('week');
  const [offset, setOffset] = useState(0); // weeks or months from today
  const [picking, setPicking] = useState(null); // {date, slot}
  const [openDay, setOpenDay] = useState(null); // month view → a day's slots
  const [moving, setMoving] = useState(null); // meal picked up by tap
  const [dragging, setDragging] = useState(null); // meal picked up by drag
  const [showGenerator, setShowGenerator] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState('');
  const [prepDone, setPrepDone] = useState([]);
  useEffect(() => { if (focusDate) { setView('week'); setOffset(weekOffset(app.day, focusDate)); } }, [focusDate, app.day]);

  const anchorWeek = shiftWeek(app.day, offset);
  const anchorMonth = shiftMonth(app.day, offset);
  const week = useMemo(() => weekDates(anchorWeek), [anchorWeek]);
  const month = useMemo(() => monthDates(anchorMonth), [anchorMonth]);
  const cells = useMemo(() => monthGrid(anchorMonth), [anchorMonth]);
  const dates = view === 'week' ? week : month;

  const stats = planStats(app.plan, dates, { people: app.portions });
  const covered = coveredByLeftovers(app.plan, dates, app.pantry);
  const batches = batchGroups(app.plan, dates, { people: app.portions });
  const thisWeekDates = useMemo(() => weekDates(app.day), [app.day]);
  const prepSteps = useMemo(() => prepChecklist(app.plan, dates), [app.plan, dates]);
  const prep = prepProgress(prepSteps, prepDone);
  const rangeLabel = view === 'week'
    ? (offset === 0 ? 'This week' : `Week of ${Number(anchorWeek.slice(8, 10))} ${new Date(`${anchorWeek}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' })}`)
    : monthLabel(anchorMonth);

  const move = (from, to) => {
    app.moveMealSlot(from, to);
    setMoving(null);
    setDragging(null);
  };
  const clearRangeStatus = () => { setAddedToList(false); setCalendarStatus(''); };
  const sendToList = () => {
    if (addedToList) {
      goTab?.('shop');
      return;
    }
    app.addToList(shoppingForPlan(app.plan, dates, { pantry: app.pantry }));
    setAddedToList(true);
  };

  const exportCalendar = () => {
    const { text, events } = mealPlanIcs(app.plan, dates, {
      calendarName: `Forq · ${rangeLabel}`,
    });
    const downloaded = downloadFile(
      `forq-meals-${dates[0]}-${dates.at(-1)}.ics`,
      text,
    );
    setCalendarStatus(downloaded
      ? `${events} meal${events === 1 ? '' : 's'} exported.`
      : 'Calendar export is unavailable in this browser.');
  };

  return (
    <div className="pb-6 space-y-6">
      <div className="hero-gradient px-5 pt-1 pb-3">
        <p className="text-[0.84375rem] font-semibold rise rise-1" style={{ color: 'var(--muted)' }}>
          {stats.meals
            ? `${stats.meals} meal${stats.meals === 1 ? '' : 's'} planned · about ${gbp(stats.cost, { always: true })} for ${app.portions} ${view === 'week' ? 'this week' : 'this month'}`
            : 'Tap any slot to plan a meal, or let the generator fill the week.'}
        </p>
      </div>

      <Section className="rise rise-1">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex gap-2">
            <Chip active={view === 'week'} onClick={() => { setView('week'); setOffset(0); clearRangeStatus(); }}>Week</Chip>
            <Chip active={view === 'month'} onClick={() => { setView('month'); setOffset(0); clearRangeStatus(); }}>Month</Chip>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setOffset((o) => o - 1); clearRangeStatus(); }}
              aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => { setOffset(0); clearRangeStatus(); }}
              className="tap press shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.78125rem] font-extrabold"
              style={{ background: offset ? 'var(--card-2)' : 'transparent', color: offset ? 'var(--ink)' : 'var(--faint)' }}
            >
              {offset ? 'Today' : rangeLabel}
            </button>
            <button
              onClick={() => { setOffset((o) => o + 1); clearRangeStatus(); }}
              aria-label={view === 'week' ? 'Next week' : 'Next month'}
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        {offset !== 0 && (
          <p className="mb-2 text-[0.78125rem] font-bold" style={{ color: 'var(--muted)' }}>{rangeLabel}</p>
        )}
        {moving && (
          <Card className="!p-3 mb-2.5 flex items-center justify-between gap-2" style={{ borderColor: 'var(--accent)' }}>
            <p className="text-[0.78125rem] font-bold inline-flex items-center gap-1.5">
              <Move size={14} style={{ color: 'var(--accent)' }} />
              Moving {byId((app.plan[moving.date] || {})[moving.slot])?.name} — tap where it goes
            </p>
            <button onClick={() => setMoving(null)} className="press text-[0.78125rem] font-extrabold" style={{ color: 'var(--muted)' }}>
              Cancel
            </button>
          </Card>
        )}
        {view === 'week' ? (
          <WeekGrid
            dates={week}
            plan={app.plan}
            today={app.day}
            leftoverPortions={app.leftoverPortions}
            onPick={setPicking}
            moving={moving}
            onGrab={setMoving}
            onMove={move}
            dragging={dragging}
            setDragging={setDragging}
            busyDates={(app.calendarBusy || []).map((b) => b.date)}
            onCook={(recipe) => { setMoving(null); setDragging(null); openRecipe?.(recipe, { startCooking: true }); }}
          />
        ) : (
          <MonthGrid
            cells={cells}
            plan={app.plan}
            today={app.day}
            onOpenDay={setOpenDay}
            moving={moving}
            onMove={move}
            dragging={dragging}
            setDragging={setDragging}
          />
        )}

        <CalendarAvailability dates={dates} />
        {prepSteps.length > 0 && (
          <Section className="mt-4 rise" title="Prep checklist">
            <Card className="!p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[0.75rem] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                  <ClipboardList size={14} /> {prep.complete}/{prep.total} done · {prep.pct}%
                </p>
                {prep.complete > 0 && (
                  <button
                    type="button"
                    className="text-[0.7rem] font-extrabold"
                    style={{ color: 'var(--muted)' }}
                    onClick={() => setPrepDone([])}
                  >
                    Reset
                  </button>
                )}
              </div>
              <ul className="space-y-1.5">
                {prepSteps.map((step) => {
                  const done = prepDone.includes(step.id);
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => setPrepDone((ids) => (
                          done ? ids.filter((id) => id !== step.id) : [...ids, step.id]
                        ))}
                        className="press flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left"
                        style={{
                          borderColor: done ? 'var(--good)' : 'var(--line)',
                          background: done ? 'color-mix(in srgb, var(--good) 8%, transparent)' : 'var(--card-2)',
                        }}
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                          style={{ borderColor: done ? 'var(--good)' : 'var(--line)', color: 'var(--good)' }}
                        >
                          {done ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-[0.8125rem] font-bold ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--muted)' : 'var(--ink)' }}>
                            {step.label}
                          </span>
                          {step.detail && (
                            <span className="block text-[0.7rem] font-semibold" style={{ color: 'var(--faint)' }}>{step.detail}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        )}
        {stats.meals > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ['Meals', stats.meals],
              ['Cost', gbp(stats.cost, { always: true })],
              ['Kcal/day', stats.kcalPerDay || '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl py-2 text-center" style={{ background: 'var(--card-2)' }}>
                <p className="text-[0.9375rem] font-extrabold">{value}</p>
                <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
              </div>
            ))}
          </div>
        )}
        {stats.meals > 0 && (
          <div className="mt-3 space-y-2">
            <button
              onClick={sendToList}
              className="press w-full rounded-2xl border py-3 text-[0.875rem] font-extrabold"
              style={addedToList
                ? { borderColor: 'var(--good)', color: 'var(--good)' }
                : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              <span className="inline-flex items-center gap-2">
                <ShoppingCart size={15} />
                {addedToList
                  ? 'Review shopping list'
                  : view === 'week'
                    ? "Send this week's ingredients to the list"
                    : "Send this month's ingredients to the list"}
              </span>
            </button>
            <button
              onClick={exportCalendar}
              aria-label={`Add ${view} to calendar`}
              className="press w-full rounded-2xl border py-3 text-[0.875rem] font-extrabold"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              <span className="inline-flex items-center gap-2">
                <CalendarPlus size={15} /> Export {view} to calendar (.ics)
              </span>
            </button>
            {calendarStatus && (
              <p role="status" className="text-center text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {calendarStatus}
              </p>
            )}
            <button
              onClick={() => { app.clearPlanWeek(dates); setAddedToList(false); }}
              className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              Clear {view === 'week' ? 'week' : 'month'}
            </button>
          </div>
        )}
      </Section>
      <PlanningSignals app={app} />
      {app.leftovers.length > 0 && (
        <Section title="Leftovers" className="rise rise-2">
          <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
            {app.leftovers.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <Snowflake size={16} style={{ color: 'var(--muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[0.875rem] truncate">{item.name}</p>
                  <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {item.portions} portion{item.portions === 1 ? '' : 's'} · best by {item.expiry}
                  </p>
                </div>
                <button
                  onClick={() => app.useLeftover(item.id)}
                  className="press rounded-full border px-3 py-1.5 text-[0.75rem] font-extrabold"
                  style={{ borderColor: 'var(--line)' }}
                >
                  Ate one
                </button>
              </div>
            ))}
          </Card>
          {covered.length > 0 && (
            <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {covered.length} planned meal{covered.length === 1 ? '' : 's'} already covered — the shopping list skips {covered.length === 1 ? 'it' : 'them'}.
            </p>
          )}
        </Section>
      )}
      {batches.length > 0 && (
        <Section title="Batch cooking" className="rise rise-2">
          <Card className="space-y-3">
            {batches.map(({ recipe, cookOn, covers, portions, batches: n, saves }) => (
              <div key={recipe.id} className="flex items-start gap-3">
                <FoodArt recipe={recipe} className="h-11 w-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[0.875rem]">{recipe.name}</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    Cook {n > 1 ? `${n} batches ` : ''}on {dayLabel(cookOn)} — {portions} portions, covering {covers.length} more meal{covers.length === 1 ? '' : 's'}.
                  </p>
                </div>
                <Pill tone="good">saves ~{saves} min</Pill>
              </div>
            ))}
          </Card>
        </Section>
      )}
      <Section className="rise rise-2">
        <button
          onClick={() => setShowGenerator((v) => !v)}
          className="press w-full rounded-2xl border py-3 text-[0.875rem] font-extrabold"
          style={showGenerator ? { borderColor: 'var(--line)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-2">
            {showGenerator ? <><X size={15} /> Close generator</> : <><Sparkles size={15} /> Generate a plan for me</>}
          </span>
        </button>
      </Section>
      {showGenerator && (
        <Section className="rise">
          <PlanGenerator
            weekDates={view === 'week' ? week : thisWeekDates}
            monthDates={month}
            openRecipe={openRecipe}
            goTab={goTab}
            onApplied={() => { setShowGenerator(false); setAddedToList(false); }}
          />
        </Section>
      )}
      <Sheet open={!!picking} onClose={() => setPicking(null)} title="Plan a meal">
        {picking && (
          <RecipePicker
            slot={picking.slot}
            hasMeal={!!(app.plan[picking.date] || {})[picking.slot]}
            onPick={(id) => { app.setPlanSlot(picking.date, picking.slot, id); setPicking(null); setAddedToList(false); }}
            onClear={() => { app.setPlanSlot(picking.date, picking.slot, null); setPicking(null); }}
          />
        )}
      </Sheet>
      <Sheet open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? dayLabel(openDay) : ''}>
        {openDay && (
          <div className="px-5 pb-10 space-y-2.5">
            {MEAL_SLOTS.map(({ key, label }) => (
              <MonthMealRow
                key={key}
                label={label}
                recipe={byId((app.plan[openDay] || {})[key])}
                onEdit={() => { setPicking({ date: openDay, slot: key }); setOpenDay(null); }}
                onCook={(recipe) => { setOpenDay(null); setMoving(null); setDragging(null); openRecipe?.(recipe, { startCooking: true }); }}
              />
            ))}
            <p className="pt-1 text-[0.78125rem] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              <Info size={13} /> Drag a meal in the week view to move it, or use its grip to pick it up.
            </p>
          </div>
        )}
      </Sheet>
      {view === 'month' && !stats.meals && (
        <Section className="rise">
          <Card className="flex items-center gap-3 !p-3">
            <CalendarDays size={18} style={{ color: 'var(--muted)' }} />
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Nothing planned this month yet — tap a day to fill it, or generate a month in one go.
            </p>
          </Card>
        </Section>
      )}
      {stats.meals === 0
        ? <PrimaryAction label={`Fill this ${view} for me`} onClick={() => setShowGenerator(true)} />
        : <PrimaryAction
            label={addedToList ? 'Added to your shopping list' : `Shop for this ${view}`}
            hint={addedToList ? undefined : `${stats.meals} meal${stats.meals === 1 ? '' : 's'}`}
            onClick={sendToList}
          />}
    </div>
  );
}
