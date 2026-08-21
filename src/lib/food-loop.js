import { weekDates } from './kitchen.js';

const inWeek = (date, dates) => dates.includes(date);

/**
 * The closed household food-management loop:
 * PANTRY → MEAL PLAN → SHOPPING LIST → PURCHASE → CONSUMPTION → LEFTOVERS/WASTE → LEARNING → BETTER NEXT PLAN
 *
 * The smallest useful measure of whether a household's food week is moving keeps the original
 * three core checkpoints (plan/shop/cook) for backward compatibility, but exposes the full
 * 8-step loop for the new Today/Plan/Shop/Pantry navigation and for the outcome dashboard.
 */
export const CLOSED_LOOP_STEPS = [
  { id: 'pantry', label: 'Pantry', hint: 'What you already have' },
  { id: 'plan', label: 'Plan', hint: 'Meals chosen' },
  { id: 'list', label: 'List', hint: 'Shopping list built' },
  { id: 'purchase', label: 'Purchase', hint: 'Receipt recorded' },
  { id: 'consumption', label: 'Cooked', hint: 'Meals actually cooked' },
  { id: 'leftovers', label: 'Leftovers', hint: 'Spare portions saved' },
  { id: 'waste', label: 'Waste', hint: 'What was binned vs used' },
  { id: 'learning', label: 'Learning', hint: 'Plan vs reality captured' },
];

export const weeklyFoodLoop = (state, today = state.day) => {
  const dates = weekDates(today);
  const plannedMeals = dates.reduce(
    (total, date) => total + Object.values(state.plan?.[date] || {}).filter(Boolean).length,
    0,
  );
  const cookedMeals = (state.cooked || []).filter((entry) => inWeek(entry.date, dates)).length;
  const shops = (state.shops || []).filter((shop) => inWeek(shop.date, dates));
  const pendingItems = (state.shoppingList || []).filter((item) => !item.checked).length;

  const pantryItems = (state.pantry || []).length;
  const leftovers = (state.pantry || []).filter((p) => p.cat === 'Leftovers').length
    + (state.cooked || []).filter((c) => inWeek(c.date, dates) && c.leftovers).length;
  const wasteEntries = (state.waste || []).filter((w) => {
    const d = w.date || w.at || '';
    return !d || inWeek(d.slice(0, 10), dates);
  }).length;
  const planEvents = (state.mealPlanEvents || []).filter((e) => inWeek(e.date, dates)).length;

  const planDone = plannedMeals > 0;
  const shopDone = shops.length > 0;
  const cookDone = cookedMeals > 0;

  // Full 8-step evaluation
  const pantryDone = pantryItems > 0;
  const listDone = (state.shoppingList || []).length > 0 || pantryDone;
  const purchaseDone = shopDone;
  const consumptionDone = cookDone;
  const leftoversDone = leftovers > 0 || cookDone;
  const wasteDone = wasteEntries > 0 || (pantryItems > 0 && cookedMeals > 0);
  const learningDone = planEvents > 0;

  const completion = [pantryDone, planDone, listDone, purchaseDone, consumptionDone, leftoversDone, wasteDone, learningDone]
    .filter(Boolean).length;

  const next = !planDone ? 'plan' : !shopDone && pendingItems > 0 ? 'shop' : !cookDone ? 'cook' : 'steady';
  const nextClosed = !pantryDone ? 'pantry' : !planDone ? 'plan' : !listDone ? 'list' : !purchaseDone ? 'purchase'
    : !consumptionDone ? 'consumption' : !leftoversDone ? 'leftovers' : !wasteDone ? 'waste' : !learningDone ? 'learning' : 'steady';

  return {
    plannedMeals,
    cookedMeals,
    shops: shops.length,
    pendingItems,
    next,
    nextClosed,
    pantryItems,
    leftovers,
    wasteEntries,
    planEvents,
    completion,
    totalSteps: 8,
    steps: [
      { id: 'plan', label: 'Meals', done: planDone },
      { id: 'shop', label: 'Basket', done: shopDone },
      { id: 'cook', label: 'Cooked', done: cookDone },
    ],
    closedLoop: {
      steps: CLOSED_LOOP_STEPS.map((s) => ({
        ...s,
        done: ({ pantry: pantryDone, plan: planDone, list: listDone, purchase: purchaseDone, consumption: consumptionDone, leftovers: leftoversDone, waste: wasteDone, learning: learningDone }[s.id] || false),
      })),
      next: nextClosed,
      completion,
      pct: Math.round((completion / 8) * 100),
    },
  };
};

/** Backwards-compatible alias for the extended loop */
export const householdFoodLoop = weeklyFoodLoop;

/** Classify features by how they serve the closed loop — for the audit view */
export const loopFeatureAudit = () => ([
  { feature: 'Pantry (stock, expiry, confidence, consumption)', loop: 'pantry', classification: 'directly supports core loop' },
  { feature: 'Meal Plan (calendar, generator, batch, variety)', loop: 'plan', classification: 'directly supports core loop' },
  { feature: 'Shopping list (aisle, route, offers, staples)', loop: 'list', classification: 'directly supports core loop' },
  { feature: 'Purchase / Receipt / Shop record', loop: 'purchase', classification: 'directly supports core loop' },
  { feature: 'Cooking / Consumption (pantry deduction, leftovers)', loop: 'consumption', classification: 'directly supports core loop' },
  { feature: 'Leftovers (save, reuse, cover)', loop: 'leftovers', classification: 'directly supports core loop' },
  { feature: 'Waste tracking (bin, cost, reasons)', loop: 'waste', classification: 'directly supports core loop' },
  { feature: 'Learning (adherence, waste profile, cooking time)', loop: 'learning', classification: 'directly supports core loop' },
  { feature: 'Price history & provenance', loop: 'list/purchase', classification: 'useful secondary feature' },
  { feature: 'Budget & savings', loop: 'purchase/learning', classification: 'useful secondary feature' },
  { feature: 'Reminders (expiry, meal)', loop: 'consumption', classification: 'useful secondary feature' },
  { feature: 'Household & cloud sync', loop: 'all', classification: 'useful secondary feature' },
  { feature: 'Food logging / Nutrition', loop: 'consumption', classification: 'useful secondary feature — progressive disclosure' },
  { feature: 'Recipes library', loop: 'plan', classification: 'useful secondary feature — progressive disclosure' },
  { feature: 'Exercise / Fasting / CGM / Bloods', loop: '—', classification: 'disconnected — hidden behind enabledTools' },
  { feature: 'Footprint / Eco scores', loop: '—', classification: 'low-value complexity — optional' },
  { feature: 'AI generation (when deterministic suffices)', loop: 'plan', classification: 'redundant — replaced where possible' },
]);
