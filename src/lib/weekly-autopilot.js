/**
 * Adaptive weekly autopilot — a coherent household-aware week, not seven
 * independent recipes. Reuses buildPlan + week-optimizer; adds household
 * policy (expiry first, leftovers, reuse flow, difficult days, budget guard).
 * Every choice carries a human reason + confidence.
 */
import { buildPlan, windowBudget } from './planner.js';
import { evaluateWeek } from './week-optimizer.js';
import { householdPortionsFor } from './portions.js';
import { weekDates, dayStamp, addDays } from './kitchen-dates.js';
import { monthOf } from '../data/seasons.js';
import { useSoonIngredients, leftoverAwareness } from './planning-intelligence.js';
import { canonicalName } from './aliases.js';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (date) => DAY_NAMES[new Date(`${String(date).slice(0, 10)}T12:00:00`).getDay()] || 'that day';
const norm = (v) => String(v || '').trim().toLowerCase();
export const weekdaySkipRates = (state = {}) => {
  const byDow = {};
  const bump = (date, kind) => {
    const dow = new Date(`${String(date).slice(0, 10)}T12:00:00`).getDay();
    if (!Number.isFinite(dow)) return;
    const row = byDow[dow] || (byDow[dow] = { cooked: 0, skipped: 0, planned: 0 });
    row[kind] += 1;
  };
  for (const e of Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : []) {
    if (!e?.date) continue;
    bump(e.date, 'planned');
    if (e.status === 'skipped' || e.status === 'missed') bump(e.date, 'skipped');
  }
  for (const c of Array.isArray(state.cooked) ? state.cooked : []) {
    if (c?.date) bump(c.date, 'cooked');
  }
  return byDow;
};
export const difficultDays = (state = {}) => {
  const byDow = weekdaySkipRates(state);
  return Object.entries(byDow)
    .filter(([, r]) => r.planned + r.cooked >= 3 && r.skipped / Math.max(1, r.planned + r.cooked + r.skipped) >= 0.4)
    .map(([dow]) => Number(dow));
};
const recipeById = (recipes, id) => (recipes || []).find((r) => r?.id === id) || null;
/**
 * The window of evenings a proposal should cover. A weekly autopilot must
 * always offer a *complete, actionable* week — not the 1–2 evenings left of a
 * week that's nearly over. So: plan the rest of this week when there are still
 * enough nights to matter, otherwise roll forward to the next full week.
 */
const proposalWindow = (today) => {
  const thisWeek = weekDates(today).filter((d) => d >= today);
  if (thisWeek.length >= 4) return thisWeek.slice(0, 7);
  // Too little of this week remains to be worth planning; propose next week.
  const nextStart = addDays(weekDates(today)[0], 7);
  return weekDates(nextStart);
};
/**
 * Propose a complete household-aware week.
 */
export const proposeHouseholdWeek = (state = {}, { recipes = [], today = dayStamp(), strategy = null } = {}) => {
  const dates = proposalWindow(today);
  if (!dates.length || !recipes.length) {
    return { days: [], summary: 'No recipes available.', estimatedCost: null, confidence: 'none', provenance: [] };
  }
  const busy = new Set((state.calendarBusy || []).map((e) => e?.date).filter(Boolean));
  const openDates = dates.filter((d) => !busy.has(d));
  const useDates = openDates.length >= 3 ? openDates : dates;
  const portions = Math.max(1, Math.round(Number(householdPortionsFor(state).portions) || 1));
  const pantryNames = (state.pantry || []).map((p) => p.name);
  const expiring = useSoonIngredients(state.pantry || [], { today }).map((r) => r.item.name);
  const leftovers = leftoverAwareness(state.pantry || [], { today }).filter((r) => r.status !== 'past');
  const tough = new Set(difficultDays(state));
  const weeklyBudget = windowBudget(state.weeklyBudget, 7);
  const strat = strategy?.buildPlanInput || {};
  const input = {
    scope: 'A week', diets: state.planDiets, goal: state.goal,
    budget: strat.budget ?? 2.5, maxTime: strat.maxTime ?? null, people: portions,
    pantry: state.usePantry === false ? [] : pantryNames, month: monthOf(today),
    days: useDates.length, recipes, taste: state.tasteProfile,
    leftovers: (state.leftovers || []).length ? state.leftovers : [],
    equipment: (state.equipment || []).length ? state.equipment : null,
    pantryItems: state.pantry, expiry: expiring, variety: strat.variety ?? true,
    wasteOptimisation: strat.wasteOptimisation ?? true, multiObjective: true,
    wasteProfile: state.wasteProfile, dates: useDates, today,
    learnedAliases: state.aliasMemory || {}, weeklyBudget,
    budgetSpent: Number(state.spentThisWeek) || 0, skipProfile: state.skipReasonProfile,
    batch: strat.batch || false, occasion: strat.occasion || 'Everyday',
  };
  let run = null;
  try { run = buildPlan(input, Date.now() % 100000); } catch { run = null; }
  const meals = run?.meals || [];
  const days = useDates.map((date, i) => {
    const meal = meals[i % Math.max(1, meals.length)] || null;
    const recipe = meal ? recipeById(recipes, meal.id) || meal : null;
    const reasons = [];
    let confidence = 'low';
    if (recipe) {
      const ings = (recipe.ingredients || []).map((g) => norm(g.name || g));
      const expHit = expiring.filter((n) => ings.some((g) => g.includes(norm(n)) || norm(n).includes(g)));
      if (expHit.length) { reasons.push(`Uses ${expHit.slice(0, 2).join(' and ')} before it goes off`); confidence = 'high'; }
      if (leftovers.length && i < 2) { reasons.push('Puts saved portions to work early'); if (confidence === 'low') confidence = 'medium'; }
      const dow = new Date(`${date}T12:00:00`).getDay();
      if (tough.has(dow) && Number(recipe.time) <= 30) reasons.push(`Kept simple for ${dayName(date)} — usually difficult`);
      if (Number(recipe.time) <= 30) reasons.push(`${recipe.time || 30} min cook`);
      if (Number(recipe.costPerServing) > 0) reasons.push(`About £${(Number(recipe.costPerServing) * portions).toFixed(2)} for the household`);
      if (!reasons.length) reasons.push('Fits taste and schedule');
      else if (reasons.length >= 2 && confidence === 'low') confidence = 'medium';
    }
    return { date, recipe, reasons, confidence };
  });
  const counts = new Map();
  for (const d of days) for (const g of d.recipe?.ingredients || []) {
    const key = canonicalName(g.name || g, state.aliasMemory) || norm(g.name || g);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const reused = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  let evaluated = null;
  try {
    evaluated = evaluateWeek(days.map((d) => d.recipe).filter(Boolean), { pantry: state.pantry, people: portions, weeklyBudget, today, dates: useDates });
  } catch { evaluated = null; }
  const estimatedCost = evaluated ? evaluated.estimatedCost : null;
  const overBudget = weeklyBudget && estimatedCost != null ? Math.max(0, Math.round((estimatedCost - weeklyBudget) * 100) / 100) : 0;
  const parts = [];
  if (expiring.length) parts.push(`uses ${expiring.slice(0, 2).join(' and ')} before expiry`);
  if (reused.length) parts.push(`reuses ${reused.join(', ')}`);
  if (leftovers.length) parts.push('uses saved portions first');
  if (overBudget > 0) parts.push(`about £${overBudget.toFixed(2)} over budget`);
  else if (weeklyBudget) parts.push('within budget');
  return {
    days, reused, estimatedCost, weeklyBudget: weeklyBudget || null, overBudget,
    busySkipped: dates.length - useDates.length,
    summary: parts.length ? `This week ${parts.join(' · ')}.` : 'A balanced week from the household book.',
    confidence: days.some((d) => d.confidence === 'high') ? 'medium' : 'low',
    provenance: [
      { source: 'pantry', detail: `${pantryNames.length} pantry rows` },
      { source: 'cooked', detail: `${(state.cooked || []).length} cooked meals` },
      { source: 'taste-ratings', detail: `${Object.keys(state.tasteRatings || {}).length} taste ratings` },
    ],
    note: run?.note || null,
  };
};
export const entriesForProposal = (proposal) => (proposal?.days || [])
  .filter((d) => d?.recipe?.id).map((d) => ({ date: d.date, slot: 'dinner', recipeId: d.recipe.id }));
