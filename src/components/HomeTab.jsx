import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { byId } from '../data/recipes.js';
import { MEAL_SLOTS } from '../data/plan.js';
import {
  expiringSoon, planForDay, runningLow,
} from '../lib/kitchen.js';
import { bestForSlot, explainRecommendation } from '../lib/recommend.js';
import { tonightPlanState } from '../lib/tonight-plan.js';
import { weeklyFoodLoop } from '../lib/food-loop.js';
import { nextAction } from '../lib/next-action.js';
import { weekManager } from '../lib/week-manager.js';
import { runDecision } from '../lib/food-intelligence.js';
import { DecisionStack } from './DecisionCard.jsx';
import { Section, Card, FoodArt } from './ui.jsx';
import RecommendationExplanation from './RecommendationExplanation.jsx';
import AutopilotCard from './AutopilotCard.jsx';
import LoopConfirmCard from './LoopConfirmCard.jsx';
import NextActionCard from './NextActionCard.jsx';
import AutopilotWeek from './AutopilotWeek.jsx';
import { WeekStatusCard, NeedsAttentionCard } from './WeekStatus.jsx';
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

  // The plan outranks the engine: a planned dinner leads the card, a cooked
  // one closes it, and only an unplanned evening (or "Not tonight" on the
  // planned dish) falls through to the suggestion from what you have.
  const [skipPlanned, setSkipPlanned] = useState(false);
  const planState = useMemo(
    () => tonightPlanState({ plan: app.plan, cooked: app.cooked, day: app.day, byId }),
    [app.plan, app.cooked, app.day],
  );
  const planLed = planState.mode === 'cooked' || (planState.mode === 'planned' && !skipPlanned);
  const plannedExplanation = useMemo(() => (planLed && planState.mode === 'planned'
    ? explainRecommendation(planState.recipe, {
      pantry: app.pantry, today: app.day, date: app.day, availability,
      people: Math.max(1, Math.round(app.portions || 1)), taste: app.tasteProfile,
    })
    : null), [planLed, planState, app.pantry, app.day, availability, app.portions, app.tasteProfile]);
  const tonightRecipe = planLed ? planState.recipe : tonight?.recipe || pantryHero?.recipe || null;
  const tonightExplanation = planLed ? plannedExplanation : tonight?.explanation || pantryHero?.explanation || null;
  const tonightReasons = planLed ? null : tonight?.reasons || null;
  // The runner-up, from the same ranking as the pick — "Best tonight: X.
  // Alternative: Y" is the use-what-I-have surface, not a second decision.
  const tonightAlternative = useMemo(() => {
    if (!tonightRecipe || planState.mode === 'cooked' || !app.safeRecipes.length) return null;
    const dinners = app.safeRecipes.filter((r) => r.meal === 'dinner' && r.id !== tonightRecipe.id);
    if (!dinners.length) return null;
    const month = Number(String(app.day).slice(5, 7)) || new Date().getMonth() + 1;
    return bestForSlot(dinners, {
      pantry: app.pantry, today: app.day, date: app.day, availability,
      people: Math.max(1, Math.round(app.portions || 1)),
      budget: app.weeklyBudget ? Math.min(4, Math.max(1, app.weeklyBudget / 7)) : 2.5,
      month, taste: app.tasteProfile,
    });
  }, [tonightRecipe, planState.mode, app.safeRecipes, app.pantry, app.day, app.portions, app.weeklyBudget, app.tasteProfile, availability]);
  const tonightConfidence = planLed ? null : tonight?.confidence || app.tonightDecision?.confidence || null;

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
  // The Week Manager: one derivation for week status, exceptions and the
  // quiet-success line. Home's third area reads this and nothing else.
  const week = useMemo(() => weekManager(app), [app]);

  // The one thing the screen leads with. Memoised on exactly the derived
  // signals the ranking reads, so it doesn't recompute on unrelated changes.
  const leading = useMemo(() => nextAction(app, {
    onOpenPantry: openPantry,
    goTab,
    openGuidance,
    onOpenWeekLoop,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [app.wastePrediction, app.plan, app.shoppingList, app.weekRecovery, app.day, app.loopChecks, app.guidance]);

  // 2.5 — The unified Food Intelligence stack (lib/food-intelligence.js):
  // the same engines that rank the lead and the exceptions, composed into
  // one ranked list of decisions. The lead stays the next-action card;
  // the stack carries what else is worth deciding, each with its reason,
  // evidence and impact. Learning changes stay on the Adaptations card and
  // week repairs on the recovery preview — one fact, one surface.
  const [dismissedDecisions, setDismissedDecisions] = useState([]);
  const stackDecisions = useMemo(() => ((app.foodIntelligence?.decisions) || [])
    .filter((row) => row.id !== leading?.id)
    .filter((row) => !row.id.startsWith('adapt:'))
    .filter((row) => row.id !== 'repair-week')
    .filter((row) => !dismissedDecisions.includes(row.id))
    .slice(0, 3), [app.foodIntelligence, leading, dismissedDecisions]);
  // Needs attention lists exceptions; one already named by the lead card or
  // the decision stack above it is not repeated a third time.
  const shownTitles = new Set([leading?.title, ...stackDecisions.map((row) => row.title)]
    .filter(Boolean).map((title) => title.toLowerCase()));
  const attention = useMemo(() => {
    const exceptions = week.exceptions.filter((row) => !shownTitles.has(String(row.title).toLowerCase()));
    return { ...week, exceptions, repeatsOnly: week.exceptions.length > 0 && exceptions.length === 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, leading, stackDecisions]);
  const runDecisionNow = (row) => {
    runDecision(row, { goTab, openPantry, openWeekLoop: onOpenWeekLoop, openGuidance });
  };
  const runDecisionAlternative = (row) => runDecisionNow({ ...row, action: row.alternative || row.action });
  // "Not now" is a real answer and a logged one: a rejected recommendation
  // is how the household teaches Forq what not to lead with again.
  const dismissDecision = (row) => {
    app.respondToRecommendation?.({
      recommendationId: row.recommendationId || row.id,
      accepted: false,
      context: { source: 'home-decision', kind: row.kind },
    });
    setDismissedDecisions((current) => [...current, row.id]);
  };

  return (
    <div className="pb-6 space-y-6">
      {/* 1 — One next action. The ranking lives in lib/next-action.js so a
          screen can add urgency without adding a card; the cards it can name
          are all still further down this page. When the week has no plan, the
          autopilot proposal *is* the next action — not a CTA into a form. */}
      {leading?.id === 'plan-week' ? (
        <div className="px-5">
          <AutopilotWeek
            onOpenRecipe={openRecipe}
            onAccept={() => goTab('list')}
          />
        </div>
      ) : (leading || !stackDecisions.length) && (
        // With no lead, the quiet card would claim nothing needs you while
        // the decision stack below lists something that does.
        <NextActionCard action={leading} onRun={() => leading?.run?.()} />
      )}

      {/* 2 — Tonight's meal (one decision engine) */}
      <section className="px-5" aria-label="Tonight's meal">
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              {!planLed ? 'Tonight — from what you have' : planState.mode === 'cooked' ? 'Tonight — done' : 'Tonight — on your plan'}
            </p>
            {tonightExplanation && planState.mode !== 'cooked' && (
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
                aria-label={planState.mode === 'cooked' && planLed ? `Open ${tonightRecipe.name}` : `Cook ${tonightRecipe.name} tonight`}
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
                {planLed && planState.mode === 'cooked' && (
                  <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    Dinner is cooked and logged. Anything saved for later is in the pantry under Leftovers.
                  </p>
                )}
                {tonightExplanation && <RecommendationExplanation explanation={tonightExplanation} compact />}
                {tonightAlternative?.recipe && (
                  <button
                    type="button"
                    onClick={() => openRecipe(tonightAlternative.recipe)}
                    className="press mt-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                        Alternative
                      </span>
                      <span className="block text-[0.8125rem] font-extrabold truncate">{tonightAlternative.recipe.name}</span>
                      <span className="block text-[0.6875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                        {tonightAlternative.explanation?.coverage?.pct ?? 0}% in your kitchen · {tonightAlternative.recipe.time} min
                      </span>
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--faint)' }} />
                  </button>
                )}
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
                {(planLed ? planState.mode === 'planned' : tonight) && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => acceptTonight(planLed ? { recipe: planState.recipe, confidence: 'high' } : tonight)}
                      className="press flex-1 rounded-xl px-3 py-2.5 text-[0.8125rem] font-extrabold"
                      style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                    >
                      {planLed ? 'Start cooking' : 'Cook this tonight'}
                    </button>
                    <button
                      type="button"
                      onClick={() => (planLed ? setSkipPlanned(true) : dismissTonight(tonight))}
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

      {/* 2.5 — Worth deciding: ranked decisions from the unified Food
          Intelligence layer. Each names what to do, why, the evidence, and
          the benefit — and "Not now" is logged so a passed-on decision
          teaches Forq as much as an accepted one. Quiet when there is
          nothing worth deciding. */}
      <DecisionStack
        decisions={stackDecisions}
        onDo={runDecisionNow}
        onAlternative={runDecisionAlternative}
        onDismiss={dismissDecision}
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

      {/* 3 — Week status + needs attention, from the one Week Manager
          derivation. Exceptions only; quiet success when nothing is wrong. */}
      <WeekStatusCard manager={week} onOpenWeekLoop={onOpenWeekLoop} />
      {!attention.repeatsOnly && <NeedsAttentionCard manager={attention} app={app} goTab={goTab} openPantry={openPantry} />}

      {/* 5 — Has anything changed from the original plan? The recovery
          preview only appears when the week drifted and Forq has repairs to
          propose or undo. */}
      <WeekRecoveryPreview
        recovery={recovery}
        onApply={app.applyWeekRecovery}
        onUndo={app.undoLast}
        goTab={goTab}
      />

      {/* 6/7 — What Forq handled automatically and learned. Learning only
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

      {/* Starter welcome: chosen dinners are planned, list created. The ids
          live on the raw state and are not surfaced through derive, so they are
          read optionally — an unguarded .length here throws on an install whose
          state predates the field. */}
      {(app.starterRecipeIds?.length ?? 0) > 0 && !app.welcomeDismissed
        && !(app.shops?.length || app.cooked?.length) && (
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
              <button onClick={() => onOpenWeekLoop?.()} className="tap press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}>
                Run the week loop →
              </button>
            </div>
            <button onClick={app.dismissWelcome} className="tap press text-[0.71875rem] font-bold" style={{ color: 'var(--muted)' }}>
              Dismiss
            </button>
          </Card>
        </div>
      )}

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
            Autopilot, setup and your weekly report
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
