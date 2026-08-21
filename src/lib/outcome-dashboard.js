/**
 * Real outcome dashboard — measures what matters over time, never inventing a trend.
 *
 * Metrics (all over trailing windows, default 30/90 days):
 *  - planned spend vs actual spend
 *  - estimated savings (honest: offers + substitutions + price-baseline)
 *  - waste (rate, value, frequently discarded)
 *  - plan adherence (planned vs cooked, skip reasons)
 *  - pantry accuracy (confidence: confirmed vs probable vs unknown)
 *  - shopping-list completion (checked vs pending)
 *
 * Each metric states its own sample size and confidence; empty windows report "no data"
 * instead of a fabricated 0% or £0 saving.
 */

import { savingsSnapshot } from './savings.js';
import { wasteOutcome } from './pantry-lifecycle.js';
import { planOutcome } from './plan-outcome.js';
import { weekDates, dayStamp } from './kitchen.js';
import { mealPlanAdherence } from './planning-intelligence.js';
import { pantryConfidenceLevel } from './pantry-intelligence.js';

const round2 = (n) => Math.round(n * 100) / 100;

const windowDates = (today, days) => {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out.reverse();
};

export const outcomeDashboard = (state = {}, { today = state.day || dayStamp(), windowDays = 30 } = {}) => {
  const savings = savingsSnapshot(state, today, windowDays);
  const waste = wasteOutcome(state.pantry, state.waste, state.pantryEvents);
  const dates = windowDates(today, windowDays);
  const plan = planOutcome(state.plan, dates, state.mealPlanEvents, state.cooked, state.pantry);

  // Pantry accuracy: share of rows that are confirmed vs need confirmation
  const pantryRows = state.pantry || [];
  const confidenceRows = pantryRows.map((item) => pantryConfidenceLevel(item, today));
  const confirmed = confidenceRows.filter((c) => c.level === 'definite').length;
  const probable = confidenceRows.filter((c) => c.level === 'probable').length;
  const unknown = confidenceRows.filter((c) => c.level === 'unknown').length;
  const pantryAccuracy = pantryRows.length
    ? {
        total: pantryRows.length,
        confirmed,
        probable,
        unknown,
        pctConfirmed: Math.round((confirmed / pantryRows.length) * 100),
        assumption: `${confirmed} confirmed, ${probable} probable, ${unknown} unknown of ${pantryRows.length} rows.`,
      }
    : { total: 0, confirmed: 0, probable: 0, unknown: 0, pctConfirmed: null, assumption: 'No pantry rows — accuracy not calculable.' };

  // Shopping-list completion
  const list = state.shoppingList || [];
  const checked = list.filter((i) => i.checked).length;
  const completion = list.length ? Math.round((checked / list.length) * 100) : null;

  // Spend trend: last 4 weeks
  const weeklySpend = [];
  for (let w = 0; w < 4; w += 1) {
    const anchor = new Date(`${today}T12:00:00`);
    anchor.setDate(anchor.getDate() - w * 7);
    const stamp = anchor.toISOString().slice(0, 10);
    const weekShops = (state.shops || []).filter((s) => {
      const week = weekDates(stamp);
      return week.includes(s.date);
    });
    weeklySpend.push({
      week: `Week ${4 - w}`,
      spend: round2(weekShops.reduce((s, shop) => s + (Number(shop.total) || 0), 0)),
      trips: weekShops.length,
    });
  }
  weeklySpend.reverse();

  // Adherence from both new planOutcome and legacy mealPlanAdherence for compatibility
  const legacy = mealPlanAdherence(state.plan, dates, state.mealPlanEvents, state.cooked);

  return {
    window: { days: windowDays, from: savings.window.from, to: today },
    spend: {
      planned: savings.planned.basketCost,
      actual: savings.actual.receiptCost,
      baseline: savings.baseline.cost,
      assumption: `Planned £${savings.planned.basketCost} (coverage ${savings.planned.coverage}%), actual £${savings.actual.receiptCost} over ${windowDays}d, baseline £${savings.baseline.cost}. ${savings.planned.assumption}`,
    },
    savings: {
      honest: savings.savings.honestTotal,
      net: savings.savings.netAfterWaste,
      offers: savings.savings.offers,
      substitutions: savings.savings.substitutions,
      priceBased: savings.savings.priceBased,
      assumption: savings.savings.assumption,
    },
    waste: {
      rate: waste.wasteRate,
      value: waste.estimatedWastedValue,
      count: waste.totalWasteItems,
      frequentlyDiscarded: waste.frequentlyDiscarded,
      byCategory: waste.byCategory,
      assumption: waste.assumption,
    },
    adherence: {
      planned: plan.planned,
      cooked: plan.completed,
      skipped: plan.skipped,
      substituted: plan.substituted,
      takeaway: plan.takeaway,
      rate: plan.adherence,
      legacyRate: legacy.rate,
      topReason: plan.learning.topSkipLabel,
      suggestion: plan.learning.suggestion,
      assumption: plan.planned ? `${plan.completed} of ${plan.planned} planned meals cooked in window.` : 'No planned meals in window.',
    },
    pantryAccuracy,
    shoppingCompletion: {
      total: list.length,
      checked,
      pct: completion,
      assumption: list.length ? `${checked} of ${list.length} checked.` : 'No list items.',
    },
    trend: weeklySpend,
    ready: Boolean((state.shops || []).length || (state.plan && Object.keys(state.plan).length) || (state.waste || []).length),
  };
};

export const dashboardReady = (state) => (state.shops || []).length >= 1 || Object.keys(state.plan || {}).length >= 1;
