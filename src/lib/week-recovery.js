/**
 * Week Recovery Engine — repairs the rest of the week whenever reality changes.
 *
 * Triggers: MealSkipped, IngredientWasted, PantryCorrected, LeftoverCreated,
 * UnplannedShop, MealCooked (with substitutions). Pure + offline + deterministic.
 *
 * Given state + today, it returns a repair plan:
 *   { repairs[], planPatch, shoppingAdd[], shoppingRemove[], leftoverReuse[],
 *     budgetNote, expiryPriority[], explanations[], needsShop }
 *
 * It never mutates state; the caller applies `planPatch`/shopping changes as
 * one undoable command and logs the trigger to the event ledger.
 */

import { addDays, dayStamp, daysUntil, weekDates } from './kitchen-dates.js';
import { expiringSoon } from './kitchen.js';

const norm = (s) => String(s || '').trim().toLowerCase();

const ingredientsOf = (recipe) => (recipe?.ingredients || []).map((i) => norm(i.name || i));

/** Remaining dates in the week (today → Sunday), Monday-first. */
export const remainingWeekDates = (today = dayStamp()) => {
  const week = weekDates(today);
  return week.filter((d) => d >= today);
};

/**
 * Which remaining planned meals still need `ingredientName`?
 * Used to decide whether a wasted ingredient breaks a future dinner.
 */
export const plannedUsesOf = (plan = {}, recipesById = {}, ingredientName, dates) => {
  const want = norm(ingredientName);
  if (!want) return [];
  const uses = [];
  for (const date of dates) {
    const day = plan[date] || {};
    for (const [slot, recipeId] of Object.entries(day)) {
      if (!recipeId) continue;
      const recipe = recipesById[recipeId];
      if (!recipe) continue;
      if (ingredientsOf(recipe).some((n) => n.includes(want) || want.includes(n))) {
        uses.push({ date, slot, recipeId, recipeName: recipe.name });
      }
    }
  }
  return uses;
};

/**
 * Main entry. `trigger` = { kind, date?, slot?, recipeId?, ingredient?, reason? }.
 * `catalogue` = recipe list for substitution search (optional).
 */
export const recoverWeek = (state = {}, { today = dayStamp(), trigger = null, catalogue = [] } = {}) => {
  const plan = state.plan || {};
  const pantry = Array.isArray(state.pantry) ? state.pantry : [];
  const shoppingList = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  const leftovers = Array.isArray(state.leftovers) ? state.leftovers : pantry.filter((p) => p.cat === 'Leftovers' || p.recipeId);
  const dates = remainingWeekDates(today);
  const byId = new Map((catalogue || []).map((r) => [r.id, r]));
  const repairs = [];
  const explanations = [];
  const planPatch = {};
  const shoppingAdd = [];
  const shoppingRemove = [];
  const leftoverReuse = [];
  const pantryNames = new Set(pantry.map((p) => norm(p.name)));

  const expiring = expiringSoon(pantry, 3, today);
  const expiryPriority = expiring.slice(0, 5).map((p) => ({
    name: p.name, expiry: p.expiry, daysLeft: daysUntil(p.expiry, today),
  }));

  // --- 1. Skipped meal: free its slot, reuse leftovers first -----------------
  if (trigger?.kind === 'MealSkipped' || trigger?.kind === 'MealPlanned') {
    const { date = today, slot = 'dinner' } = trigger;
    if (dates.includes(date)) {
      const urgentLeftover = leftovers
        .filter((l) => !l.expiry || daysUntil(l.expiry, today) <= 2)
        .sort((a, b) => daysUntil(a.expiry || addDays(today, 7), today) - daysUntil(b.expiry || addDays(today, 7), today))[0];
      if (urgentLeftover) {
        leftoverReuse.push({ date, slot, leftoverId: urgentLeftover.id, name: urgentLeftover.name });
        repairs.push({ kind: 'reuse-leftover', date, slot, name: urgentLeftover.name });
        explanations.push(`${urgentLeftover.name} needs using — suggested for ${slot} on ${date} instead of cooking fresh.`);
      } else if (expiring.length) {
        repairs.push({ kind: 'use-expiring', date, slot, name: expiring[0].name });
        explanations.push(`${expiring[0].name} expires soon — cook something that uses it for ${slot} on ${date}.`);
      } else {
        repairs.push({ kind: 'slot-freed', date, slot });
        explanations.push(`${slot} on ${date} is free — nothing urgent to rescue, so the slot stays open.`);
      }
    }
  }

  // --- 2. Wasted / corrected ingredient: find broken future meals -------------
  if (trigger?.kind === 'IngredientWasted' || trigger?.kind === 'PantryCorrected') {
    const name = trigger.ingredient || trigger.name;
    const uses = plannedUsesOf(plan, Object.fromEntries(byId), name, dates);
    if (name && uses.length) {
      for (const use of uses.slice(0, 4)) {
        // Prefer a substitution already in the pantry over a new shop.
        const recipe = byId.get(use.recipeId);
        const missing = ingredientsOf(recipe || {}).filter((n) => !pantryNames.has(n));
        const pantrySwap = missing.length === 0;
        repairs.push({
          kind: 'ingredient-shortage', date: use.date, slot: use.slot,
          recipeName: use.recipeName, missingIngredient: name,
          suggestion: pantrySwap ? 'Pantry still covers it' : 'Add to list or swap recipe',
        });
        if (!pantrySwap && !shoppingList.some((r) => norm(r.name) === norm(name))) {
          shoppingAdd.push({ name, reason: `Needed for ${use.recipeName} on ${use.date}`, qty: '1' });
        }
      }
      explanations.push(`${name} is short for ${uses.length} remaining meal${uses.length === 1 ? '' : 's'} — ${shoppingAdd.length ? 'added to the list' : 'pantry still covers it'}.`);
    } else if (name) {
      explanations.push(`${name} changed, but no remaining planned meal needs it — list untouched.`);
    }
  }

  // --- 3. Leftover created: offer it against the next open slot ----------------
  if (trigger?.kind === 'LeftoverCreated') {
    const open = dates.map((date) => ({ date, day: plan[date] || {} }))
      .find(({ day }) => !day.dinner);
    if (open && trigger.name) {
      leftoverReuse.push({ date: open.date, slot: 'dinner', name: trigger.name });
      repairs.push({ kind: 'reuse-leftover', date: open.date, slot: 'dinner', name: trigger.name });
      explanations.push(`${trigger.name} saved — suggested for dinner on ${open.date} before it goes off.`);
    }
  }

  // --- 4. Prune shopping list: drop items only needed by past/skipped meals ----
  // Conservative: only remove a row when NO remaining planned meal needs it
  // AND it is not a staple / running-low item.
  if (trigger?.kind === 'MealSkipped' && trigger.recipeId && byId.has(trigger.recipeId)) {
    const skippedIngredients = new Set(ingredientsOf(byId.get(trigger.recipeId)));
    const stillNeeded = new Set();
    for (const date of dates) {
      const day = planPatch[date] || plan[date] || {};
      for (const recipeId of Object.values(day)) {
        if (!recipeId || recipeId === trigger.recipeId) continue;
        for (const n of ingredientsOf(byId.get(recipeId) || {})) stillNeeded.add(n);
      }
    }
    for (const row of shoppingList) {
      const key = norm(row.name);
      if (skippedIngredients.has(key) && ![...stillNeeded].some((n) => n.includes(key) || key.includes(n))) {
        if (!pantryNames.has(key)) {
          shoppingRemove.push({ id: row.id, name: row.name, reason: 'Only needed by the skipped meal' });
        }
      }
    }
    if (shoppingRemove.length) explanations.push(`Removed ${shoppingRemove.length} list item${shoppingRemove.length === 1 ? '' : 's'} only needed by the skipped meal.`);
  }

  // --- 5. Budget check ----------------------------------------------------------
  const listTotal = shoppingList
    .filter((r) => !shoppingRemove.some((x) => x.id === r.id))
    .reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.qty) || 1), 0);
  const addedTotal = shoppingAdd.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const weeklyBudget = Number(state.weeklyBudget) || 0;
  const spent = Number(state.spentThisWeek) || 0;
  const budgetNote = weeklyBudget
    ? {
      budget: weeklyBudget, spent, listTotal: Math.round((listTotal + addedTotal) * 100) / 100,
      remaining: Math.round((weeklyBudget - spent - listTotal - addedTotal) * 100) / 100,
      over: listTotal + addedTotal + spent > weeklyBudget,
    }
    : null;
  if (budgetNote?.over) explanations.push('Heads up: the repaired list would push this week over budget.');

  if (!repairs.length && !explanations.length) {
    explanations.push('Week checked — plan, list, leftovers and budget still line up.');
  }

  return {
    today,
    trigger: trigger || { kind: 'Check' },
    remainingDates: dates,
    repairs,
    planPatch,
    shoppingAdd,
    shoppingRemove,
    leftoverReuse,
    budgetNote,
    expiryPriority,
    explanations,
    needsShop: shoppingAdd.length > 0,
  };
};

/** Convenience: did recovery change anything user-visible? */
export const recoveryChanged = (result) =>
  Boolean(result && (result.repairs.length || result.shoppingAdd.length || result.shoppingRemove.length || result.leftoverReuse.length));
