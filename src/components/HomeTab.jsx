import { useMemo, useState } from 'react';
import { AlarmClock, CheckCircle2, ChevronRight } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp, expiryStatus } from '../lib/utils.js';
import { byId } from '../data/recipes.js';
import { MEAL_SLOTS } from '../data/plan.js';
import {
  daysUntil, expiringSoon, leftovers, planForDay, runningLow,
} from '../lib/kitchen.js';
import { rankLeftovers } from '../lib/food-suitability.js';
import { totalOf } from '../data/stores.js';
import { bestForSlot } from '../lib/recommend.js';
import { weeklyFoodLoop } from '../lib/food-loop.js';
import { nextAction } from '../lib/next-action.js';
import { Section, Card, Pill, Meter, FoodArt } from './ui.jsx';
import { Glyph } from './icons.jsx';
import RecommendationExplanation from './RecommendationExplanation.jsx';
import AutopilotCard from './AutopilotCard.jsx';
import LoopConfirmCard from './LoopConfirmCard.jsx';
import NextActionCard from './NextActionCard.jsx';
import AdaptationsCard from './AdaptationsCard.jsx';
import GuidancePreview from './GuidancePreview.jsx';
import HomeNumbers from './HomeNumbers.jsx';
import HomeFoodLoop from './HomeFoodLoop.jsx';
import LoopCheck from './LoopCheck.jsx';
import OutcomeDashboard from './OutcomeDashboard.jsx';
import WeekRecoveryPreview from './WeekRecoveryPreview.jsx';

/**
 * This Week — the one surface that answers the product promise.
 *
 * In the order a person actually asks for it:
 *
 *   1. What should I do next?        one card, one action (lib/next-action.js)
 *   2. What am I eating tonight?     the meal decision engine's pick
 *   3. What needs buying or using?   use-soon, next shop, leftovers
 *   4. What changed because Forq     adaptations, shown only where it
 *      learned something?            changes something
 *   5. What else needs attention?    everything else, behind "Explore more"
 *
 * The screen used to open with three cards that all claimed to be the next
 * thing to do. Now one does, and the other two — plus setup guidance and the
 * weekly report — sit behind a single disclosure. No capability was removed:
 * the next-action card links straight into whichever of them is the answer
 * today. Offline-first, no fetching, fully keyboard navigable.
 */
export default function HomeTab({ openRecipe, openPantry, openGuidance, goTab, goLog, onOpenWeekLoop }) {
  const app = useApp();
  const widgets = new Set(app.homeWidgets || []);
  const todayPlan = planForDay(app.plan, app.day);
  const expiring = app.useSoonIngredients?.length
    ? app.useSoonIngredients.map((row) => row.item)
    : expiringSoon(app.pantry, 3, app.day);
  const low = runningLow(app.pantry);
  const leftoverItems = rankLeftovers(leftovers(app.pantry), {
    ...app.prefs,
    today: app.day,
    members: app.members || [],
    diets: app.diets || app.prefs?.diets || [],
  });
  const listTotal = totalOf(app.shoppingList);
  const budgetLeft = (Number(app.weeklyBudget) || 0) - (Number(app.spentThisWeek) || 0);

  const availability = useMemo(() => {
    const map = {};
    for (const entry of app.calendarBusy || []) {
      const d = entry.date;
      map[d] = { busy: true, date: d, dayName: new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) };
    }
    return map;
  }, [app.calendarBusy]);

  // Single decision engine first; legacy pantry-hero as fallback.
  // "Not tonight" cycles to the next suggestion for the session — the
  // rejection is logged, so the engine learns from it either way.
  const [dismissedTonight, setDismissedTonight] = useState([]);
  const rankedTonight = (app.tonightDecision?.ranked || []).filter((row) => !row.blocked);
  const tonight = rankedTonight.find((row) => !dismissedTonight.includes(row.recipe.id)) || null;
  const acceptTonight = (row) => {
    // One stable id for this decision: it rides the acceptance event AND the
    // cook session it starts, so follow-through is attributed exactly.
    const recommendationId = `tonight-${app.day}-${row.recipe.id}`;
    app.respondToRecommendation?.({
      recommendationId,
      accepted: true,
      recipeId: row.recipe.id,
      context: { source: 'tonight-card', confidence: row.confidence },
    });
    openRecipe(row.recipe, { startCooking: true, recommendationId });
  };
  const dismissTonight = (row) => {
    app.respondToRecommendation?.({
      recommendationId: `tonight-${app.day}-${row.recipe.id}`,
      accepted: false,
      recipeId: row.recipe.id,
      context: { source: 'tonight-card', reason: 'not-tonight' },
    });
    setDismissedTonight((current) => [...current, row.recipe.id]);
  };
  const pantryHero = useMemo(() => {
    if (tonight || !app.pantry.length || !app.safeRecipes.length) return null;
    const dinners = app.safeRecipes.filter((r) => r.meal === 'dinner');
    if (!dinners.length) return null;
    const month = Number(String(app.day).slice(5, 7)) || new Date().getMonth() + 1;
    return bestForSlot(dinners, {
      pantry: app.pantry, today: app.day, date: app.day, availability,
      people: Math.max(1, Math.round(app.portions || 1)),
      budget: app.weeklyBudget ? Math.min(4, Math.max(1, app.weeklyBudget / 7)) : 2.5,
      month, taste: app.tasteProfile,
    });
  }, [tonight, app.pantry, app.safeRecipes, app.day, app.portions, app.weeklyBudget, app.tasteProfile, availability]);

  const tonightRecipe = tonight?.recipe || pantryHero?.recipe || null;
  const tonightExplanation = tonight?.explanation || pantryHero?.explanation || null;
  const tonightReasons = tonight?.reasons || null;
  const tonightConfidence = tonight?.confidence || app.tonightDecision?.confidence || null;

  const plannedCount = Object.keys(app.plan || {}).filter((d) => d >= app.day).length;
  const recovery = app.weekRecovery;
  const foodLoop = weeklyFoodLoop(app);
  const runGuidanceAction = (item) => {
    const { action } = item;
    if (action.kind === 'view') openGuidance(action.target);
    else if (action.kind === 'pantry') openPantry();
    else if (action.kind === 'profile') goTab('profile');
    else if (action.kind === 'log') goLog('add');
    // "Run the week loop" opens the loop — the guided form of the plan
    // screen the CTA names — instead of silently degrading to the tab the
    // household was told it could skip.
    else if (action.kind === 'weekLoop') {
      if (onOpenWeekLoop) onOpenWeekLoop(action.target);
      else goTab(action.target);
    } else goTab(action.target);
  };
  const outlookLines = [
    plannedCount ? `${plannedCount} day${plannedCount === 1 ? '' : 's'} planned ahead` : 'Nothing planned yet',
    app.shoppingList.length ? `${app.shoppingList.length} items on the list · about ${gbp(listTotal, { always: true })}` : 'Shopping list empty',
    app.weeklyBudget ? `${gbp(Math.max(0, budgetLeft), { always: true })} left this week` : null,
    recovery?.explanations?.[0] || null,
  ].filter(Boolean).slice(0, 4);

  const useSoon = expiring.slice(0, 4);
  const buySoon = app.shoppingList.filter((r) => !r.checked).slice(0, 4);

  // The one thing the screen leads with. Memoised on exactly the derived
  // signals the ranking reads, so it doesn't recompute on unrelated changes.
  const leading = useMemo(() => nextAction(app, {
    onOpenPantry: openPantry,
    goTab,
    openGuidance,
    onOpenWeekLoop,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [app.wastePrediction, app.plan, app.shoppingList, app.weekRecovery, app.day, app.loopChecks, app.guidance]);

  return (
    <div className="pb-6 space-y-6">
      {/* 1 — One next action. The ranking lives in lib/next-action.js so a
          screen can add urgency without adding a card; the cards it can name
          are all still further down this page. */}
      <NextActionCard action={leading} onRun={() => leading?.run?.()} />

      {/* 2 — Tonight's meal (one decision engine) */}
      <section className="px-5" aria-label="Tonight's meal">
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Tonight — from what you have
            </p>
            {tonightExplanation && (
              <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--accent)' }}>
                {tonightExplanation.coverage.pct}% in your kitchen
              </span>
            )}
          </div>
          {tonightRecipe ? (
            <>
              <div
                role="button" tabIndex={0}
                onClick={() => openRecipe(tonightRecipe)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecipe(tonightRecipe); } }}
                className="press flex items-center gap-3 px-4 pb-3 pt-1 cursor-pointer"
                aria-label={`Cook ${tonightRecipe.name} tonight`}
              >
                <FoodArt recipe={tonightRecipe} className="h-14 w-14 rounded-xl shrink-0" px={26} />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-[0.9375rem] truncate">{tonightRecipe.name}</p>
                  <p className="text-[0.75rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                    {tonightRecipe.cuisine} · {tonightRecipe.time} min · {gbp(tonightRecipe.costPerServing, { always: true })}/serving
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
              </div>
              <div className="px-4 pb-4">
                {tonightExplanation && <RecommendationExplanation explanation={tonightExplanation} compact />}
                {tonightReasons && !tonightExplanation && (
                  <ul className="mt-1 space-y-0.5">
                    {tonightReasons.slice(0, 3).map((r) => (
                      <li key={r} className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>· {r}</li>
                    ))}
                  </ul>
                )}
                {tonightConfidence && tonightConfidence !== 'high' && (
                  <p className="mt-1.5 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
                    {tonightConfidence === 'low' ? 'Low confidence — based on limited evidence.' : 'Medium confidence.'}
                  </p>
                )}
                {tonight && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => acceptTonight(tonight)}
                      className="press flex-1 rounded-xl px-3 py-2.5 text-[0.8125rem] font-extrabold"
                      style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                    >
                      Cook this tonight
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissTonight(tonight)}
                      className="press rounded-xl border px-3 py-2.5 text-[0.8125rem] font-extrabold"
                      style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                    >
                      Not tonight
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="px-4 pb-4">
              <p className="text-[0.875rem] font-bold">Nothing to suggest yet</p>
              <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Plan a meal or add pantry items — tonight’s pick appears here with its reasons.
              </p>
              <button
                type="button" onClick={() => goTab('plan')}
                className="press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}
              >
                Plan tonight →
              </button>
            </div>
          )}
        </Card>
      </section>

      <WeekRecoveryPreview
        recovery={recovery}
        onApply={app.applyWeekRecovery}
        onUndo={app.undoLast}
        goTab={goTab}
      />

      {/* Today's planned slots, compact */}
      <Section title="Today’s meals" action="Full plan →" onAction={() => goTab('plan')} className="rise rise-2">
        <div className="space-y-2.5">
          {MEAL_SLOTS.map(({ key, label }) => {
            const r = todayPlan[key] ? byId(todayPlan[key]) : null;
            return r ? (
              <Card key={key} onClick={() => openRecipe(r)} className="flex items-center gap-3 !p-3">
                <FoodArt recipe={r} className="h-12 w-12 rounded-xl shrink-0" px={24} />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{label}</p>
                  <p className="font-bold text-[0.875rem] truncate">{r.name}</p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
              </Card>
            ) : (
              <Card key={key} className="flex items-center gap-3 !p-3" onClick={() => goTab('plan')}>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
                  <p className="font-semibold text-[0.875rem]" style={{ color: 'var(--muted)' }}>Nothing planned — tap to choose</p>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* 3 — Buy / use soon */}
      <section className="px-5" aria-label="Items to buy or use soon">
        <Card>
          <div className="flex items-baseline justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Buy / use soon</p>
            <button
              type="button" onClick={openPantry}
              className="press text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}
            >
              Open pantry →
            </button>
          </div>
          {useSoon.length === 0 && buySoon.length === 0 && leftoverItems.length === 0 ? (
            <>
              {app.pantry.length === 0 && (
                <button onClick={openPantry} className="press w-full flex items-center gap-3 text-left">
                  <span>
                    <span className="block font-bold text-[0.875rem]">Nothing tracked yet</span>
                    <span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      Add what’s in your cupboards to see value, expiry and what recipes need.
                    </span>
                  </span>
                </button>
              )}
              {app.shoppingList.length === 0 && (
                <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Empty — add items or send a recipe's ingredients over.
                </p>
              )}
              {app.pantry.length > 0 && app.shoppingList.length > 0 && (
                <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Nothing urgent — your kitchen is in a good rhythm.
                </p>
              )}
            </>
          ) : (
            <>
              {useSoon.length > 0 && (
                <div className="mt-3">
                  <p className="text-[0.75rem] font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                    <AlarmClock size={13} /> Use first
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {useSoon.map((p) => {
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
              {buySoon.length > 0 && (
                <div className="mt-3">
                  <p className="text-[0.75rem] font-bold mb-2" style={{ color: 'var(--muted)' }}>Next shop</p>
                  <ul className="space-y-1">
                    {buySoon.map((r) => (
                      <li key={r.id} className="text-[0.8125rem] font-semibold" style={{ color: 'var(--ink)' }}>
                        · {r.name}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button" onClick={() => goTab('shop')}
                    className="press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}
                  >
                    Open shopping list →
                  </button>
                </div>
              )}
              {leftoverItems.length > 0 && (
                <div className="mt-3">
                  <p className="text-[0.75rem] font-bold mb-2" style={{ color: 'var(--muted)' }}>Leftovers to use</p>
                  <div className="flex gap-2 flex-wrap">
                    {leftoverItems.slice(0, 3).map((l) => {
                      const days = l.expiry ? daysUntil(l.expiry, app.day) : null;
                      const st = days === null ? null : expiryStatus(days);
                      return (
                        <Pill key={l.id} tone={st?.tone || 'muted'}>
                          <Glyph e={l.emoji} size={12} /> {l.name}
                        </Pill>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </section>

      {/* 5 — What Forq changed, said plainly and undoable. Learning only
          shows when it changed something; hidden when it hasn't. */}
      <AdaptationsCard />

      {widgets.has('reminders') && app.remindersDue?.length > 0 && (
        <section className="px-5" aria-label="Reminders due">
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Reminders due</p>
            <ul className="mt-2 space-y-1.5">
              {app.remindersDue.slice(0, 3).map(({ reminder, at }) => (
                <li key={`${reminder.id}-${at}`} className="text-[0.8125rem] font-semibold">
                  · {reminder.label}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {widgets.has('log') && (
        <Section className="rise rise-2">
          <Card onClick={() => goLog()}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Food diary</p>
            <p className="mt-1 font-bold text-[0.875rem]">
              {app.entries.length ? `${app.entries.length} logged today` : 'Nothing logged today'}
            </p>
          </Card>
        </Section>
      )}

      {/* Starter welcome: chosen dinners are planned, list created */}
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

      {/* 4 — The week command centre: one set of week stats, one CTA into
          the loop (Home's documented "Start the week" entry) rather than a
          second route to the Plan tab the nav already provides. */}
      <section className="px-5" aria-label="Weekly outlook">        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>This week</p>
          <ul className="mt-2 space-y-1.5">
            {outlookLines.map((line) => (
              <li key={line} className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>· {line}</li>
            ))}
          </ul>
          <div className="mt-2">
            <Meter value={app.shoppingList.filter((i) => i.checked).length} max={Math.max(1, app.shoppingList.length)} height={5} />
          </div>
          <button
            type="button"
            onClick={() => (onOpenWeekLoop ? onOpenWeekLoop(null) : goTab('plan'))}
            className="press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}
          >
            Start the week →
          </button>
        </Card>
      </section>

      {widgets.has('loop') && (
        <>
          <HomeFoodLoop app={app} foodLoop={foodLoop} expiring={expiring} low={low} goTab={goTab} openPantry={openPantry} />
          <LoopCheck goTab={goTab} />
        </>
      )}
      {widgets.has('numbers') && <HomeNumbers app={app} goTab={goTab} goLog={goLog} />}

      {/*
        Everything below is real capability that used to sit at the same visual
        weight as tonight's dinner. Nothing here is gone: the loop
        confirmations, the autopilot hand-off, setup guidance and the weekly
        report are all one tap away, and the next-action card at the top links
        straight into whichever of them is currently the answer.
      */}
      <details className="home-more group">
        <summary
          className="mx-5 flex cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
        >
          Explore more
          <span className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            confirm · autopilot · setup · report
          </span>
        </summary>
        <div className="mt-6 space-y-6">
          <AutopilotCard onOpenPantry={openPantry} goTab={goTab} />
          <LoopConfirmCard goTab={goTab} />
          <Section>
            <GuidancePreview onOpen={() => openGuidance('next')} onAction={runGuidanceAction} />
          </Section>
          {widgets.has('report') && <OutcomeDashboard />}
        </div>
      </details>
    </div>
  );
}
