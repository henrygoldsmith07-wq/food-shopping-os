import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChefHat, Package, ShoppingCart, Snowflake, Sparkles,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { byId } from '../data/recipes.js';
import { WEEK_LOOP_PROMISE, WEEK_LOOP_STAGES, weekLoopStageOf } from '../data/weekLoop.js';
import { expiringSoon, weekDates } from '../lib/kitchen.js';
import { planEntries, planVariety } from '../lib/mealplan.js';
import {
  nextWeekLoopStage,
  prevWeekLoopStage,
  weekLoopSnapshot,
} from '../lib/week-loop.js';
import { gbp } from '../lib/utils.js';
import { Card, Chip, FoodArt, Pill, Stepper, Toggle } from './ui.jsx';
import WeekLoopPlan from './WeekLoopPlan.jsx';

const dayShort = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

/**
 * One guided end-to-end Forq loop, in four stages:
 *
 *   Prepare → Shop → Put away → Cook
 *
 * The ten internal hand-offs (plan, portions, pantry, list, prices, shop,
 * stock, cook, leftovers, reuse) still run — they are grouped under the stage
 * whose screen they serve and summarised there instead of being clicked
 * through one by one. Portion scaling, pantry deduction, list derivation and
 * waste learning all happen automatically in Prepare; the household only
 * makes the decisions that need a human.
 */
export default function WeekLoop({ onClose, onCook, initialStep }) {
  const app = useApp();
  const snap = useMemo(() => weekLoopSnapshot(app), [app]);
  const [stageId, setStageId] = useState(() => weekLoopStageOf(initialStep || snap.nextStageId || 'prepare'));
  const [storeName, setStoreName] = useState('');
  const [toPantry, setToPantry] = useState(true);
  const [status, setStatus] = useState('');
  const [pickerDate, setPickerDate] = useState(null);

  const stageIndex = WEEK_LOOP_STAGES.findIndex((s) => s.id === stageId);
  const stage = WEEK_LOOP_STAGES[stageIndex] || WEEK_LOOP_STAGES[0];
  const dates = snap.dates;
  // Dishes that use something going off are offered first — the pantry's
  // urgency is the week's plan.
  const expiringNames = useMemo(
    () => expiringSoon(app.pantry, 3, app.day).map((p) => p.name.toLowerCase()),
    [app.pantry, app.day],
  );
  const dinnerRecipes = useMemo(() => {
    const pool = app.safeRecipes.filter((r) => r.meal === 'dinner' || !r.meal);
    const hitCount = (r) => (r.ingredients || []).filter((i) => {
      const name = String(i.name || i).toLowerCase();
      return expiringNames.some((n) => name.includes(n) || n.includes(name));
    }).length;
    return [...pool].sort((a, b) => hitCount(b) - hitCount(a)).slice(0, 40);
  }, [app.safeRecipes, expiringNames]);
  const variety = useMemo(() => planVariety(app.plan, dates), [app.plan, dates]);

  const goNext = () => {
    const n = nextWeekLoopStage(stageId);
    if (n) {
      setStageId(n.id);
      setStatus('');
    } else {
      onClose?.();
    }
  };
  const goBack = () => {
    const p = prevWeekLoopStage(stageId);
    if (p) {
      setStageId(p.id);
      setStatus('');
    }
  };

  const usesExpiring = (r) => (r.ingredients || []).some((i) => {
    const name = String(i.name || i).toLowerCase();
    return expiringNames.some((n) => name.includes(n) || n.includes(name));
  });

  const setDinner = (date, recipeId) => {
    app.setPlanSlot(date, 'dinner', recipeId);
    setPickerDate(null);
  };

  const generateList = () => {
    // Exactly what the list step previewed: snap.listPreview is the one
    // pantry-subtracted, portion-scaled calculation (the same one PlanTab
    // and PlanGenerator's "Shop for it" now run), so the rows you read are
    // the rows that land on the shopping list — never a second derivation.
    const items = snap.listPreview;
    if (!items.length) {
      setStatus('Nothing to buy — pantry and leftovers already cover this plan.');
      return;
    }
    app.addToList(items);
    setStatus(`Added ${items.length} item${items.length === 1 ? '' : 's'} to your list.`);
  };

  const finishShop = () => {
    const bought = (app.shoppingList || []).filter((i) => i.checked);
    if (!bought.length) {
      setStatus('Tick items as you pick them up, then stock the pantry.');
      return;
    }
    const total = bought.reduce((s, i) => s + (Number(i.price) || 0), 0);
    app.recordShop({
      store: storeName.trim() || 'This shop',
      total,
      toPantry,
      location: 'Cupboard',
    });
    setStatus(toPantry
      ? `${bought.length} items recorded and added to the pantry.`
      : `${bought.length} items recorded.`);
  };

  const scheduleLeftover = (item) => {
    let target = null;
    for (const d of dates) {
      if (d < app.day) continue;
      const day = app.plan?.[d] || {};
      if (!day.dinner) {
        target = d;
        break;
      }
    }
    if (!target || !item.recipeId) {
      setStatus('No free dinner slot this week — open Plan to place it.');
      return;
    }
    app.setPlanSlot(target, 'dinner', item.recipeId);
    setStatus(`Scheduled ${item.name.replace(/ \(leftovers\)$/i, '')} for ${dayShort(target)}.`);
  };

  // One snapshot, one set of numbers: the pantry check, the list preview and
  // the portions decision all come from weekLoopSnapshot rather than being
  // re-derived here — the loop can never show a different week to the one it
  // generates.
  const pantry = snap.pantryCheck;
  const weekList = snap.listPreview;
  const portionSource = snap.portions;

  const planProps = {
    byId,
    dates,
    dayShort,
    dinnerRecipes,
    expiringNames,
    generateList,
    pantry,
    pickerDate,
    setDinner,
    setPickerDate,
    snap,
    usesExpiring,
    variety,
    weekList,
    portionSource,
  };

  return (
    <div className="pb-10">
      {/* Stage progress */}
      <div className="px-5 pb-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Week loop · stage {stage.n} of {WEEK_LOOP_STAGES.length}
        </p>
        <h2 className="mt-1 text-[1.25rem] font-extrabold tracking-tight">{stage.title}</h2>
        <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{stage.blurb}</p>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {WEEK_LOOP_STAGES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              title={s.title}
              onClick={() => setStageId(s.id)}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i <= stageIndex
                  ? 'var(--accent)'
                  : snap.stages.find((x) => x.id === s.id)?.done
                    ? 'color-mix(in srgb, var(--accent) 40%, var(--line))'
                    : 'var(--line)',
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {WEEK_LOOP_PROMISE}
        </p>
      </div>

      <div className="px-5 pt-4 space-y-3">
        {/* Prepare — the decisions (meals) plus the machinery Forq runs for
            you (portions, pantry subtraction, list derivation). One screen. */}
        {stageId === 'prepare' && (
          <>
            <WeekLoopPlan {...planProps} stepId="plan" />
            <WeekLoopPlan {...planProps} stepId="portions" />
            <WeekLoopPlan {...planProps} stepId="pantry" />
            <WeekLoopPlan {...planProps} stepId="list" />
          </>
        )}

        {stageId === 'shop' && (
          <>
            <Card>
              <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
                <ShoppingCart size={16} /> Aisle order
              </p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Tick as you go · {(app.shoppingList || []).filter((i) => i.checked).length} of {(app.shoppingList || []).length} done
              </p>
            </Card>
            {(app.shoppingList || []).length === 0 ? (
              <Card>
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  List is empty. Go back one stage to generate it from the plan.
                </p>
              </Card>
            ) : (
              snap.aisleGroups.map(([aisle, items]) => (
                <div key={aisle}>
                  <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                    {aisle}
                  </p>
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => app.toggleChecked(item.id)}
                        className="press flex w-full items-center gap-3 rounded-2xl border p-3 text-left"
                        style={{
                          borderColor: item.checked ? 'var(--accent)' : 'var(--line)',
                          background: item.checked ? 'var(--accent-soft)' : 'var(--card)',
                          opacity: item.checked ? 0.75 : 1,
                        }}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                          style={{
                            borderColor: item.checked ? 'var(--accent)' : 'var(--line)',
                            background: item.checked ? 'var(--accent)' : 'transparent',
                            color: item.checked ? 'var(--on-accent)' : 'transparent',
                          }}
                        >
                          <Check size={14} strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[0.875rem] font-extrabold ${item.checked ? 'line-through' : ''}`}>
                            {item.name}
                          </span>
                          {item.qty && (
                            <span className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{item.qty}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* Price intelligence is optional machinery: useful when the
                household has recorded shops, invisible when it hasn't. */}
            <details className="group">
              <summary
                className="flex cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
                style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
              >
                Prices you’ve paid
                <span className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  from your own receipts
                </span>
              </summary>
              <div className="mt-3">
                <WeekLoopPlan {...planProps} stepId="prices" />
              </div>
            </details>
          </>
        )}

        {stageId === 'putAway' && (
          <Card className="space-y-3">
            <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
              <Package size={16} /> Record shop → pantry
            </p>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {(app.shoppingList || []).filter((i) => i.checked).length} item
              {(app.shoppingList || []).filter((i) => i.checked).length === 1 ? '' : 's'} ticked.
              Recording moves them into shops and, if you want, the pantry.
            </p>
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Store</span>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Tesco"
                className="mt-1 w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-[0.875rem]">Add bought items to pantry</p>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Automatic stock update</p>
              </div>
              <Toggle label="Add to pantry" on={toPantry} onChange={() => setToPantry((v) => !v)} />
            </div>
            <button
              type="button"
              onClick={finishShop}
              className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Record shop & stock pantry
            </button>
          </Card>
        )}

        {stageId === 'cook' && (
          <>
            <Card>
              <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
                <ChefHat size={16} /> Planned meals ready to cook
              </p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Start cooking mode — steps, timers, then leftovers.
              </p>
            </Card>
            {(snap.plannedToday.length ? snap.plannedToday : planEntries(app.plan, dates).slice(0, 6)).map((entry) => (
              <Card key={`${entry.date}-${entry.slot}`} className="!p-3 flex items-center gap-3">
                <FoodArt recipe={entry.recipe} className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-[0.875rem] truncate">{entry.recipe?.name}</p>
                  <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {dayShort(entry.date)} · {entry.slot}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCook?.(entry.recipe)}
                  className="press shrink-0 rounded-xl px-3 py-2 text-[0.75rem] font-extrabold"
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                >
                  Cook
                </button>
              </Card>
            ))}
            {!snap.plannedToday.length && !planEntries(app.plan, dates).length && (
              <Card>
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  No meals on the plan yet — go back to Prepare and choose some.
                </p>
              </Card>
            )}

            {/* Leftovers and reuse are one capture, not two screens: save
                what's left, slot it into a free dinner, done. */}
            <Card className="space-y-2">
              <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
                <Snowflake size={16} /> Leftovers & what’s next
              </p>
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Save spare portions after cooking — the next plan uses the fridge first and buys less.
              </p>
              {(app.leftovers || []).length === 0 ? (
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  No leftovers yet — spare portions appear here after a cook, ready for the next plan.
                </p>
              ) : (
                (app.leftovers || []).map((item) => (
                  <div key={item.id} className="rounded-xl p-3" style={{ background: 'var(--card-2)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-[0.875rem] truncate">{item.name}</p>
                        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                          {item.portions || 1} portion{(item.portions || 1) === 1 ? '' : 's'}
                          {item.expiry ? ` · best by ${item.expiry}` : ''}
                        </p>
                      </div>
                      {item.recipeId && (
                        <button
                          type="button"
                          onClick={() => scheduleLeftover(item)}
                          className="press shrink-0 rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold"
                          style={{ borderColor: 'var(--line)' }}
                        >
                          <span className="inline-flex items-center gap-1"><Sparkles size={13} /> Slot into plan</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </>
        )}

        {status && (
          <p role="status" className="text-[0.78125rem] font-semibold" style={{ color: 'var(--accent)' }}>
            {status}
          </p>
        )}
      </div>

      {/* Footer nav — always clear next hand-off */}
      <div className="sticky bottom-0 mt-6 flex gap-2 border-t px-5 py-4" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>
        <button
          type="button"
          onClick={stageIndex === 0 ? onClose : goBack}
          className="press rounded-2xl border px-4 py-3.5 font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <ArrowLeft size={16} /> {stageIndex === 0 ? 'Close' : 'Back'}
          </span>
        </button>
        <button
          type="button"
          onClick={goNext}
          className="press flex-1 rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {stageIndex >= WEEK_LOOP_STAGES.length - 1 ? (
              <><Check size={16} strokeWidth={3} /> Done</>
            ) : (
              <>
                {WEEK_LOOP_STAGES[stageIndex + 1]?.short || 'Next'}
                <ArrowRight size={16} />
              </>
            )}
          </span>
        </button>
      </div>

      {/* Stage chips for jump (still one flow) */}
      <div className="px-5 pb-6 flex flex-wrap gap-1.5">
        {WEEK_LOOP_STAGES.map((s) => (
          <Chip key={s.id} active={s.id === stageId} onClick={() => setStageId(s.id)}>
            {s.n}. {s.short}
          </Chip>
        ))}
      </div>
    </div>
  );
}
