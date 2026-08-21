/**
 * Pulse connector.
 *
 * Pulse (the Le Studio host app) asks each tool for a snapshot of what's
 * happening right now. This builds Forq's from the same state the screens read
 * — nothing is stored twice, nothing is fetched. Every figure carries the
 * date/context it came from, so a number in Pulse is never a bare number.
 */

import { expiringSoon, pantryValue, spentInMonth, spentInWeek } from './kitchen.js';
import { leftoverItems } from './mealplan.js';
import { shoppingNameKey } from './shopping.js';
import { canonicalName } from './aliases.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * One snapshot of the kitchen: what's planned, what's on the list, what the
 * pantry holds, what it's worth, and what needs using. `timestamp` is ISO so
 * the host can tell how fresh the numbers are.
 */
export const forqSnapshot = (state = {}, { now = new Date() } = {}) => {
  const day = state.day || new Date().toISOString().slice(0, 10);
  const planSlots = Object.values(state.plan || {}).reduce(
    (n, dayPlan) => n + Object.values(dayPlan || {}).filter(Boolean).length, 0,
  );
  const leftovers = leftoverItems(state.pantry || []);
  const expiring = expiringSoon(state.pantry || [], 3, day);
  const list = state.shoppingList || [];
  const pantry = state.pantry || [];
  return {
    app: 'forq',
    timestamp: now.toISOString(),
    day,
    mealPlan: {
      plannedMeals: planSlots,
    },
    shopping: {
      listItems: list.length,
      ticked: list.filter((i) => i.checked).length,
      estimatedTotal: round2(list.reduce((sum, i) => sum + (Number(i.price) || 0), 0)),
      recurringDue: staplesDue(state),
    },
    pantry: {
      items: pantry.length,
      value: round2(pantryValue(pantry)),
      expiringSoon: expiring.length,
      expiringNames: expiring.slice(0, 5).map((p) => p.name),
      leftovers: leftovers.length,
      leftoverNames: leftovers.slice(0, 5).map((p) => p.name),
    },
    spending: {
      thisWeek: round2(spentInWeek(state.shops || [], day)),
      thisMonth: round2(spentInMonth(state.shops || [], day)),
      weeklyBudget: Number(state.weeklyBudget) || 0,
      monthlyBudget: Number(state.monthlyBudget) || 0,
    },
    cookedToday: (state.cooked || []).filter((c) => c.date === day).length,
  };
};

const staplesDue = (state) => {
  const purchases = new Map();
  const key = (name) => canonicalName(name);
  for (const shop of [...(state.shops || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const item of shop.items || []) {
      const k = key(item.name);
      if (!k) continue;
      if (!purchases.has(k)) purchases.set(k, { name: item.name, dates: [] });
      purchases.get(k).dates.push(shop.date);
    }
  }
  const have = new Set([...(state.pantry || []).map((p) => key(p.name)), ...(state.shoppingList || []).map((i) => shoppingNameKey(i.name))]);
  const due = [];
  for (const row of purchases.values()) {
    if (row.dates.length < 3 || have.has(key(row.name))) continue;
    const recent = row.dates.slice(-3);
    const gaps = recent.slice(1).map((date, i) =>
      Math.round((new Date(`${date}T12:00:00`) - new Date(`${recent[i]}T12:00:00`)) / 86400000));
    const cadence = Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length));
    const since = Math.round((new Date(`${state.day}T12:00:00`) - new Date(`${recent[recent.length - 1]}T12:00:00`)) / 86400000);
    if (since >= cadence * 0.8) due.push({ name: row.name, since, cadence });
  }
  return due.slice(0, 5);
};

/** Tell the host app, if it's listening, that a fresh snapshot is ready. */
export const pulseForq = (state) => {
  if (typeof window === 'undefined') return null;
  const payload = forqSnapshot(state);
  const event = new CustomEvent('forq:pulse', { detail: payload });
  window.dispatchEvent(event);
  return payload;
};
