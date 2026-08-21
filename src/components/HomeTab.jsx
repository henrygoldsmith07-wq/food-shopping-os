import { useMemo, useState } from 'react';
import {
  AlarmClock, Camera, CheckCircle2, ChevronRight, Layers, Mic, Package, Plus,
  ScanBarcode, Search, SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp, greeting, prettyDate, expiryStatus } from '../lib/utils.js';
import { byId, RECIPES } from '../data/recipes.js';
import { MEAL_SLOTS } from '../data/plan.js';
import {
  daysUntil, expiringSoon, leftovers, pantryValue, planForDay, runningLow,
} from '../lib/kitchen.js';
import { rankLeftovers } from '../lib/food-suitability.js';
import { weeklyFoodLoop } from '../lib/food-loop.js';
import { totalOf } from '../data/stores.js';
import { bestForSlot } from '../lib/recommend.js';
import { Section, Card, Ring, Pill, Meter, FoodArt } from './ui.jsx';
import GuidancePreview from './GuidancePreview.jsx';
import WaterGlasses from './WaterGlasses.jsx';
import { DueList } from './RemindersPanel.jsx';
import { Glyph } from './icons.jsx';
import RecommendationExplanation from './RecommendationExplanation.jsx';
import OutcomeDashboard from './OutcomeDashboard.jsx';

/** Capture routes that open straight into the diary's matching sheet. */
const LOG_SHORTCUTS = [
  { id: 'add', label: 'Search food', Icon: Search },
  { id: 'barcode', label: 'Scan barcode', Icon: ScanBarcode },
  { id: 'photo', label: 'Photo', Icon: Camera },
  { id: 'voice', label: 'Voice', Icon: Mic },
  { id: 'copy', label: 'Copy meal', Icon: Layers },
];

export default function HomeTab({ openRecipe, openPantry, openGuidance, goTab, goLog }) {
  const app = useApp();
  const [customising, setCustomising] = useState(false);
  const [dragging, setDragging] = useState(null);
  const todayPlan = planForDay(app.plan, app.day);
  const expiring = app.useSoonIngredients?.length
    ? app.useSoonIngredients.map((row) => row.item)
    : expiringSoon(app.pantry, 3, app.day);
  const low = runningLow(app.pantry);
  const left = app.weeklyBudget - app.spentThisWeek;
  const recipeOfDay = RECIPES[new Date().getDate() % RECIPES.length];
  const listTotal = totalOf(app.shoppingList);
  // Rank leftovers through the central engine so expired ones drop out and
  // near-expiry ones surface first with consistent warnings.
  const leftoverItems = rankLeftovers(leftovers(app.pantry), {
    ...app.prefs,
    today: app.day,
    members: app.members || [],
    diets: app.diets || app.prefs?.diets || [],
  });
  const foodLoop = weeklyFoodLoop(app);
  const availability = useMemo(() => {
    const map = {};
    for (const entry of app.calendarBusy || []) {
      const d = entry.date;
      map[d] = { busy: true, date: d, dayName: new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) };
    }
    return map;
  }, [app.calendarBusy]);
  const pantryHero = useMemo(() => {
    if (!app.pantry.length || !app.safeRecipes.length) return null;
    const dinners = app.safeRecipes.filter((r) => r.meal === 'dinner');
    if (!dinners.length) return null;
    const month = Number(String(app.day).slice(5, 7)) || new Date().getMonth() + 1;
    const ctx = {
      pantry: app.pantry,
      today: app.day,
      date: app.day,
      availability,
      people: Math.max(1, Math.round(app.portions || 1)),
      budget: app.weeklyBudget ? Math.min(4, Math.max(1, app.weeklyBudget / 7)) : 2.5,
      month,
      taste: app.tasteProfile,
    };
    return bestForSlot(dinners, ctx);
  }, [app.pantry, app.safeRecipes, app.day, app.portions, app.weeklyBudget, app.tasteProfile, availability]);
  const runGuidanceAction = (item) => {
    const { action } = item;
    if (action.kind === 'view') openGuidance(action.target);
    else if (action.kind === 'pantry') openPantry();
    else if (action.kind === 'profile') goTab('profile');
    else if (action.kind === 'log') goLog('add');
    else goTab(action.target);
  };

  /* Every card Home can show. Which appear, and in what order, is yours to
     set under Preferences — hiding one hides a panel, never a number. */
  const blocks = {
    setup: () => (
      <Section className="rise rise-1">
        <GuidancePreview onOpen={() => openGuidance('next')} onAction={runGuidanceAction} />
      </Section>
    ),
    reminders: () => (
      <>
          {/* Anything due right now, where you'll actually see it */}
          {app.remindersDue.length > 0 && (
            <Section title="Reminders" action="All →" onAction={() => goTab('profile')} className="rise rise-2">
              <DueList compact />
            </Section>
          )}
      </>
    ),
    goals: () => (
      <>
          {/* Today's goals — small, and every bar is a count of something real */}
          <Section title="Today’s goals" action="Progress →" onAction={() => goTab('profile')} className="rise rise-2">
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-[0.8125rem] font-bold">
                  {app.game.daily.filter((g) => g.done).length} of {app.game.daily.length} done
                </p>
    <Pill tone="muted">{app.game.streaks.logging.days} day diary streak</Pill>
              </div>
              <div className="mt-2.5 space-y-2">
                {app.game.daily.map((goal) => (
                  <div key={goal.id}>
                    <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                      <span style={goal.done ? { color: 'var(--good)' } : undefined}>
                        {goal.done ? '✓ ' : ''}{goal.label}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>{goal.progress}/{goal.of}</span>
                    </div>
                    <Meter value={goal.progress} max={goal.of} height={4} color={goal.done ? 'var(--good)' : 'var(--accent)'} />
                  </div>
                ))}
              </div>
            </Card>
          </Section>
      </>
    ),
    log: () => (
      <>
          {/* One-tap food logging */}
          <Section title="Log what you ate" action="Diary →" onAction={() => goLog()} className="rise rise-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
              {LOG_SHORTCUTS.map(({ id, label, Icon }) => (
                <button
                  key={label}
                  onClick={() => goLog(id)}
                  className="press shrink-0 inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-3 text-[0.78125rem] font-bold"
                  style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </Section>
      </>
    ),
    meals: () => (
      <>
          {/* Today's plan */}
          <Section title="Today’s meals" action="Full plan →" onAction={() => goTab('plan')} className="rise rise-2">
            <div className="space-y-2.5">
              {MEAL_SLOTS.map(({ key, label }) => {
                const r = todayPlan[key] ? byId(todayPlan[key]) : null;
                return r ? (
                  <Card key={key} onClick={() => openRecipe(r)} className="flex items-center gap-3 !p-3">
                    <FoodArt recipe={r} className="h-14 w-14 rounded-xl shrink-0" px={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{label}</p>
                      <p className="font-bold text-[0.9375rem] truncate">{r.name}</p>
                      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                        {r.time <= 60 ? `${r.time} min` : `${Math.round(r.time / 60)} h`} · {r.kcal} kcal · {gbp(r.costPerServing, { always: true })}/serving
                      </p>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
                  </Card>
                ) : (
                  <Card key={key} className="flex items-center gap-3 !p-3" onClick={() => goTab('plan')}>
                    <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--card-2)', color: 'var(--faint)' }}>
                      <Plus size={22} />
                    </div>
                    <div>
                      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
                      <p className="font-semibold text-[0.875rem]" style={{ color: 'var(--muted)' }}>Nothing planned — tap to choose</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Section>
      </>
    ),
    water: () => (
      <>
          {/* Water + shopping list */}
          <div className="type-responsive-pair px-5 grid gap-3 rise rise-2">
            <Card>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Water</p>
              <div className="mt-2.5"><WaterGlasses size={16} /></div>
              <p className="mt-2 text-[0.8125rem] font-bold">
                {app.hydration.total.toLocaleString()} <span className="font-semibold" style={{ color: 'var(--muted)' }}>/ {app.targets.water.toLocaleString()} ml</span>
              </p>
            </Card>

            <Card onClick={() => goTab('shop')}>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Shopping list</p>
              {app.shoppingList.length ? (
                <>
                  <p className="mt-1.5 text-[1.375rem] font-extrabold leading-none">{app.shoppingList.length}</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    items · about {gbp(listTotal, { always: true })}
                  </p>
                  <div className="mt-2">
                    <Meter value={app.shoppingList.filter((i) => i.checked).length} max={app.shoppingList.length} height={5} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Empty — add items or send a recipe's ingredients over.
                </p>
              )}
            </Card>
          </div>
      </>
    ),
    pantry: () => (
      <>
          {/* Pantry */}
          <Section title="Pantry" action="Open pantry →" onAction={openPantry} className="rise rise-3">
            <Card>
              {app.pantry.length === 0 ? (
                <button onClick={openPantry} className="press w-full flex items-center gap-3 text-left">
                  <Package size={22} style={{ color: 'var(--faint)' }} />
                  <span>
                    <span className="block font-bold text-[0.875rem]">Nothing tracked yet</span>
                    <span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      Add what’s in your cupboards to see value, expiry and what recipes need.
                    </span>
                  </span>
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Pantry value</p>
                      <p className="text-[1.375rem] font-extrabold">{gbp(pantryValue(app.pantry), { always: true })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Items</p>
                      <p className="text-[0.875rem] font-bold">{app.pantry.length} tracked</p>
                    </div>
                  </div>

                  {expiring.length > 0 && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                      <p className="text-[0.75rem] font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                        <AlarmClock size={13} /> Use soon
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {expiring.slice(0, 4).map((p) => {
                          const d = daysUntil(p.expiry, app.day);
                          return (
                            <Pill key={p.id} tone={d <= 1 ? 'danger' : 'warn'}>
                              <Glyph e={p.emoji} size={12} /> {p.name} · {d <= 0 ? 'today' : `${d}d`}
                            </Pill>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {low.length > 0 && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                      <p className="text-[0.75rem] font-bold mb-2" style={{ color: 'var(--muted)' }}>Running low</p>
                      <div className="flex gap-2 flex-wrap">
                        {low.map((p) => (
                          <Pill key={p.id} tone="muted"><Glyph e={p.emoji} size={12} /> {p.name}</Pill>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </Section>
      </>
    ),
    leftovers: () => (
      <>
          {/* Leftovers ranked by the central engine — expired filtered out,
              near-expiry shown first with explicit use-by warnings. */}
          {leftoverItems.length > 0 && (
            <Section title="Leftovers to use" className="rise rise-4">
              <div className="grid grid-cols-2 gap-3">
                {leftoverItems.map((l) => {
                  const days = l.expiry ? daysUntil(l.expiry, app.day) : null;
                  const st = days === null ? null : expiryStatus(days);
                  return (
                    <Card key={l.id} className="!p-3">
                      <p className="font-bold text-[0.875rem] flex items-center gap-1.5">
                        <Glyph e={l.emoji} size={15} style={{ color: 'var(--muted)' }} /> {l.name}
                      </p>
                      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                        {[l.qty, l.location].filter(Boolean).join(' · ')}
                      </p>
                      {st && (
                        <div className="mt-1.5">
                          <Pill tone={st.tone}>{st.label}</Pill>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}
      </>
    ),
    recipe: () => (
      <>
          {/* Recipe of the day */}
          <Section title="Recipe of the day" className="rise rise-4">
            <Card onClick={() => openRecipe(recipeOfDay)} className="!p-0 overflow-hidden">
              <FoodArt recipe={recipeOfDay} className="h-36 w-full" px={56} />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-extrabold text-[1rem]">{recipeOfDay.name}</p>
                  <Pill tone="accent">{recipeOfDay.protein}g protein</Pill>
                </div>
                <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {recipeOfDay.cuisine} · {recipeOfDay.time} min · {gbp(recipeOfDay.costPerServing, { always: true })}/serving · {recipeOfDay.kcal} kcal
                </p>
              </div>
            </Card>
          </Section>
      </>
    ),
  };

  const orderedWidgets = app.homeWidgets.filter((id) => blocks[id]);
  const focusWidget = app.entryGoal === 'pantry' ? 'pantry' : app.entryGoal === 'shop' ? 'water' : 'recipe';
  const tierCore = {
    starter: ['setup', focusWidget],
    regular: ['setup', 'meals', focusWidget],
    established: ['setup', 'reminders', 'goals', 'meals', focusWidget],
  };
  const coreIds = new Set(tierCore[app.personaTier] || tierCore.regular);
  const coreWidgets = orderedWidgets.filter((id) => coreIds.has(id));
  const moreWidgets = orderedWidgets.filter((id) => !coreIds.has(id));
  const renderWidget = (id) => (
    <div
      key={id}
      draggable={customising}
      onDragStart={() => setDragging(id)}
      onDragOver={(event) => customising && event.preventDefault()}
      onDrop={() => {
        if (customising && dragging) app.moveWidgetTo(dragging, id);
        setDragging(null);
      }}
      className={customising ? 'cursor-grab rounded-2xl outline outline-1 outline-dashed outline-[var(--line)] py-1' : ''}
    >
      {blocks[id]()}
    </div>
  );

  return (
    <div className="pb-6 space-y-6">
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

      {pantryHero && (
        <section className="px-5 rise rise-1" aria-label="Tonight's pantry pick">
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Tonight — from what you have</p>
              <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--accent)' }}>{pantryHero.explanation.coverage.pct}% in your kitchen</span>
            </div>
            <div role="button" tabIndex={0} onClick={() => openRecipe(pantryHero.recipe)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecipe(pantryHero.recipe); } }} className="press flex items-center gap-3 px-4 pb-3 pt-1 cursor-pointer">
              <FoodArt recipe={pantryHero.recipe} className="h-14 w-14 rounded-xl shrink-0" px={26} />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-[0.9375rem] truncate">{pantryHero.recipe.name}</p>
                <p className="text-[0.75rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                  {pantryHero.recipe.cuisine} · {pantryHero.recipe.time} min · {gbp(pantryHero.recipe.costPerServing, { always: true })}/serving
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
            </div>
            <div className="px-4 pb-4">
              <RecommendationExplanation explanation={pantryHero.explanation} compact />
            </div>
          </Card>
        </section>
      )}

      {/* Secondary numbers stay available without taking the first screenful. */}
      {(app.weeklyBudget > 0 || app.entries.length > 0) && (
      <details className="mx-5 rise rise-1">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <span>Your numbers</span>
          <span className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>Budget and diary</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card onClick={() => goTab('shop')}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Weekly budget</p>
            {app.weeklyBudget > 0 ? (
              <div className="mt-2 flex items-center gap-3">
                <Ring
                  value={app.spentThisWeek}
                  max={app.weeklyBudget}
                  size={64}
                  label={`${Math.round((app.spentThisWeek / app.weeklyBudget) * 100)}%`}
                />
                <div>
                  <p className="text-[1.0625rem] font-extrabold leading-tight">{gbp(app.spentThisWeek, { always: true })}</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>of {gbp(app.weeklyBudget)}</p>
                  <p className="text-[0.6875rem] font-bold mt-0.5" style={{ color: left >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                    {left >= 0 ? `${gbp(left, { always: true })} left` : `${gbp(-left, { always: true })} over`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                No budget set — add one in your profile to track spending.
              </p>
            )}
          </Card>

          <Card onClick={() => goLog()}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Calories today</p>
            <div className="mt-2 flex items-center gap-3">
              <Ring
                value={app.kcalToday}
                max={app.kcalGoal}
                size={64}
                color="var(--series-2)"
                label={`${Math.round((app.kcalToday / app.kcalGoal) * 100)}%`}
              />
              <div>
                <p className="text-[1.0625rem] font-extrabold leading-tight">{app.kcalToday.toLocaleString()}</p>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>of {app.kcalGoal.toLocaleString()} kcal</p>
                <p className="text-[0.6875rem] font-bold mt-0.5" style={{ color: 'var(--muted)' }}>
                  P {Math.round(app.proteinToday)}g · C {Math.round(app.carbsToday)}g · F {Math.round(app.fatToday)}g
                </p>
              </div>
            </div>
          </Card>
        </div>
      </details>
      )}

      {app.starterRecipeIds.length > 0 && !app.welcomeDismissed && (
        <div className="px-5 rise rise-1">
          <Card className="flex items-start gap-3 !p-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <CheckCircle2 size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-extrabold">Your first meals are ready</p>
              <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {app.starterRecipeIds.length} dinner{app.starterRecipeIds.length === 1 ? '' : 's'} planned and one shopping list created.
              </p>
              <button onClick={() => goTab('plan')} className="tap press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}>
                View your plan →
              </button>
            </div>
            <button onClick={app.dismissWelcome} className="tap press text-[0.71875rem] font-bold" style={{ color: 'var(--muted)' }}>
              Dismiss
            </button>
          </Card>
        </div>
      )}

      {/* Rearranging the dashboard is a thing you do *to* these cards, so the
          control sits with them rather than up in the header. */}
      <div className="px-5 flex justify-end">
        <button
          onClick={() => setCustomising((value) => !value)}
          aria-pressed={customising}
          className="tap press inline-flex items-center gap-1.5 text-[0.78125rem] font-extrabold"
          style={{ color: customising ? 'var(--accent)' : 'var(--muted)' }}
        >
          <SlidersHorizontal size={14} /> {customising ? 'Done rearranging' : 'Rearrange'}
        </button>
      </div>

      {customising && (
        <div className="mx-5 rounded-2xl border px-4 py-3 text-[0.78125rem] font-bold" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
          Drag these cards into the order you want them. Hidden ones are under the avatar, in Preferences → Home.
        </div>
      )}
      {customising ? orderedWidgets.map(renderWidget) : coreWidgets.map(renderWidget)}
      <div className="px-5">
        <OutcomeDashboard />
      </div>

      {!customising && moreWidgets.length > 0 && (
        <details className="home-more group">
          <summary className="mx-5 flex cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
            Explore more
            <span className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{moreWidgets.length} sections</span>
          </summary>
          <div className="mt-6 space-y-6">
            {moreWidgets.map(renderWidget)}
          </div>
        </details>
      )}

    </div>
  );
}
