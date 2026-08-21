import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronRight, Info, Leaf, Package, ShoppingCart, Snowflake, Sparkles, Zap,
} from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { buildPlan, EQUIPMENT_TAGS, scopeMeals } from '../lib/planner.js';
import { useApp } from '../lib/store.jsx';
import { PLANNER_OCCASIONS, WEEK_DAYS } from '../data/plan.js';
import { itemsFromRecipes } from '../data/stores.js';
import { monthOf, peakNow } from '../data/seasons.js';
import { expiringSoon } from '../lib/kitchen.js';
import { explainRecommendation } from '../lib/recommend.js';
import { Card, Chip, Pill, Stepper, FoodArt } from './ui.jsx';
import { recordProductEvent } from '../lib/product-analytics.js';
import RecommendationExplanation from './RecommendationExplanation.jsx';

const SCOPES = ['1 meal', 'A day', 'A week', 'A month'];

/**
 * The plan generator.
 *
 * It reads your goal, your dietary patterns (yours and everyone you cook for),
 * your pantry and the month, and returns dishes that satisfy the hard rules and
 * lean towards what you already have and what's at its best right now. Applying
 * it writes real dates into the plan.
 */
export default function PlanGenerator({ weekDates, monthDates, openRecipe, onApplied, goTab }) {
  const app = useApp();
  const [scope, setScope] = useState('A week');
  const [people, setPeople] = useState(Math.max(1, Math.round(app.portions)));
  const [budget, setBudget] = useState(2.5);
  const [occasion, setOccasion] = useState('Everyday');
  const [quick, setQuick] = useState(false);
  const [timeAvailable, setTimeAvailable] = useState(null);
  const [batch, setBatch] = useState(false);
  const [usePantry, setUsePantry] = useState(true);
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [seasonal, setSeasonal] = useState(true);
  const [leftoverFirst, setLeftoverFirst] = useState(app.leftovers.length > 0);
  const [variety, setVariety] = useState(true);
  const [minimiseWaste, setMinimiseWaste] = useState(true);
  const [seed, setSeed] = useState(() => (app.calendarBusy?.length ? Date.now() % 100000 : 0));
  const [generating, setGenerating] = useState(false);
  const [addedToList, setAddedToList] = useState(false);

  const month = monthOf(app.day);
  const dates = scope === 'A month' ? monthDates : weekDates;
  const busyDates = new Set((app.calendarBusy || []).map((item) => item.date));
  const busyInScope = [...busyDates].filter((date) => dates.includes(date)).length;
  const planDates = dates.filter((date) => !busyDates.has(date));
  const noOpenDates = ['A week', 'A month'].includes(scope) && planDates.length === 0;
  const pantryNames = app.pantry.map((p) => p.name);
  const expiringNames = (app.useSoonIngredients?.length
    ? app.useSoonIngredients.map((row) => row.item.name)
    : expiringSoon(app.pantry, 3, app.day).map((p) => p.name));
  const ownRecipeIds = new Set(app.myRecipes.map((recipe) => recipe.id));
  const ownCandidates = app.safeRecipes.filter((recipe) => ownRecipeIds.has(recipe.id)).length;
  const recipeKey = app.safeRecipes.map((recipe) => recipe.id).join(',');
  const tasteKey = JSON.stringify(app.tasteProfile);
  const leftoversKey = app.leftovers.map((item) => `${item.recipeId}:${item.portions}:${item.expiry || ''}`).join(',');
  const generatorKey = [
    scope, people, budget, occasion, quick, timeAvailable, batch, usePantry, availabilityOnly, seasonal, leftoverFirst, variety, minimiseWaste,
    planDates.join(','), pantryNames.join(','), (app.equipment || []).join(','), app.planDiets.join(','), app.goal, month,
    recipeKey, tasteKey, leftoversKey, JSON.stringify(app.wasteProfile), JSON.stringify(app.aliasMemory || {}),
  ].join('|');

  useEffect(() => {
    setAddedToList(false);
  }, [generatorKey]);

  const plan = useMemo(() => {
    if (!seed) return null;
    return buildPlan(
      {
        scope,
        diets: app.planDiets,
        goal: app.goal,
        budget,
        maxTime: timeAvailable || (quick ? 30 : null),
        occasion,
        people,
        batch,
        pantry: usePantry ? pantryNames : [],
        month: seasonal ? month : null,
        days: ['A week', 'A month'].includes(scope) ? planDates.length : null,
        recipes: app.safeRecipes,
        taste: app.tasteProfile,
        leftovers: leftoverFirst ? app.leftovers : [],
        equipment: (app.equipment || []).length ? app.equipment : null,
        pantryItems: app.pantry,
        availableOnly: availabilityOnly,
        expiry: usePantry ? expiringNames : [],
        variety,
        wasteOptimisation: minimiseWaste,
        wasteProfile: app.wasteProfile,
        dates: scope === 'A day'
          ? [app.day, app.day, app.day]
          : scope === '1 meal' ? [app.day] : planDates,
        today: app.day,
        learnedAliases: app.aliasMemory || {},
      },
      seed,
    );
    // pantryNames is rebuilt every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, scope, app.planDiets, app.goal, app.safeRecipes, app.tasteProfile, budget, quick, timeAvailable, occasion, people, batch, usePantry, availabilityOnly, seasonal, leftoverFirst, variety, minimiseWaste, app.leftovers, app.pantry, app.wasteProfile, app.aliasMemory, month, planDates.length, (app.equipment || []).join(',')]);

  const generated = plan?.meals ?? null;

  const generate = () => {
    if (noOpenDates) return;
    setAddedToList(false);
    setSeed(Date.now() % 100000);
    setGenerating(false);
    recordProductEvent('plan_generated', {
      scope,
      hasPantry: usePantry && pantryNames.length > 0,
      seasonal,
      leftoverFirst,
      timeAvailable: timeAvailable || (quick ? 30 : null),
      availabilityOnly,
    });
  };

  /** Turn the generated run into dated slots. */
  const entries = useMemo(() => {
    if (!generated) return [];
    if (scope === 'A day') {
      return scopeMeals('A day').map((slot, i) => ({ date: app.day, slot, recipeId: generated[i]?.id }));
    }
    if (scope === '1 meal') return [{ date: app.day, slot: 'dinner', recipeId: generated[0]?.id }];
    return planDates.map((date, i) => ({ date, slot: 'dinner', recipeId: generated[i]?.id }));
  }, [generated, scope, planDates, app.day]);

  const apply = () => {
    app.applyPlanEntries(entries.filter((e) => e.recipeId));
    recordProductEvent('plan_accepted', { scope, mealCount: entries.filter((e) => e.recipeId).length });
    onApplied?.();
  };

  const addAllToList = () => {
    if (addedToList) {
      goTab?.('shop');
      return;
    }
    app.addToList(itemsFromRecipes([...new Set(generated)], pantryNames));
    setAddedToList(true);
  };

  const cost = generated ? generated.reduce((s, r) => s + r.costPerServing * people, 0) : 0;
  const kcal = generated ? Math.round(generated.reduce((s, r) => s + r.kcal, 0) / generated.length) : 0;
  const distinct = generated ? new Set(generated.map((r) => r.id)).size : 0;
  const wastePlan = plan?.wastePlan || null;
  const wasteMetric = (value) => value === null || value === undefined ? '—' : `${Math.round(value)}%`;
  const planNotes = [
    plan?.note,
    generated && busyInScope > 0
      ? `Leaving ${busyInScope} calendar-busy evening${busyInScope === 1 ? '' : 's'} empty.`
      : null,
  ].filter(Boolean);
  const busyMap = useMemo(() => {
    const m = {};
    for (const b of app.calendarBusy || []) m[b.date] = { busy: true, date: b.date, dayName: new Date(`${b.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) };
    return m;
  }, [app.calendarBusy]);
  const slotDates = useMemo(() => {
    if (!generated) return [];
    if (scope === 'A day') return Array(generated.length).fill(app.day);
    if (scope === '1 meal') return [app.day];
    return planDates;
  }, [generated, scope, planDates, app.day]);

  const labelFor = (i) => {
    if (scope === 'A day') return ['Breakfast', 'Lunch', 'Dinner'][i];
    if (scope === '1 meal') return 'Suggested';
    const date = planDates[i];
    return date ? `${WEEK_DAYS[i % 7]} ${Number(date.slice(8, 10))}` : '';
  };

  return (
    <>
      <Card className="space-y-4">
        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Generate</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {SCOPES.map((s) => <Chip key={s} active={scope === s} onClick={() => setScope(s)}>{s}</Chip>)}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            People
            {app.members.length > 0 && (
              <span className="ml-1.5 normal-case font-semibold" style={{ color: 'var(--muted)' }}>
                · {app.members.length} in your household
              </span>
            )}
          </p>
          <Stepper value={people} onChange={setPeople} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Budget per serving</p>
            <p className="text-[0.875rem] font-extrabold" style={{ color: 'var(--accent)' }}>{gbp(budget, { always: true })}</p>
          </div>
          <input
            type="range" min="1" max="4" step="0.25" value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full" style={{ accentColor: 'var(--accent)' }}
            aria-label="Budget per serving"
          />
        </div>

        {/* Goal and diet come from your profile — one place, not two */}
        <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Planning for</p>
          <p className="mt-0.5 text-[0.84375rem] font-bold">{app.goalSummary}</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {app.planDiets.length > app.diets.length
              ? 'Includes everyone you cook for — change it under Family in your profile.'
              : 'Change it under Goals & targets in your profile.'}
          </p>
          <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Choosing from {app.safeRecipes.length} recipes
            {ownCandidates ? `, including ${ownCandidates} of yours` : ''}.
          </p>
          {app.tasteProfile.rated > 0 && (
            <p className="mt-1 text-[0.75rem] font-bold" style={{ color: 'var(--accent)' }}>
              Taste Match favours {app.tasteProfile.topCuisines.slice(0, 2).join(' and ') || 'the flavours you liked'}.
            </p>
          )}
          {app.householdPreferences?.learnedFromCooking > 0 && (
            <p className="mt-1 text-[0.75rem] font-bold" style={{ color: 'var(--accent)' }}>
              Household learning is active from {app.householdPreferences.learnedFromCooking} cooked meal{app.householdPreferences.learnedFromCooking === 1 ? '' : 's'}.
            </p>
          )}
        </div>

        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Occasion</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {PLANNER_OCCASIONS.map((o) => <Chip key={o} active={occasion === o} onClick={() => setOccasion(o)}>{o}</Chip>)}
          </div>
        </div>

        <div className="space-y-2.5">
          {[
            { on: quick, set: setQuick, icon: <Zap size={14} />, label: '30 minutes or less' },
            { on: batch, set: setBatch, icon: <Snowflake size={14} />, label: 'Batch cook — fewer dishes, more portions' },
            { on: usePantry, set: setUsePantry, icon: <Package size={14} />, label: 'Use what I already have' },
            { on: seasonal, set: setSeasonal, icon: <Leaf size={14} />, label: 'Favour what’s in season' },
            { on: leftoverFirst, set: setLeftoverFirst, icon: <Snowflake size={14} />, label: 'Use fridge leftovers before cooking again' },
            { on: variety, set: setVariety, icon: <Sparkles size={14} />, label: 'Vary it up — avoid repeats where it can' },
            { on: minimiseWaste, set: setMinimiseWaste, icon: <Leaf size={14} />, label: 'Minimise waste before I buy' },
          ].map(({ on, set, icon, label }) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <p className="text-[0.8125rem] font-bold flex items-center gap-1.5">{icon} {label}</p>
              <Chip active={on} onClick={() => set(!on)}>{on ? 'On' : 'Off'}</Chip>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Time available tonight</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {[[null, 'No limit'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '60 min']].map(([minutes, label]) => (
              <Chip key={label} active={timeAvailable === minutes} onClick={() => setTimeAvailable(minutes)}>{label}</Chip>
            ))}
          </div>
          <p className="text-[0.7rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Replan against the time you actually have; longer recipes stay out of the result.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8125rem] font-bold flex items-center gap-1.5"><Package size={14} /> Ingredient availability</p>
          <Chip active={availabilityOnly} onClick={() => setAvailabilityOnly(!availabilityOnly)}>{availabilityOnly ? 'Only what I have' : 'Prefer pantry'}</Chip>
        </div>

        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
            My kit
          </p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {EQUIPMENT_TAGS.map((tag) => {
              const owned = (app.equipment || []).includes(tag);
              return (
                <Chip key={tag} active={owned} onClick={() => {
                  const next = owned
                    ? (app.equipment || []).filter((t) => t !== tag)
                    : [...(app.equipment || []), tag];
                  app.set({ equipment: next });
                }}>
                  {owned ? `✓ ${tag}` : tag}
                </Chip>
              );
            })}
          </div>
          <p className="mt-1.5 text-[0.7rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Recipes that need kit you don't own are left out. Untagged dishes always fit.
          </p>
        </div>
        {expiringNames.length > 0 && usePantry && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--warn, #a55a12)' }}>
            {expiringNames.slice(0, 4).join(', ')}{expiringNames.length > 4 ? '…' : ''} — use soon; the generator will favour dishes that use them.
          </p>
        )}

        {seasonal && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            In season now: {peakNow(month, 5).join(' · ')}.
          </p>
        )}
        {busyDates.size > 0 && ['A week', 'A month'].includes(scope) && (
          <div
            className="rounded-2xl border px-3 py-2.5"
            style={{ borderColor: 'var(--warn, #a55a12)', background: 'color-mix(in srgb, var(--warn, #a55a12) 8%, transparent)' }}
          >
            <p className="text-[0.75rem] font-extrabold" style={{ color: 'var(--warn, #a55a12)' }}>
              {busyInScope} busy evening{busyInScope === 1 ? '' : 's'} (from calendar / ICS)
            </p>
            <p className="text-[0.7rem] font-semibold mt-0.5" style={{ color: 'var(--muted)' }}>
              Generator fills {planDates.length} open night{planDates.length === 1 ? '' : 's'} only.
              {[...busyDates].filter((d) => dates.includes(d)).slice(0, 5).join(' · ')}
              {[...busyDates].filter((d) => dates.includes(d)).length > 5 ? '…' : ''}
            </p>
          </div>
        )}

        <button
          onClick={generate}
          disabled={generating || noOpenDates}
          className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', opacity: generating ? 0.7 : 1 }}
        >
          <span className="inline-flex items-center gap-2">
            {!generating && <Sparkles size={16} />}
            {noOpenDates ? 'Every evening is busy' : generating ? 'Thinking…' : seed ? 'Regenerate' : 'Generate'}
          </span>
        </button>
      </Card>

      {generating && (
        <div className="mt-3 space-y-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[72px] rounded-2xl" />)}
        </div>
      )}

      {generated && !generating && (
        <div className="mt-3 space-y-3">
          {planNotes.length > 0 && (
            <Card className="!p-3 flex items-start gap-2" style={{ background: 'var(--card-2)' }}>
              <Info size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{planNotes.join(' ')}</p>
            </Card>
          )}
          <Card className="!p-3 flex items-center justify-between">
            <div>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Estimated cost</p>
              <p className="text-[1.125rem] font-extrabold">
                {gbp(cost, { always: true })} <span className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>for {people}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.8125rem] font-bold">{kcal} kcal avg</p>
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {distinct} dish{distinct === 1 ? '' : 'es'}
              </p>
            </div>
          </Card>
          {wastePlan && (
            <Card className="!p-3 space-y-3" style={{ background: 'var(--card-2)' }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Waste-minimising plan</p>
                  <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {wastePlan.expectedUnusedCount === 0
                      ? 'No expected unused ingredients from the known quantities.'
                      : `${wastePlan.expectedUnusedCount} ingredient${wastePlan.expectedUnusedCount === 1 ? '' : 's'} may be left over.`}
                  </p>
                </div>
                <Pill tone={wastePlan.score >= 80 ? 'good' : wastePlan.score >= 60 ? 'accent' : 'muted'}>{wastePlan.score}/100</Pill>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[0.9375rem] font-extrabold">{wasteMetric(wastePlan.pantryUtilisation)}</p>
                  <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Pantry</p>
                </div>
                <div>
                  <p className="text-[0.9375rem] font-extrabold">{wasteMetric(wastePlan.perishableUtilisation)}</p>
                  <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Perishables</p>
                </div>
                <div>
                  <p className="text-[0.9375rem] font-extrabold">{wasteMetric(wastePlan.packUtilisation)}</p>
                  <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Packs</p>
                </div>
              </div>
              {wastePlan.purchaseRows?.length > 0 && (
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Buy: {wastePlan.purchaseRows.slice(0, 3).map((row) => row.packs
                    ? `${row.packs} ${row.packUnit || 'pack'} of ${row.name}`
                    : `${row.qty} ${row.name}`).join(' · ')}.
                </p>
              )}
              {wastePlan.recommendations?.length > 0 && (
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {wastePlan.recommendations.slice(0, 2).join(' ')}
                </p>
              )}
            </Card>
          )}
          <div className="space-y-2.5">
            {generated.map((r, i) => {
              const date = slotDates[i] || app.day;
              const ctx = {
                pantry: app.pantry,
                today: app.day,
                date,
                availability: busyMap,
                people,
                budget,
                month,
                taste: app.tasteProfile,
              };
              const explanation = explainRecommendation(r, ctx);
              return (
                <Card key={`${r.id}-${i}`} className="!p-0 overflow-hidden">
                  <div onClick={() => openRecipe(r)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecipe(r); } }} className="press flex items-center gap-3 p-3 cursor-pointer">
                    <FoodArt recipe={r} className="h-14 w-14 rounded-xl shrink-0" px={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                        {labelFor(i)}
                      </p>
                      <p className="font-bold text-[0.9375rem] truncate">{r.name}</p>
                      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                        {r.time} min · {gbp(r.costPerServing, { always: true })}/serving
                      </p>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
                  </div>
                  <div className="px-3 pb-3">
                    <RecommendationExplanation explanation={explanation} compact />
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={apply}
              className="press rounded-2xl py-3 text-[0.84375rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Check size={15} strokeWidth={3} /> Put in my plan</span>
            </button>
            <button
              onClick={addAllToList}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold disabled:opacity-60"
              style={addedToList ? { borderColor: 'var(--good)', color: 'var(--good)' } : { borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <ShoppingCart size={15} /> {addedToList ? 'Review shopping list' : 'Shop for it'}
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}


