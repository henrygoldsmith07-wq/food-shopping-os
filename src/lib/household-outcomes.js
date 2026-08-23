/**
 * Real household outcomes — the numbers that say whether Forq actually helps.
 *
 * Every figure comes from something the household did: a recorded shop, a
 * marked meal, a discarded item, a timed plan. Nothing is modelled and
 * nothing is invented; where a metric can't be computed it says why.
 *
 * householdOutcomes(state) → one window of metrics with sample sizes and a
 * savings-confidence grade. beforeAfterOutcomes(state) → pre-Forq vs post-
 * Forq windows, gated on enough data in BOTH windows to be worth reading.
 */

import { dayStamp } from './kitchen.js';
import { planOutcome } from './plan-outcome.js';
import { pantryConfidenceLevel } from './pantry-intelligence.js';

const round2 = (n) => Math.round(n * 100) / 100;
const median = (values = []) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : round2((sorted[m - 1] + sorted[m]) / 2);
};

const shiftStamp = (today, days) => {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const windowDates = (today, days) => {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(shiftStamp(today, -i));
  return out;
};

const inWindow = (date, from, to) => {
  const stamp = String(date || '').slice(0, 10);
  return Boolean(stamp) && stamp >= from && stamp <= to;
};

/** "0.482 kg" | "450 g" | "2 x 200 g" → kg, or null when it isn't a mass. */
export const qtyToKg = (qty) => {
  if (qty == null) return null;
  if (typeof qty === 'number') return Number.isFinite(qty) ? round2(qty) : null;
  const text = String(qty).toLowerCase();
  // A multipack prefix ("2 x 200 g") multiplies the mass that follows.
  const packCount = Number((text.match(/^\s*(\d+)\s*x\s+/) || [])[1] || 1);
  let total = 0;
  let seen = false;
  for (const match of text.replace(/^\s*\d+\s*x\s+/, '').matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/g)) {
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    total += match[2] === 'kg' ? value : value / 1000;
    seen = true;
  }
  return seen ? round2(total * packCount) : null;
};

/**
 * Predicted vs observed depletion. Observed dates come from lifecycle events
 * (to: consumed/discarded/expired); predicted from the row's own expiry date.
 */
export const depletionAccuracy = (pantry = [], events = [], { today = dayStamp() } = {}) => {
  const byId = new Map(pantry.map((p) => [p.id, p]));
  const byName = new Map(pantry.map((p) => [String(p.name || '').toLowerCase(), p]));
  const samples = [];
  for (const e of events || []) {
    const to = String(e?.to || '').toLowerCase();
    if (!['consumed', 'discarded', 'expired'].includes(to)) continue;
    if (!inWindow(e?.date, '0000-01-01', today)) continue;
    const row = byId.get(e.itemId) || byName.get(String(e.name || '').toLowerCase());
    const predictedAt = row?.expiry || null;
    if (!predictedAt) continue;
    const observedAt = String(e.date).slice(0, 10);
    samples.push({
      name: e.name || row?.name || 'Unknown',
      outcome: to,
      predictedAt,
      observedAt,
      deltaDays: Math.round((new Date(`${observedAt}T12:00:00`) - new Date(`${predictedAt}T12:00:00`)) / 86400000),
    });
  }
  const deltas = samples.map((s) => s.deltaDays);
  const earlyDiscards = samples.filter((s) => s.outcome === 'discarded' && s.deltaDays < 0).length;
  return {
    samples,
    count: samples.length,
    medianDeltaDays: deltas.length ? Math.round(median(deltas)) : null,
    earlyDiscardPct: samples.length ? Math.round((earlyDiscards / samples.length) * 100) : null,
    assumption: samples.length
      ? `${samples.length} lifecycle event${samples.length === 1 ? '' : 's'} against dated stock; delta = observed − printed expiry.`
      : 'No lifecycle events against dated stock yet.',
  };
};

/** Ingredients bought in the window never seen consumed, discarded or kept. */
const unusedIngredients = (events = [], pantry = [], waste = [], { from, to }) => {
  const purchased = (events || []).filter((e) =>
    (String(e?.type || '') === 'purchase' || (!e?.type && !e?.to))
    && inWindow(e?.date, from, to));
  const usedNames = new Set();
  for (const e of events || []) {
    if (['consumed', 'discarded', 'expired'].includes(String(e?.to || '').toLowerCase())) {
      usedNames.add(String(e?.name || '').toLowerCase());
    }
  }
  for (const w of waste || []) usedNames.add(String(w?.name || '').toLowerCase());
  const kept = new Set(pantry.map((p) => String(p?.name || '').toLowerCase()));
  const unused = purchased.filter((e) => {
    const name = String(e?.name || '').toLowerCase();
    return name && !usedNames.has(name) && !kept.has(name);
  });
  return {
    count: unused.length,
    names: [...new Set(unused.map((e) => String(e.name).slice(0, 60)))],
    assumption: unused.length
      ? 'Bought in window, then gone from the pantry with no consumption, discard or remaining record.'
      : 'Every recent purchase was used, discarded or is still in the pantry.',
  };
};

const coreMetrics = (state = {}, { from, to, today }) => {
  const days = Math.max(1, Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000) + 1);
  const shops = (state.shops || []).filter((s) => inWindow(s?.date, from, to));
  const spendTotal = round2(shops.reduce((sum, shop) => sum + (Number(shop.total) || 0), 0));

  const wasteRows = (state.waste || []).filter((w) => inWindow(w?.date, from, to));
  const wasteValue = round2(wasteRows.reduce((sum, w) => sum + (Number(w.cost) || 0), 0));
  const weights = wasteRows.map((w) => qtyToKg(w.qty)).filter((v) => v != null);
  const wasteWeightKg = weights.length ? round2(weights.reduce((a, b) => a + b, 0)) : null;

  const plan = planOutcome(state.plan || {}, windowDates(to, days), state.mealPlanEvents, state.cooked, state.pantry);
  // Takeaways are recorded either as their own status or as a skip reason.
  const takeaways = (state.mealPlanEvents || []).filter((e) =>
    (e?.status === 'takeaway' || (e?.status === 'skipped' && e?.reason === 'takeaway'))
    && inWindow(e?.date, from, to)).length;

  const list = state.shoppingList || [];
  const checked = list.filter((i) => i.checked).length;

  const substitutions = (state.mealPlanEvents || []).filter((e) =>
    e?.status === 'substituted' && inWindow(e?.date, from, to)).length;

  return {
    window: { from, to, days, weeks: round2(days / 7) },
    spend: {
      total: spendTotal,
      weeklyAverage: shops.length ? round2((spendTotal / days) * 7) : 0,
      trips: shops.length,
      assumption: shops.length
        ? `Sum of ${shops.length} recorded trip totals.`
        : 'No recorded shops in this window.',
    },
    waste: {
      value: wasteValue,
      weightKg: wasteWeightKg,
      discardedItems: wasteRows.length,
      weightAssumption: weights.length
        ? `Weight known for ${weights.length} of ${wasteRows.length} discarded item${wasteRows.length === 1 ? '' : 's'}.`
        : 'Discards carry no weight — record quantities to measure waste by mass.',
    },
    adherence: {
      planned: plan.planned,
      cooked: plan.completed,
      skipped: plan.skipped,
      rate: plan.adherence,
    },
    leftoversReused: { count: plan.leftoversUsed, assumption: 'Planned slots cooked from a matching leftovers row.' },
    takeaways: {
      count: takeaways,
      perWeek: round2((takeaways / days) * 7),
      spend: null,
      spendAssumption: 'Record a cost when marking a takeaway to measure spend; none is invented.',
    },
    substitutions: { count: substitutions },
    planningTimeMs: (() => {
      const rows = (state.planningTimeHistory || []).filter((r) => {
        const stamp = r?.date || (r?.at ? new Date(r.at).toISOString().slice(0, 10) : null);
        return inWindow(stamp, from, to) && Number(r.durationMs) > 0;
      }).map((r) => Number(r.durationMs));
      return { median: rows.length ? Math.round(median(rows)) : null, samples: rows.length };
    })(),
    shoppingCompletion: list.length
      ? { checked, total: list.length, pct: Math.round((checked / list.length) * 100) }
      : null,
    unusedIngredients: unusedIngredients(state.pantryEvents, state.pantry, state.waste, { from, to }),
    _sampleSizes: {
      shops: shops.length,
      plannedMeals: plan.planned,
      wasteEvents: wasteRows.length,
    },
  };
};

const NOISE_FLOOR = { shops: 2, plannedMeals: 8 };

export const householdOutcomes = (state = {}, { today = state.day || dayStamp(), days = 28 } = {}) => {
  const core = coreMetrics(state, { from: shiftStamp(today, -(days - 1)), to: today, today });
  const confidence = (state.pantry || []).map((item) => pantryConfidenceLevel(item, today));
  const confirmed = confidence.filter((c) => c.level === 'definite').length;
  const depletion = depletionAccuracy(state.pantry || [], state.pantryEvents || [], { today });

  // Savings confidence grows with evidence volume and calendar coverage — a
  // fortnight of shops can't separate a pattern from a bad week.
  const tripCount = core._sampleSizes.shops;
  const savingsConfidence = tripCount >= 8 && days >= 56
    ? { level: 'high', assumption: 'Eight or more trips across eight weeks dampens noise and seasonality.' }
    : tripCount >= 4 && days >= 28
      ? { level: 'medium', assumption: 'Four-plus trips over four weeks — directional, not yet seasonal.' }
      : tripCount >= 1
        ? { level: 'low', assumption: 'Too few trips to separate pattern from noise.' }
        : { level: null, assumption: 'No shops recorded in the window.' };

  return {
    ...core,
    pantryAccuracy: {
      total: (state.pantry || []).length,
      pctConfirmed: (state.pantry || []).length
        ? Math.round((confirmed / (state.pantry || []).length) * 100)
        : null,
      depletion,
      assumption: depletion.assumption,
    },
    savingsConfidence,
    ready: tripCount >= NOISE_FLOOR.shops || core._sampleSizes.plannedMeals >= NOISE_FLOOR.plannedMeals,
    noiseFloor: { ...NOISE_FLOOR, note: `Below ${NOISE_FLOOR.shops} shops or ${NOISE_FLOOR.plannedMeals} planned meals the window is too small to read.` },
  };
};

/**
 * Pre-Forq vs post-Forq. The anchor is when real recording started (firstRunAt
 * once set, else the earliest evidence); the "before" window ends the day
 * before it, the "after" window trails today.
 */
export const beforeAfterOutcomes = (state = {}, { today = state.day || dayStamp(), postDays = 28, preDays = 28 } = {}) => {
  const firstShop = (state.shops || []).map((s) => s?.date).filter(Boolean).sort()[0] || null;
  const firstCooked = (state.cooked || []).map((c) => c?.date).filter(Boolean).sort()[0] || null;
  const firstLog = Object.keys(state.log || {}).sort()[0] || null;
  const firstWaste = (state.waste || []).map((w) => w?.date).filter(Boolean).sort()[0] || null;
  const anchor = state.firstRunAt?.slice(0, 10)
    || [firstShop, firstCooked, firstLog, firstWaste].filter(Boolean).sort()[0]
    || null;

  if (!anchor || anchor > today) {
    return { ready: false, reason: 'No dated evidence yet — record a shop or cook a planned meal.', anchor: null, before: null, after: null };
  }

  const beforeFrom = shiftStamp(anchor, -preDays);
  const beforeTo = shiftStamp(anchor, -1);
  const afterFrom = shiftStamp(today, -(postDays - 1));
  const before = coreMetrics(state, { from: beforeFrom, to: beforeTo, today });
  const after = coreMetrics(state, { from: afterFrom, to: today, today });

  const loudEnough = (m) => m._sampleSizes.shops >= NOISE_FLOOR.shops || m._sampleSizes.plannedMeals >= NOISE_FLOOR.plannedMeals;
  const ready = loudEnough(before) && loudEnough(after);

  const delta = (a, b) => (a == null || b == null ? null : round2(b - a));
  return {
    ready,
    anchor,
    windows: { before: { from: beforeFrom, to: beforeTo }, after: { from: afterFrom, to: today } },
    before,
    after,
    deltas: {
      weeklySpend: delta(before.spend.weeklyAverage, after.spend.weeklyAverage),
      wasteValue: delta(before.waste.value, after.waste.value),
      wasteWeightKg: delta(before.waste.weightKg, after.waste.weightKg),
      adherenceRate: delta(before.adherence.rate, after.adherence.rate),
      takeawaysPerWeek: delta(before.takeaways.perWeek, after.takeaways.perWeek),
    },
    noiseFloor: { ...NOISE_FLOOR, note: ready
      ? 'Both windows clear the noise floor.'
      : 'One window is too quiet to compare — keep recording.' },
  };
};
