import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChefHat, ClipboardList, Package, ShoppingCart, Snowflake, Sparkles,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { byId } from '../data/recipes.js';
import { WEEK_LOOP_PROMISE, WEEK_LOOP_STEPS } from '../data/weekLoop.js';
import { expiringSoon, weekDates } from '../lib/kitchen.js';
import { planEntries, planVariety } from '../lib/mealplan.js';
import {
  nextWeekLoopStep,
  pantryCheckForPlan,
  prevWeekLoopStep,
  shoppingForWeekLoop,
  weekLoopSnapshot,
} from '../lib/week-loop.js';
import { gbp } from '../lib/utils.js';
import { Card, Chip, FoodArt, Pill, Stepper, Toggle } from './ui.jsx';

const dayShort = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

/**
 * One guided end-to-end Forq loop. Every step hands straight to the next —
 * no hunting between unrelated tabs.
 */
export default function WeekLoop({ onClose, onCook, initialStep }) {
  const app = useApp();
  const snap = useMemo(() => weekLoopSnapshot(app), [app]);
  const [stepId, setStepId] = useState(initialStep || snap.nextStepId || 'plan');
  const [storeName, setStoreName] = useState('');
  const [toPantry, setToPantry] = useState(true);
  const [status, setStatus] = useState('');
  const [pickerDate, setPickerDate] = useState(null);

  const step = WEEK_LOOP_STEPS.find((s) => s.id === stepId) || WEEK_LOOP_STEPS[0];
  const stepIndex = WEEK_LOOP_STEPS.findIndex((s) => s.id === stepId);
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
    const n = nextWeekLoopStep(stepId);
    if (n) {
      setStepId(n.id);
      setStatus('');
    } else {
      onClose?.();
    }
  };
  const goBack = () => {
    const p = prevWeekLoopStep(stepId);
    if (p) {
      setStepId(p.id);
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
    const items = shoppingForWeekLoop(app, dates);
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

  const pantry = pantryCheckForPlan(app, dates);
  const weekList = shoppingForWeekLoop(app, dates);

  return (
    <div className="pb-10">
      {/* Progress */}
      <div className="px-5 pb-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Week loop · step {step.n} of {WEEK_LOOP_STEPS.length}
        </p>
        <h2 className="mt-1 text-[1.25rem] font-extrabold tracking-tight">{step.title}</h2>
        <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{step.blurb}</p>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {WEEK_LOOP_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              title={s.title}
              onClick={() => setStepId(s.id)}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i <= stepIndex
                  ? 'var(--accent)'
                  : snap.done[s.id]
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
        {stepId === 'plan' && (
          <>
            <Card>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                This week’s dinners
              </p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {snap.stats.meals
                  ? `${snap.stats.meals} meal${snap.stats.meals === 1 ? '' : 's'} planned`
                  : 'Tap a day to choose a dinner'}
                {snap.leftovers?.length
                  ? ` · ${snap.leftovers.length} leftover dish${snap.leftovers.length === 1 ? '' : 'es'} in the fridge`
                  : ''}
                {expiringNames.length
                  ? ` · ${expiringNames.length} item${expiringNames.length === 1 ? '' : 's'} going off soon`
                  : ''}
              </p>
              {variety.repeatedDishes.length > 0 && (
                <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--warn, #a55a12)' }}>
                  {variety.repeatedDishes[0].name} is on {variety.repeatedDishes[0].times} nights — vary it if you're tired of repeats.
                </p>
              )}
            </Card>
            <div className="space-y-2">
              {dates.map((date) => {
                const dinnerId = app.plan?.[date]?.dinner;
                const recipe = dinnerId ? byId(dinnerId) : null;
                const leftoverHit = recipe && (app.leftoverPortions?.get?.(recipe.id) || 0) > 0;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setPickerDate(pickerDate === date ? null : date)}
                    className="press flex w-full items-center gap-3 rounded-2xl border p-3 text-left"
                    style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
                  >
                    <span className="w-14 shrink-0 text-[0.75rem] font-extrabold" style={{ color: 'var(--muted)' }}>
                      {dayShort(date)}
                    </span>
                    {recipe ? (
                      <>
                        <FoodArt recipe={recipe} className="h-10 w-10 shrink-0 rounded-xl" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.875rem] font-extrabold truncate">{recipe.name}</span>
                          {leftoverHit && <Pill tone="good">Uses fridge leftover</Pill>}
                          {usesExpiring(recipe) && <Pill tone="warn">Uses something going off</Pill>}
                        </span>
                      </>
                    ) : (
                      <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--faint)' }}>
                        Choose dinner →
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {pickerDate && (
              <Card className="!p-0 max-h-64 overflow-y-auto divide-y" style={{ borderColor: 'var(--line)' }}>
                {dinnerRecipes.map((r) => {
                  const portions = app.leftoverPortions?.get?.(r.id) || 0;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setDinner(pickerDate, r.id)}
                      className="press flex w-full items-center gap-3 p-3 text-left"
                    >
                      <FoodArt recipe={r} className="h-9 w-9 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.8125rem] font-bold truncate">{r.name}</span>
                        <span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                          {r.time} min · {gbp(r.costPerServing, { always: true })}/serving
                        </span>
                      </span>
                      {usesExpiring(r) && <Pill tone="warn">Going off soon</Pill>}
                      {portions > 0 && <Pill tone="good">{portions} left</Pill>}
                    </button>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {stepId === 'portions' && (
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-extrabold text-[0.9375rem]">People you cook for</p>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Scales shopping quantities for this week’s list
                </p>
              </div>
              <Stepper
                value={app.household || 1}
                min={1}
                max={12}
                onChange={(n) => app.set({ household: n })}
              />
            </div>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Currently cooking for <strong>{app.portions || app.household || 1}</strong> portion
              {(app.portions || app.household || 1) === 1 ? '' : 's'} a meal
              {app.members?.length
                ? ` (${app.members.length} household profile${app.members.length === 1 ? '' : 's'})`
                : ''}
              .
            </p>
          </Card>
        )}

        {stepId === 'pantry' && (
          <>
            <Card>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[1.25rem] font-extrabold">{pantry.plannedMeals}</p>
                  <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Meals</p>
                </div>
                <div>
                  <p className="text-[1.25rem] font-extrabold">{pantry.leftoverMeals}</p>
                  <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Covered</p>
                </div>
                <div>
                  <p className="text-[1.25rem] font-extrabold">{pantry.missing}</p>
                  <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>To buy</p>
                </div>
              </div>
              <p className="mt-3 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {pantry.missing === 0
                  ? 'Pantry and leftovers cover everything planned. You can skip the shop.'
                  : `${pantry.missing} ingredient${pantry.missing === 1 ? '' : 's'} still needed after checking the pantry.`}
              </p>
            </Card>
            {pantry.missingItems.slice(0, 12).map((item) => (
              <Card key={item.name} className="!p-3 flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] font-bold truncate">{item.name}</span>
                <span className="text-[0.75rem] font-semibold shrink-0" style={{ color: 'var(--muted)' }}>
                  {item.qty || '—'}
                </span>
              </Card>
            ))}
          </>
        )}

        {stepId === 'list' && (
          <>
            <Card>
              <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
                <ClipboardList size={16} /> Deduplicated list
              </p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {weekList.length
                  ? `${weekList.length} unique item${weekList.length === 1 ? '' : 's'} after pantry + leftovers`
                  : 'Nothing missing — generate still works if you restock later'}
              </p>
              <button
                type="button"
                onClick={generateList}
                className="press mt-3 w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {weekList.length ? `Add ${weekList.length} items to shopping` : 'Confirm — nothing to buy'}
              </button>
            </Card>
            <div className="space-y-1.5">
              {weekList.slice(0, 20).map((item) => (
                <div key={item.name} className="flex justify-between gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--card-2)' }}>
                  <span className="text-[0.8125rem] font-bold truncate">{item.name}</span>
                  <span className="text-[0.75rem] font-semibold shrink-0" style={{ color: 'var(--muted)' }}>{item.qty}</span>
                </div>
              ))}
            </div>
            {(app.shoppingList || []).length > 0 && (
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Shopping list now has {(app.shoppingList || []).length} item{(app.shoppingList || []).length === 1 ? '' : 's'}.
              </p>
            )}
          </>
        )}

        {stepId === 'prices' && (
          <>
            {snap.stores.length === 0 ? (
              <Card className="text-center py-8">
                <p className="font-bold">No price history yet</p>
                <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  After you record a shop with prices, this step compares the same list across stores you’ve used. Skip for now.
                </p>
              </Card>
            ) : (
              snap.stores.map((row) => (
                <Card key={row.store} className="flex items-center justify-between !p-3.5">
                  <div>
                    <p className="font-bold">{row.store}</p>
                    <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {row.covered} of {row.of} items priced
                    </p>
                  </div>
                  <p className="font-extrabold">{gbp(row.total, { always: true })}</p>
                </Card>
              ))
            )}
            {snap.savings.slice(0, 5).map((s) => (
              <Card key={s.name} className="!p-3 flex justify-between gap-2">
                <span className="text-[0.8125rem] font-bold truncate">{s.name}</span>
                <Pill tone="good">save {gbp(s.saving, { always: true })} at {s.store}</Pill>
              </Card>
            ))}
          </>
        )}

        {stepId === 'shop' && (
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
                  List is empty. Go back one step to generate it from the plan.
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
          </>
        )}

        {stepId === 'stock' && (
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
              Finish shop & continue
            </button>
          </Card>
        )}

        {stepId === 'cook' && (
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
                  No meals on the plan yet — go back to Select meals.
                </p>
              </Card>
            )}
          </>
        )}

        {stepId === 'leftovers' && (
          <Card className="space-y-2">
            <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
              <Snowflake size={16} /> Fridge leftovers
            </p>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              After cooking mode finishes, spare portions are saved here. You can also save from the cook screen.
            </p>
            {(app.leftovers || []).length === 0 ? (
              <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                No leftovers yet — cook a multi-serving meal and save spare portions on the finish screen.
              </p>
            ) : (
              (app.leftovers || []).map((item) => (
                <div key={item.id} className="rounded-xl p-3" style={{ background: 'var(--card-2)' }}>
                  <p className="font-bold text-[0.875rem]">{item.name}</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {item.portions || 1} portion{(item.portions || 1) === 1 ? '' : 's'}
                    {item.expiry ? ` · best by ${item.expiry}` : ''}
                  </p>
                </div>
              ))
            )}
          </Card>
        )}

        {stepId === 'reuse' && (
          <>
            <Card>
              <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
                <Sparkles size={16} /> Next plan uses the fridge first
              </p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Schedule leftovers into empty dinner slots. The next shopping list will skip covered meals.
              </p>
            </Card>
            {(app.leftovers || []).filter((l) => l.recipeId).length === 0 ? (
              <Card>
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  When you have leftovers with a linked recipe, one tap puts them on the plan.
                </p>
              </Card>
            ) : (
              (app.leftovers || []).filter((l) => l.recipeId).map((item) => (
                <Card key={item.id} className="!p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[0.875rem] truncate">{item.name}</p>
                    <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {item.portions || 1} left
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => scheduleLeftover(item)}
                    className="press shrink-0 rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    Slot in
                  </button>
                </Card>
              ))
            )}
            <button
              type="button"
              onClick={() => {
                setStepId('plan');
                setStatus('Back to plan — the loop repeats.');
              }}
              className="press w-full rounded-2xl border py-3 text-[0.8125rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              Start the loop again
            </button>
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
          onClick={stepIndex === 0 ? onClose : goBack}
          className="press rounded-2xl border px-4 py-3.5 font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <ArrowLeft size={16} /> {stepIndex === 0 ? 'Close' : 'Back'}
          </span>
        </button>
        <button
          type="button"
          onClick={goNext}
          className="press flex-1 rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {stepIndex >= WEEK_LOOP_STEPS.length - 1 ? (
              <><Check size={16} strokeWidth={3} /> Done</>
            ) : (
              <>
                {WEEK_LOOP_STEPS[stepIndex + 1]?.short || 'Next'}
                <ArrowRight size={16} />
              </>
            )}
          </span>
        </button>
      </div>

      {/* Step chips for jump (still one flow) */}
      <div className="px-5 pb-6 flex flex-wrap gap-1.5">
        {WEEK_LOOP_STEPS.map((s) => (
          <Chip key={s.id} active={s.id === stepId} onClick={() => setStepId(s.id)}>
            {s.n}. {s.short}
          </Chip>
        ))}
      </div>
    </div>
  );
}
