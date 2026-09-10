/**
 * Week Recovery Engine â€” repairs the rest of the week whenever reality changes.
 *
 * Triggers: MealSkipped, IngredientWasted, PantryCorrected, LeftoverCreated,
 * UnplannedShop, MealCooked (with substitutions). Pure + offline + deterministic.
 *
 * Recovery is state-driven, not only trigger-driven: the engine scans the
 * remaining week for real problems â€” skipped slots that never got refilled,
 * broken meals (an ingredient the pantry no longer covers), urgent leftovers
 * with no home, and shopping rows nothing needs anymore â€” then repairs each
 * with a MINIMUM-DISRUPTION strategy:
 *
 *   1. reuse a leftover (no new food, frees a slot)          â€” disruption 0
 *   2. swap in a recipe the pantry already covers            â€” disruption 1
 *   3. keep the recipe, add the missing item to the list     â€” disruption 2
 *   4. free the slot and let the household choose             â€” disruption 3
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
import { inferWeekRecoveryTrigger, inferWeekRecoveryTriggers } from './week-recovery-triggers.js';
import { pantryCoverageOf } from './pantry-coverage.js';

export { inferWeekRecoveryTrigger, inferWeekRecoveryTriggers, pantryCoverageOf };

const norm = (s) => String(s || '').trim().toLowerCase();

const ingredientsOf = (recipe) => (recipe?.ingredients || []).map((i) => norm(i.name || i));



/** Remaining dates in the week (today â†’ Sunday), Monday-first. */
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
 * Minimum-disruption candidate for a slot: a catalogue recipe the pantry
 * fully covers, preferring ones that use expiring ingredients and share a
 * cuisine with the broken recipe. Deterministic: coverage desc, shared
 * ingredients desc, time asc, id asc.
 */
export const bestPantrySwap = ({ catalogue = [], avoidIds = [], pantryNames = new Set(), expiringNames = new Set(), wasRecipe = null, pantry = null, today = dayStamp() }) => {
  const wasIngredients = new Set(ingredientsOf(wasRecipe));
  const wasCuisine = norm(wasRecipe?.cuisine);
  const rows = [];
  for (const recipe of catalogue) {
    if (!recipe?.id || avoidIds.includes(recipe.id) || recipe.id === wasRecipe?.id) continue;
    const coverage = pantryCoverageOf(recipe, pantryNames, { pantry, today });
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
 * 0 reuse-leftover Â· 1 pantry-swap Â· 2 add-to-list Â· 3 slot-freed
 */
const CANDIDATE_DISRUPTION = { 'reuse-leftover': 0, 'pantry-swap': 1, 'add-to-list': 2, 'slot-freed': 3 };

/**
 * Main entry. `trigger` = { kind, date?, slot?, recipeId?, ingredient?, reason? }
 * or `triggers` = an array of them (every unresolved trigger since the last
 * recovery â€” see inferWeekRecoveryTriggers). `catalogue` = recipe list for
 * substitution search (optional).
 *
 * Multiple triggers are processed oldest-first and merged without piling
 * repairs onto the same slot: a skipped dinner and a wasted ingredient both
 * naming Thursday's slot produce one repair, not two.
 *
 * Without a trigger, the engine audits the remaining week on its own â€” the
 * same repairs the explicit triggers name, found by scanning, so a recovery
 * preview on Home is always current rather than tied to one event.
 */
export const recoverWeek = (state = {}, { today = dayStamp(), trigger = null, triggers = null, catalogue = [] } = {}) => {
  const plan = state.plan || {};
  const pantry = Array.isArray(state.pantry) ? state.pantry : [];
  const shoppingList = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  // A saved portion has two homes â€” the first-class leftovers slice and
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

  // A trigger list, oldest first; a lone `trigger` still works.
  const triggerList = (Array.isArray(triggers) && triggers.length
    ? [...triggers]
    : (trigger ? [trigger] : []))
    .filter((t) => t && t.kind)
    .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? '')));

  /** Leftovers not already promised to a slot, urgent first. */
  const availableLeftovers = (urgentOnly = false) => leftovers
    .filter((l) => (urgentOnly ? (!l.expiry || daysUntil(l.expiry, today) <= 2) : true))
    .filter((l) => !leftoverReuse.some((r) => r.leftoverId === l.id))
    .sort((a, b) => daysUntil(a.expiry || `${today}+7`, today) - daysUntil(b.expiry || `${today}+7`, today));

  /** The most urgent leftover worth rescuing right now. */
  const urgentLeftover = () => availableLeftovers(true)[0] || null;

  /**
   * A remaining dinner slot with no recipe in it â€” soonest first, so a
   * just-saved portion is offered its earliest sensible home, not the last.
   */
  const openSlot = () => dates
    .map((date) => ({ date, day: plan[date] || {} }))
    .find(({ day }) => !day.dinner) || null;

  /** Slots recorded skipped (or past) that the plan still shows as planned. */
  const skippedSlotDone = new Set(mealPlanEvents
    .filter((e) => e.status === 'skipped')
    .map((e) => `${e.date}|${e.slot}`));

  /**
   * Repair one broken/freed slot with the least disruptive option that
   * actually solves it. Exactly one repair per problem â€” never a pile.
   */
  const repairSlot = (date, slot, wasRecipeId, problemLabel) => {
    const wasRecipe = byId.get(wasRecipeId) || null;
    const options = [];

    // Option 0: an urgent leftover fills the slot.
    const leftover = urgentLeftover();
    if (leftover) {
      options.push({
        kind: 'reuse-leftover',
        apply: () => {
          leftoverReuse.push({ date, slot, leftoverId: leftover.id, name: leftover.name });
          planPatch[date] = { ...(planPatch[date] || plan[date] || {}), [slot]: null };
          repairs.push({ kind: 'reuse-leftover', date, slot, name: leftover.name, disruption: 0, because: problemLabel });
          explanations.push(`${leftover.name} needs using â€” suggested for ${slot} on ${date} instead of cooking fresh.`);
        },
      });
    }

    // Option 1: a catalogue recipe the pantry already fully covers â€”
    // quantity-aware, so "covered" means enough of everything, not the name.
    const swap = bestPantrySwap({ catalogue, avoidIds: [], pantryNames, expiringNames, wasRecipe, pantry, today });
    if (swap) {
      options.push({
        kind: 'pantry-swap',
        apply: () => {
          planPatch[date] = { ...(planPatch[date] || plan[date] || {}), [slot]: swap.recipe.id };
          repairs.push({ kind: 'pantry-swap', date, slot, recipeId: swap.recipe.id, recipeName: swap.recipe.name, disruption: 1, because: problemLabel });
          explanations.push(`${swap.recipe.name} is already covered by your pantry${swap.expiringHits ? ' and uses food expiring soon' : ''} â€” suggested for ${slot} on ${date}.`);
        },
      });
    }

    // Option 2: keep the planned recipe, buy what's missing (only when the
    // plan has a real recipe and the missing rows are not already listed).
    if (wasRecipeId && byId.has(wasRecipeId)) {
      const missing = pantryCoverageOf(wasRecipe, pantryNames, { pantry, today }).missing
        .filter((n) => !pantryNames.has(norm(n?.name || n)) && !listNames.has(norm(n?.name || n)));
      if (missing.length) {
        options.push({
          kind: 'add-to-list',
          apply: () => {
            for (const item of missing.slice(0, 4)) {
              const name = norm(item?.name || item);
              shoppingAdd.push({ name, reason: `Needed for ${wasRecipe.name} on ${date}`, qty: 1, price: 0, priority: 'normal' });
            }
            repairs.push({ kind: 'add-to-list', date, slot, recipeId: wasRecipeId, recipeName: wasRecipe.name, missing, disruption: 2, because: problemLabel });
            explanations.push(`${wasRecipe.name} stays on ${date} â€” ${missing.map((m) => norm(m?.name || m)).join(', ')} added to the list.`);
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
        explanations.push(`${slot} on ${date} is freed â€” nothing urgent to rescue, so the choice stays yours.`);
      },
    });

    options.sort((a, b) => CANDIDATE_DISRUPTION[a.kind] - CANDIDATE_DISRUPTION[b.kind]);
    options[0].apply();
  };

  // --- 1. MealSkipped (explicit, every trigger) or a scanned skipped slot ---
  // One repair per date|slot, no matter how many triggers name it.
  const repairedSlots = new Set();
  const skippedSlots = [];
  const skippedByName = triggerList.filter((t) => t.kind === 'MealSkipped' || t.kind === 'MealPlanned');
  if (skippedByName.length) {
    for (const { date = today, slot = 'dinner', recipeId = null } of skippedByName) {
      if (dates.includes(date)) skippedSlots.push({ date, slot, recipeId });
    }
  } else {
    // Scan: a slot the household recorded as skipped that the plan still shows.
    for (const e of mealPlanEvents) {
      if (e.status !== 'skipped' || !dates.includes(e.date)) continue;
      const key = `${e.date}|${e.slot}`;
      if (skippedSlotDone.has(key) && plan[e.date]?.[e.slot]) skippedSlots.push({ date: e.date, slot: e.slot, recipeId: plan[e.date][e.slot] });
    }
    // Past-due slots still planned for remaining dates whose meal was never
    // cooked or skipped (silent misses) are left alone â€” plan-outcome owns them.
  }
  for (const { date, slot, recipeId } of skippedSlots) {
    const key = `${date}|${slot}`;
    if (repairedSlots.has(key)) continue;
    repairedSlots.add(key);
    repairSlot(date, slot, recipeId || plan[date]?.[slot] || null, 'a skipped meal');
  }

  // --- 2. Wasted / corrected ingredients: repair the broken future meals ----
  // Every wasted-ingredient trigger is processed; one list add per distinct
  // ingredient, one repair per distinct date|slot.
  const wastedHandled = new Set();
  for (const t of triggerList) {
    if (t.kind !== 'IngredientWasted' && t.kind !== 'PantryCorrected') continue;
    const name = t.ingredient || t.name;
    const key = norm(name);
    if (!name || (wastedHandled.has(key) && t.kind === 'IngredientWasted')) continue;
    wastedHandled.add(key);
    const uses = plannedUsesOf(plan, recipesById, name, dates);
    if (!uses.length) {
      explanations.push(`${name} changed, but no remaining planned meal needs it â€” list untouched.`);
      continue;
    }
    let shortAnywhere = 0;
    for (const use of uses.slice(0, 4)) {
      const slotKey = `${use.date}|${use.slot}`;
      if (repairedSlots.has(slotKey)) continue; // already repaired by another trigger
      // Prefer a pantry-covered swap; only if none exists does it become a buy.
      const wasRecipe = byId.get(use.recipeId);
      const coverage = pantryCoverageOf(wasRecipe, pantryNames, { pantry, today });
      const wastedNowMissing = coverage.missing.some((n) => {
        const nn = norm(n?.name || n);
        return nn.includes(norm(name)) || norm(name).includes(nn);
      });
      const swap = bestPantrySwap({ catalogue, avoidIds: [use.recipeId], pantryNames, expiringNames, wasRecipe, pantry, today });
      if (swap && wastedNowMissing) {
        repairedSlots.add(slotKey);
        planPatch[use.date] = { ...(planPatch[use.date] || plan[use.date] || {}), [use.slot]: swap.recipe.id };
        repairs.push({ kind: 'pantry-swap', date: use.date, slot: use.slot, recipeId: swap.recipe.id, recipeName: swap.recipe.name, wasRecipeName: use.recipeName, missingIngredient: name, disruption: 1, because: 'a wasted ingredient' });
        explanations.push(`${name} is gone, so ${use.recipeName} on ${use.date} swaps to ${swap.recipe.name} â€” already in your pantry.`);
      } else {
        shortAnywhere += 1;
        if (name && !pantryNames.has(norm(name)) && !listNames.has(norm(name)) && !shoppingAdd.some((r) => norm(r.name) === norm(name))) {
          shoppingAdd.push({ name, reason: `Needed for ${use.recipeName} on ${use.date}`, qty: 1, price: 0, priority: 'high' });
        }
        if (!repairedSlots.has(slotKey)) {
          repairedSlots.add(slotKey);
          repairs.push({ kind: 'add-to-list', date: use.date, slot: use.slot, recipeId: use.recipeId, recipeName: use.recipeName, missingIngredient: name, disruption: 2, because: 'a wasted ingredient' });
        }
      }
    }
    if (shortAnywhere) explanations.push(`${name} is short for ${uses.length} remaining meal${uses.length === 1 ? '' : 's'} â€” added to the list.`);
  }

  // --- 3. Leftover created: offer it against a suitable open slot ----------
  // A just-saved portion goes to the SOONEST open dinner slot, not only when
  // it is already urgent; waiting for urgency is how portions get forgotten.
  // The portion may not be in either home yet (the event can arrive first),
  // so a name-only trigger still allocates â€” the id link is made when there
  // is a row to link.
  const leftoverTriggers = triggerList.filter((t) => t.kind === 'LeftoverCreated' && t.name);
  for (const t of leftoverTriggers) {
    // Fresh leftovers the engine can identify (either home), urgent first.
    const named = availableLeftovers().find((l) => norm(l.name) === norm(t.name)) || null;
    if (leftoverReuse.some((r) => r.leftoverId === named?.id) || leftoverReuse.some((r) => !r.leftoverId && norm(r.name) === norm(t.name))) continue;
    const open = openSlot();
    if (!open) {
      explanations.push(`${t.name} saved â€” every remaining slot already has a meal, so it waits as a fallback.`);
      continue;
    }
    leftoverReuse.push({
      date: open.date, slot: 'dinner',
      ...(named ? { leftoverId: named.id } : {}),
      name: t.name,
    });
    repairs.push({ kind: 'reuse-leftover', date: open.date, slot: 'dinner', name: t.name, disruption: 0, because: 'a saved leftover' });
    explanations.push(`${t.name} saved â€” suggested for dinner on ${open.date} before it goes off.`);
  }

  // --- 4. UnplannedShop: bought items off-plan leave the list ------------------
  for (const t of triggerList.filter((t) => t.kind === 'UnplannedShop')) {
    const bought = new Set((t.items || []).map(norm).filter(Boolean));
    if (!bought.size) continue;
    for (const row of shoppingList) {
      if (bought.has(norm(row.name)) && !shoppingRemove.some((r) => r.id === row.id)) {
        shoppingRemove.push({ id: row.id, name: row.name, reason: 'Already bought in the unplanned shop' });
      }
    }
    if (shoppingRemove.length) explanations.push(`Removed ${shoppingRemove.length} list item${shoppingRemove.length === 1 ? '' : 's'} the unplanned shop already covered.`);
  }

  // --- 5. MealCooked (with substitutions): retire the swapped-out rows ---------
  for (const t of triggerList.filter((t) => t.kind === 'MealCooked' && t.substituted && t.plannedRecipeId && byId.has(t.plannedRecipeId))) {
    const cookedIngredients = new Set((t.substitutionIngredients || []).map(norm).filter(Boolean));
    if (!cookedIngredients.size) continue;
    const plannedIngredients = new Set(ingredientsOf(byId.get(t.plannedRecipeId)));
    const orphaned = [...plannedIngredients].filter((n) => !cookedIngredients.has(n) && !pantryNames.has(n));
    for (const row of shoppingList) {
      if (shoppingRemove.some((r) => r.id === row.id)) continue;
      if (orphaned.some((n) => norm(row.name).includes(n) || n.includes(norm(row.name)))) {
        shoppingRemove.push({ id: row.id, name: row.name, reason: 'The substitution no longer needs it' });
      }
    }
    if (orphaned.length && shoppingRemove.length) explanations.push(`Removed ${shoppingRemove.length} row${shoppingRemove.length === 1 ? '' : 's'} the cooked substitution made unnecessary.`);
  }

  // --- 6. Prune shopping list: drop rows only needed by skipped meals ------------
  for (const triggerRow of triggerList.filter((t) => t.kind === 'MealSkipped' && t.recipeId && byId.has(t.recipeId))) {
    const skippedIngredients = new Set(ingredientsOf(byId.get(triggerRow.recipeId)));
    const stillNeeded = new Set();
    for (const date of dates) {
      const day = planPatch[date] || plan[date] || {};
      for (const recipeId of Object.values(day)) {
        if (!recipeId || recipeId === triggerRow.recipeId) continue;
        for (const n of ingredientsOf(byId.get(recipeId) || {})) stillNeeded.add(n);
      }
    }
    for (const row of shoppingList) {
      const key = norm(row.name);
      if (shoppingRemove.some((r) => r.id === row.id)) continue;
      if (skippedIngredients.has(key) && ![...stillNeeded].some((n) => n.includes(key) || key.includes(n))) {
        if (!pantryNames.has(key)) {
          shoppingRemove.push({ id: row.id, name: row.name, reason: 'Only needed by the skipped meal' });
        }
      }
    }
  }
  if (triggerList.some((t) => t.kind === 'MealSkipped') && shoppingRemove.length) {
    explanations.push(`Removed ${shoppingRemove.length} list item${shoppingRemove.length === 1 ? '' : 's'} only needed by the skipped meal.`);
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
  else if (budgetNote && removalSavings > 0) explanations.push(`The repairs save about Â£${removalSavings.toFixed(2)} on the list.`);

  // Deterministic ordering: least disruptive first, then by date.
  repairs.sort((a, b) => (a.disruption ?? 9) - (b.disruption ?? 9) || String(a.date).localeCompare(String(b.date)));

  const disruption = repairs.length
    ? Math.max(...repairs.map((r) => r.disruption ?? 9))
    : 0;

  if (!repairs.length && !explanations.length) {
    explanations.push('Week checked â€” plan, list, leftovers and budget still line up.');
  }

  return {
    today,
    trigger: trigger || (triggerList.length ? triggerList.at(-1) : { kind: 'Check' }),
    triggers: triggerList,
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
