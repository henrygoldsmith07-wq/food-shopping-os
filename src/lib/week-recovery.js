/**
 * Week Recovery Engine — repairs the rest of the week whenever reality changes.
 *
 * Triggers: MealSkipped, IngredientWasted, PantryCorrected, LeftoverCreated,
 * UnplannedShop, MealCooked (with substitutions). Pure + offline + deterministic.
 *
 * Recovery is state-driven, not only trigger-driven: the engine scans the
 * remaining week for real problems — skipped slots that never got refilled,
 * broken meals (an ingredient the pantry no longer covers), urgent leftovers
 * with no home, and shopping rows nothing needs anymore — then repairs each
 * with a MINIMUM-DISRUPTION strategy:
 *
 *   1. reuse a leftover (no new food, frees a slot)          — disruption 0
 *   2. swap in a recipe the pantry already covers            — disruption 1
 *   3. keep the recipe, add the missing item to the list     — disruption 2
 *   4. free the slot and let the household choose             — disruption 3
 *
 * A cheaper repair always wins over a dearer one for the same problem; ties
 * break deterministically on coverage then id.
 *
 * Given state + today, it returns a repair plan:
 *   { repairs[], planPatch, shoppingAdd[], shoppingRemove[], leftoverReuse[],
 *     budgetNote, expiryPriority[], explanations[], needsShop, disruption }
 *
 * It never mutates state; the caller applies the plan with the single
 * undoable command `applyWeekRecovery` (store-commands.js) and the
 * WeekRecovered ledger event carries the summary for replay.
 */

import { dayStamp, daysUntil, weekDates } from './kitchen-dates.js';
import { expiringSoon } from './kitchen.js';

const norm = (s) => String(s || '').trim().toLowerCase();

const ingredientsOf = (recipe) => (recipe?.ingredients || []).map((i) => norm(i.name || i));

/** Infer the newest unresolved Plan → Shop → Eat event that needs recovery. */
export const inferWeekRecoveryTrigger = (state = {}, recipeBook = []) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const recipesById = Object.fromEntries((recipeBook || []).filter((r) => r?.id).map((r) => [r.id, r]));
  const pantryById = new Map((Array.isArray(state.pantry) ? state.pantry : []).filter((p) => p?.id).map((p) => [p.id, p]));
  let recoveryIndex = -1;
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    if (ledger[i]?.type === 'WeekRecovered') {
      recoveryIndex = i;
      break;
    }
  }
  const rows = recoveryIndex >= 0 ? ledger.slice(recoveryIndex + 1) : ledger;

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const event = rows[i] || {};
    if (event.type === 'MealSkipped') {
      return {
        kind: 'MealSkipped',
        date: event.date,
        slot: event.slot || 'dinner',
        recipeId: event.recipeId || event.plannedRecipeId,
      };
    }
    if (event.type === 'IngredientWasted') {
      return { kind: 'IngredientWasted', ingredient: event.ingredient || event.name };
    }
    if (event.type === 'PantryCorrected') {
      const corrections = Array.isArray(event.corrections) ? event.corrections : [];
      const names = corrections
        .map((c) => c?.name || c?.itemName || pantryById.get(c?.id)?.name)
        .filter(Boolean);
      return { kind: 'PantryCorrected', name: names[0] || event.name || event.ingredient, corrections };
    }
    if (event.type === 'LeftoverCreated') {
      return { kind: 'LeftoverCreated', name: event.name };
    }
    if (event.type === 'IngredientPurchased' && (event.unplanned || event.offPlan || event.triggerKind === 'UnplannedShop')) {
      return { kind: 'UnplannedShop', items: event.items || [] };
    }
    if (event.type === 'MealCooked' && event.substituted && event.plannedRecipeId) {
      const actualRecipe = recipesById[event.recipeId] || recipesById[event.actualRecipeId] || null;
      return {
        kind: 'MealCooked',
        substituted: true,
        plannedRecipeId: event.plannedRecipeId,
        substitutionIngredients: event.substitutionIngredients || ingredientsOf(actualRecipe),
      };
    }
  }

  // Restored backups and older installs may not have a ledger yet.
  if (ledger.length) return null;
  const skipped = [...(Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [])]
    .reverse().find((e) => e?.status === 'skipped' && (!state.day || !e.date || e.date >= state.day));
  if (skipped) return { kind: 'MealSkipped', date: skipped.date, slot: skipped.slot || 'dinner', recipeId: skipped.plannedRecipeId };
  const wasted = [...(Array.isArray(state.waste) ? state.waste : [])].reverse()[0];
  if (wasted?.name) return { kind: 'IngredientWasted', ingredient: wasted.name };
  const leftover = [...(Array.isArray(state.leftovers) ? state.leftovers : [])]
    .reverse().find((l) => l?.createdAt === state.day);
  if (leftover?.name) return { kind: 'LeftoverCreated', name: leftover.name };
  return null;
};


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

/** Coverage of a recipe against the pantry: how many ingredients are already owned. */
export const pantryCoverageOf = (recipe, pantryNames) => {
  const ingredients = ingredientsOf(recipe);
  if (!ingredients.length) return { have: 0, total: 0, pct: 0, missing: [] };
  const have = ingredients.filter((n) => pantryNames.has(n));
  const missing = ingredients.filter((n) => !pantryNames.has(n));
  return { have: have.length, total: ingredients.length, pct: Math.round((have.length / ingredients.length) * 100), missing };
};

/**
 * Minimum-disruption candidate for a slot: a catalogue recipe the pantry
 * fully covers, preferring ones that use expiring ingredients and share a
 * cuisine with the broken recipe. Deterministic: coverage desc, shared
 * ingredients desc, time asc, id asc.
 */
export const bestPantrySwap = ({ catalogue = [], avoidIds = [], pantryNames = new Set(), expiringNames = new Set(), wasRecipe = null }) => {
  const wasIngredients = new Set(ingredientsOf(wasRecipe));
  const wasCuisine = norm(wasRecipe?.cuisine);
  const rows = [];
  for (const recipe of catalogue) {
    if (!recipe?.id || avoidIds.includes(recipe.id) || recipe.id === wasRecipe?.id) continue;
    const coverage = pantryCoverageOf(recipe, pantryNames);
    if (coverage.total === 0 || coverage.missing.length > 0) continue; // must be fully covered
    const expiringHits = ingredientsOf(recipe).filter((n) => expiringNames.has(n)).length;
    const shared = ingredientsOf(recipe).filter((n) => wasIngredients.has(n)).length;
    const sameCuisine = wasCuisine && norm(recipe.cuisine) === wasCuisine ? 1 : 0;
    rows.push({ recipe, coverage, expiringHits, shared, sameCuisine, time: Number(recipe.time) || 0 });
  }
  if (!rows.length) return null;
  rows.sort((a, b) =>
    b.expiringHits - a.expiringHits
    || b.shared - a.shared
    || b.sameCuisine - a.sameCuisine
    || a.time - b.time
    || String(a.recipe.id).localeCompare(String(b.recipe.id)));
  return rows[0];
};

/**
 * A repair candidate with its disruption rank. Lower = gentler.
 * 0 reuse-leftover · 1 pantry-swap · 2 add-to-list · 3 slot-freed
 */
const CANDIDATE_DISRUPTION = { 'reuse-leftover': 0, 'pantry-swap': 1, 'add-to-list': 2, 'slot-freed': 3 };

/**
 * Main entry. `trigger` = { kind, date?, slot?, recipeId?, ingredient?, reason? }.
 * `catalogue` = recipe list for substitution search (optional).
 *
 * Without a trigger, the engine audits the remaining week on its own — the
 * same repairs the explicit triggers name, found by scanning, so a recovery
 * preview on Home is always current rather than tied to one event.
 */
export const recoverWeek = (state = {}, { today = dayStamp(), trigger = null, catalogue = [] } = {}) => {
  const plan = state.plan || {};
  const pantry = Array.isArray(state.pantry) ? state.pantry : [];
  const shoppingList = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  // A saved portion has two homes — the first-class leftovers slice and
  // pantry rows marked Leftovers. Both count, deduped by id.
  const leftoverRows = new Map();
  for (const p of pantry) {
    if (p.cat === 'Leftovers' || p.recipeId) leftoverRows.set(p.id, p);
  }
  for (const l of (Array.isArray(state.leftovers) ? state.leftovers : [])) {
    if (l && !leftoverRows.has(l.id)) leftoverRows.set(l.id, l);
  }
  const leftovers = [...leftoverRows.values()];
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const mealPlanEvents = Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [];
  const dates = remainingWeekDates(today);
  const byId = new Map((catalogue || []).map((r) => [r.id, r]));
  const recipesById = Object.fromEntries(byId);
  const repairs = [];
  const explanations = [];
  const planPatch = {};
  const shoppingAdd = [];
  const shoppingRemove = [];
  const leftoverReuse = [];
  const pantryNames = new Set(pantry.map((p) => norm(p.name)));
  const listNames = new Set(shoppingList.map((r) => norm(r.name)));

  const expiring = expiringSoon(pantry, 3, today);
  const expiringNames = new Set(expiring.map((p) => norm(p.name)));
  const expiryPriority = expiring.slice(0, 5).map((p) => ({
    name: p.name, expiry: p.expiry, daysLeft: daysUntil(p.expiry, today),
  }));

  /** The most urgent leftover, soonest expiry first. */
  const urgentLeftover = () => leftovers
    .filter((l) => !l.expiry || daysUntil(l.expiry, today) <= 2)
    .sort((a, b) => daysUntil(a.expiry || `${today}+7`, today) - daysUntil(b.expiry || `${today}+7`, today))[0] || null;

  /** A remaining dinner slot with no recipe in it. */
  const openSlot = () => dates
    .map((date) => ({ date, day: plan[date] || {} }))
    .find(({ day }) => !day.dinner) || null;

  /** Slots recorded skipped (or past) that the plan still shows as planned. */
  const skippedSlotDone = new Set(mealPlanEvents
    .filter((e) => e.status === 'skipped')
    .map((e) => `${e.date}|${e.slot}`));

  /**
   * Repair one broken/freed slot with the least disruptive option that
   * actually solves it. Exactly one repair per problem — never a pile.
   */
  const repairSlot = (date, slot, wasRecipeId, problemLabel) => {
    const wasRecipe = byId.get(wasRecipeId) || null;
    const options = [];

    // Option 0: an urgent leftover fills the slot.
    const leftover = urgentLeftover();
    if (leftover && !leftoverReuse.some((r) => r.leftoverId === leftover.id)) {
      options.push({
        kind: 'reuse-leftover',
        apply: () => {
          leftoverReuse.push({ date, slot, leftoverId: leftover.id, name: leftover.name });
          planPatch[date] = { ...(planPatch[date] || plan[date] || {}), [slot]: null };
          repairs.push({ kind: 'reuse-leftover', date, slot, name: leftover.name, disruption: 0, because: problemLabel });
          explanations.push(`${leftover.name} needs using — suggested for ${slot} on ${date} instead of cooking fresh.`);
        },
      });
    }

    // Option 1: a catalogue recipe the pantry already fully covers.
    const swap = bestPantrySwap({ catalogue, avoidIds: [], pantryNames, expiringNames, wasRecipe });
    if (swap) {
      options.push({
        kind: 'pantry-swap',
        apply: () => {
          planPatch[date] = { ...(planPatch[date] || plan[date] || {}), [slot]: swap.recipe.id };
          repairs.push({ kind: 'pantry-swap', date, slot, recipeId: swap.recipe.id, recipeName: swap.recipe.name, disruption: 1, because: problemLabel });
          explanations.push(`${swap.recipe.name} is already covered by your pantry${swap.expiringHits ? ' and uses food expiring soon' : ''} — suggested for ${slot} on ${date}.`);
        },
      });
    }

    // Option 2: keep the planned recipe, buy what's missing (only when the
    // plan has a real recipe and the missing rows are not already listed).
    if (wasRecipeId && byId.has(wasRecipeId)) {
      const missing = pantryCoverageOf(wasRecipe, pantryNames).missing
        .filter((n) => !pantryNames.has(n) && !listNames.has(n));
      if (missing.length) {
        options.push({
          kind: 'add-to-list',
          apply: () => {
            for (const name of missing.slice(0, 4)) {
              shoppingAdd.push({ name, reason: `Needed for ${wasRecipe.name} on ${date}`, qty: 1, price: 0, priority: 'normal' });
            }
            repairs.push({ kind: 'add-to-list', date, slot, recipeId: wasRecipeId, recipeName: wasRecipe.name, missing, disruption: 2, because: problemLabel });
            explanations.push(`${wasRecipe.name} stays on ${date} — ${missing.join(', ')} added to the list.`);
          },
        });
      }
    }

    // Option 3: free the slot and say so honestly.
    options.push({
      kind: 'slot-freed',
      apply: () => {
        planPatch[date] = { ...(planPatch[date] || plan[date] || {}), [slot]: null };
        repairs.push({ kind: 'slot-freed', date, slot, disruption: 3, because: problemLabel });
        explanations.push(`${slot} on ${date} is freed — nothing urgent to rescue, so the choice stays yours.`);
      },
    });

    options.sort((a, b) => CANDIDATE_DISRUPTION[a.kind] - CANDIDATE_DISRUPTION[b.kind]);
    options[0].apply();
  };

  // --- 1. MealSkipped (explicit) or a remaining skipped slot still planned ----
  const skippedSlots = [];
  if (trigger?.kind === 'MealSkipped' || trigger?.kind === 'MealPlanned') {
    const { date = today, slot = 'dinner', recipeId = null } = trigger;
    if (dates.includes(date)) skippedSlots.push({ date, slot, recipeId });
  } else {
    // Scan: a slot the household recorded as skipped that the plan still shows.
    for (const e of mealPlanEvents) {
      if (e.status !== 'skipped' || !dates.includes(e.date)) continue;
      const key = `${e.date}|${e.slot}`;
      if (skippedSlotDone.has(key) && plan[e.date]?.[e.slot]) skippedSlots.push({ date: e.date, slot: e.slot, recipeId: plan[e.date][e.slot] });
    }
    // Past-due slots still planned for remaining dates whose meal was never
    // cooked or skipped (silent misses) are left alone — plan-outcome owns them.
  }
  for (const { date, slot, recipeId } of skippedSlots) {
    repairSlot(date, slot, recipeId || plan[date]?.[slot] || null, 'a skipped meal');
  }

  // --- 2. Wasted / corrected ingredient: repair the broken future meals ----
  if (trigger?.kind === 'IngredientWasted' || trigger?.kind === 'PantryCorrected') {
    const name = trigger.ingredient || trigger.name;
    const uses = plannedUsesOf(plan, recipesById, name, dates);
    if (name && uses.length) {
      for (const use of uses.slice(0, 4)) {
        // Prefer a pantry-covered swap; only if none exists does it become a buy.
        const wasRecipe = byId.get(use.recipeId);
        const coverage = pantryCoverageOf(wasRecipe, pantryNames);
        const wastedNowMissing = coverage.missing.some((n) => n.includes(norm(name)) || norm(name).includes(n));
        const swap = bestPantrySwap({ catalogue, avoidIds: [use.recipeId], pantryNames, expiringNames, wasRecipe });
        if (swap && wastedNowMissing) {
          planPatch[use.date] = { ...(planPatch[use.date] || plan[use.date] || {}), [use.slot]: swap.recipe.id };
          repairs.push({ kind: 'pantry-swap', date: use.date, slot: use.slot, recipeId: swap.recipe.id, recipeName: swap.recipe.name, wasRecipeName: use.recipeName, missingIngredient: name, disruption: 1, because: 'a wasted ingredient' });
          explanations.push(`${name} is gone, so ${use.recipeName} on ${use.date} swaps to ${swap.recipe.name} — already in your pantry.`);
        } else {
          if (name && !pantryNames.has(norm(name)) && !listNames.has(norm(name)) && !shoppingAdd.some((r) => norm(r.name) === norm(name))) {
            shoppingAdd.push({ name, reason: `Needed for ${use.recipeName} on ${use.date}`, qty: 1, price: 0, priority: 'high' });
          }
          repairs.push({ kind: 'add-to-list', date: use.date, slot: use.slot, recipeId: use.recipeId, recipeName: use.recipeName, missingIngredient: name, disruption: 2, because: 'a wasted ingredient' });
        }
      }
      if (shoppingAdd.length) explanations.push(`${name} is short for ${uses.length} remaining meal${uses.length === 1 ? '' : 's'} — added to the list.`);
    } else if (name) {
      explanations.push(`${name} changed, but no remaining planned meal needs it — list untouched.`);
    }
  }

  // --- 3. Leftover created: offer it against the next open slot ----------------
  if (trigger?.kind === 'LeftoverCreated') {
    const open = openSlot();
    if (open && trigger.name && !urgentLeftover()) {
      leftoverReuse.push({ date: open.date, slot: 'dinner', name: trigger.name });
      repairs.push({ kind: 'reuse-leftover', date: open.date, slot: 'dinner', name: trigger.name, disruption: 0, because: 'a saved leftover' });
      explanations.push(`${trigger.name} saved — suggested for dinner on ${open.date} before it goes off.`);
    } else if (trigger.name && !open) {
      explanations.push(`${trigger.name} saved — every remaining slot already has a meal, so it waits as a fallback.`);
    }
  }

  // --- 4. UnplannedShop: bought items off-plan leave the list ------------------
  if (trigger?.kind === 'UnplannedShop') {
    const bought = new Set((trigger.items || []).map(norm).filter(Boolean));
    if (bought.size) {
      for (const row of shoppingList) {
        if (bought.has(norm(row.name))) {
          shoppingRemove.push({ id: row.id, name: row.name, reason: 'Already bought in the unplanned shop' });
        }
      }
      if (shoppingRemove.length) explanations.push(`Removed ${shoppingRemove.length} list item${shoppingRemove.length === 1 ? '' : 's'} the unplanned shop already covered.`);
    }
  }

  // --- 5. MealCooked (with substitutions): retire the swapped-out rows ---------
  if (trigger?.kind === 'MealCooked' && trigger.substituted && trigger.plannedRecipeId && byId.has(trigger.plannedRecipeId)) {
    const cookedIngredients = new Set((trigger.substitutionIngredients || []).map(norm).filter(Boolean));
    if (cookedIngredients.size) {
      const plannedIngredients = new Set(ingredientsOf(byId.get(trigger.plannedRecipeId)));
      const orphaned = [...plannedIngredients].filter((n) => !cookedIngredients.has(n) && !pantryNames.has(n));
      for (const row of shoppingList) {
        if (orphaned.some((n) => norm(row.name).includes(n) || n.includes(norm(row.name)))) {
          shoppingRemove.push({ id: row.id, name: row.name, reason: 'The substitution no longer needs it' });
        }
      }
      if (shoppingRemove.length) explanations.push(`Removed ${shoppingRemove.length} row${shoppingRemove.length === 1 ? '' : 's'} the cooked substitution made unnecessary.`);
    }
  }

  // --- 6. Prune shopping list: drop rows only needed by skipped meals ------------
  if ((trigger?.kind === 'MealSkipped') && trigger.recipeId && byId.has(trigger.recipeId)) {
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

  // --- 7. Budget check ----------------------------------------------------------
  const removalSavings = shoppingRemove.reduce((sum, r) => {
    const row = shoppingList.find((x) => x.id === r.id);
    return sum + (Number(row?.price) || 0) * (Number(row?.qty) || 1);
  }, 0);
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
      removalSavings: Math.round(removalSavings * 100) / 100,
    }
    : null;
  if (budgetNote?.over) explanations.push('Heads up: the repaired list would push this week over budget.');
  else if (budgetNote && removalSavings > 0) explanations.push(`The repairs save about £${removalSavings.toFixed(2)} on the list.`);

  // Deterministic ordering: least disruptive first, then by date.
  repairs.sort((a, b) => (a.disruption ?? 9) - (b.disruption ?? 9) || String(a.date).localeCompare(String(b.date)));

  const disruption = repairs.length
    ? Math.max(...repairs.map((r) => r.disruption ?? 9))
    : 0;

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
    disruption,
  };
};

/** Convenience: did recovery change anything user-visible? */
export const recoveryChanged = (result) =>
  Boolean(result && (
    result.repairs?.length
    || result.shoppingAdd?.length
    || result.shoppingRemove?.length
    || result.leftoverReuse?.length
    || Object.keys(result.planPatch || {}).length
  ));
