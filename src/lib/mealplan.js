/**
 * The meal plan, read every way the app needs it.
 *
 * The plan itself is one small object — `{ 'YYYY-MM-DD': { breakfast, lunch,
 * dinner } }` of recipe ids. A week view, a month view, the cost of a range,
 * what to batch cook, what leftovers already cover and what is left to buy are
 * all derived here, so nothing is stored twice and a move is a pure function of
 * the plan you had.
 */

import { byId } from '../data/recipes.js';
import { MEAL_SLOTS } from '../data/plan.js';
import { itemsFromRecipes } from '../data/stores.js';
import { addDays, dayStamp, pantryAvailability, pantryTruthForNeed, weekStart } from './kitchen.js';
import { canonicalName } from './aliases.js';
import { scaleQty } from './portions.js';
import { mergeQtys, qtySuffices } from './pantry.js';
import { explainPantryShortfall, shortfallQuantity } from './pantry-intelligence.js';

export const SLOT_KEYS = MEAL_SLOTS.map((s) => s.key);

/* ---------- Calendar ---------- */

export const monthStart = (stamp = dayStamp()) => `${String(stamp).slice(0, 7)}-01`;

export const monthLabel = (stamp = dayStamp()) =>
  new Date(`${monthStart(stamp)}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const daysInMonth = (stamp = dayStamp()) => {
  const d = new Date(`${monthStart(stamp)}T12:00:00`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

/** Every date in the month containing `stamp`. */
export const monthDates = (stamp = dayStamp()) => {
  const start = monthStart(stamp);
  return Array.from({ length: daysInMonth(stamp) }, (_, i) => addDays(start, i));
};

/**
 * The month as a Monday-first grid, padded with the neighbouring days so every
 * row is a full week. Padding days are marked so the view can dim them.
 */
export const monthGrid = (stamp = dayStamp()) => {
  const first = weekStart(monthStart(stamp));
  const month = String(stamp).slice(0, 7);
  const weeks = Math.ceil((daysInMonth(stamp) + ((new Date(`${monthStart(stamp)}T12:00:00`).getDay() + 6) % 7)) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(first, i);
    return { date, inMonth: date.slice(0, 7) === month };
  });
};

export const shiftWeek = (stamp = dayStamp(), n = 0) => addDays(weekStart(stamp), n * 7);

export const weekOffset = (from = dayStamp(), to = dayStamp()) => Math.round((new Date(`${weekStart(to)}T12:00:00`) - new Date(`${weekStart(from)}T12:00:00`)) / 604800000);

export const shiftMonth = (stamp = dayStamp(), n = 0) => {
  const d = new Date(`${monthStart(stamp)}T12:00:00`);
  return dayStamp(new Date(d.getFullYear(), d.getMonth() + n, 1, 12));
};

export const isToday = (stamp, today = dayStamp()) => stamp === today;

/* ---------- Reading a plan ---------- */

/** Every filled slot across `dates`, in calendar then meal order. */
export const planEntries = (plan = {}, dates = []) =>
  dates.flatMap((date) =>
    SLOT_KEYS
      .filter((slot) => (plan[date] || {})[slot])
      .map((slot) => ({ date, slot, recipeId: plan[date][slot], recipe: byId(plan[date][slot]) }))
      .filter((e) => e.recipe));

/** Default eat-by times (HHMMSS). Cook blocks start earlier using recipe.time. */
const CALENDAR_EAT = {
  breakfast: { h: 8, m: 0 },
  lunch: { h: 12, m: 30 },
  dinner: { h: 18, m: 30 },
};

const pad2 = (n) => String(n).padStart(2, '0');
const compactDate = (stamp) => String(stamp).replace(/-/g, '');
const toIcsLocal = (stamp, h, m) => `${compactDate(stamp)}T${pad2(h)}${pad2(m)}00`;

/** Cook start = eat time minus prep minutes (minimum 15). Returns { start, end } as ICS local strings. */
export const mealSlotTimes = (date, slot, prepMins = 30) => {
  const eat = CALENDAR_EAT[slot] || CALENDAR_EAT.dinner;
  const prep = Math.max(15, Math.min(180, +prepMins || 30));
  const eatDate = new Date(`${date}T${pad2(eat.h)}:${pad2(eat.m)}:00`);
  const startDate = new Date(+eatDate - prep * 60000);
  // If prep pushes before midnight, clamp to 06:00 that day
  if (startDate.getDate() !== eatDate.getDate()) {
    startDate.setTime(+new Date(`${date}T06:00:00`));
  }
  return {
    start: toIcsLocal(date, startDate.getHours(), startDate.getMinutes()),
    end: toIcsLocal(date, eat.h, eat.m),
    prep,
  };
};

const icsEscape = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

/** Export a selected week or month as portable calendar events (Chrono / Apple / Google). */
export const mealPlanIcs = (
  plan = {},
  dates = [],
  { now = new Date(), calendarName = 'Forq meal plan', timezone = 'Europe/London' } = {},
) => {
  const entries = planEntries(plan, dates);
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Le Studio//Forq//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-WR-TIMEZONE:${timezone}`,
  ];
  entries.forEach(({ date, slot, recipe }) => {
    const { start, end, prep } = mealSlotTimes(date, slot, recipe.time);
    const label = MEAL_SLOTS.find((meal) => meal.key === slot)?.label || slot;
    lines.push(
      'BEGIN:VEVENT',
      `UID:forq-${date}-${slot}@forq.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${timezone}:${start}`,
      `DTEND;TZID=${timezone}:${end}`,
      `SUMMARY:${icsEscape(`Cook: ${recipe.name}`)}`,
      `DESCRIPTION:${icsEscape(`${label} · ${prep} min prep · ${recipe.kcal} kcal · ${recipe.protein}g protein\\nOpen in Forq plan for ${date}`)}`,
      'CATEGORIES:meal,forq,le-studio',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return { text: `${lines.join('\r\n')}\r\n`, events: entries.length };
};

/** The distinct dishes in a range, each with how many slots it fills. */
export const planDishes = (plan = {}, dates = []) => {
  const counts = new Map();
  for (const entry of planEntries(plan, dates)) {
    const found = counts.get(entry.recipeId);
    if (found) found.slots.push(entry);
    else counts.set(entry.recipeId, { recipe: entry.recipe, slots: [entry] });
  }
  return [...counts.values()].sort((a, b) => b.slots.length - a.slots.length);
};

/** Cost, calories and coverage for a range — everything the header quotes. */
export const planStats = (plan = {}, dates = [], { people = 1 } = {}) => {
  const entries = planEntries(plan, dates);
  const cost = entries.reduce((sum, e) => sum + e.recipe.costPerServing * people, 0);
  const kcal = entries.reduce((sum, e) => sum + e.recipe.kcal, 0);
  const daysPlanned = new Set(entries.map((e) => e.date)).size;
  const slots = dates.length * SLOT_KEYS.length;
  return {
    meals: entries.length,
    cost: Math.round(cost * 100) / 100,
    kcal,
    kcalPerDay: daysPlanned ? Math.round(kcal / daysPlanned) : 0,
    daysPlanned,
    emptyDays: dates.length - daysPlanned,
    fill: slots ? Math.round((entries.length / slots) * 100) : 0,
    minutes: entries.reduce((sum, e) => sum + e.recipe.time, 0),
  };
};

/* ---------- Changing a plan ---------- */

const withSlot = (plan, date, slot, recipeId) => {
  const day = { ...(plan[date] || {}) };
  if (recipeId) day[slot] = recipeId;
  else delete day[slot];
  const next = { ...plan };
  if (Object.keys(day).length) next[date] = day;
  else delete next[date];
  return next;
};

/**
 * Drag a meal onto another slot. An occupied target swaps — dragging Tuesday's
 * dinner onto Thursday's puts Thursday's back on Tuesday, so nothing is ever
 * silently lost.
 */
export const moveMeal = (plan = {}, from, to) => {
  if (!from || !to) return plan;
  if (from.date === to.date && from.slot === to.slot) return plan;
  const moving = (plan[from.date] || {})[from.slot];
  if (!moving) return plan;
  const displaced = (plan[to.date] || {})[to.slot] || null;
  return withSlot(withSlot(plan, from.date, from.slot, displaced), to.date, to.slot, moving);
};

/** Same dish, second slot — used by "repeat this" and by leftovers. */
export const copyMealTo = (plan = {}, from, to) => {
  const recipeId = (plan[from.date] || {})[from.slot];
  return recipeId ? withSlot(plan, to.date, to.slot, recipeId) : plan;
};

export const clearDates = (plan = {}, dates = []) => {
  const next = { ...plan };
  for (const d of dates) delete next[d];
  return next;
};

/** Apply a generated plan: [{date, slot, recipeId}] in one pass. */
export const applyEntries = (plan = {}, entries = []) =>
  entries.reduce((acc, e) => (e.recipeId ? withSlot(acc, e.date, e.slot, e.recipeId) : acc), plan);

/* ---------- Leftovers ---------- */

export const LEFTOVER_CAT = 'Leftovers';
export const LEFTOVER_DAYS = 3;

export const leftoverItems = (pantry = []) => pantry.filter((p) => p.cat === LEFTOVER_CAT);

/** Portions of each dish sitting in the fridge, by recipe id. */
export const leftoverPortions = (pantry = []) => {
  const map = new Map();
  for (const item of leftoverItems(pantry)) {
    if (!item.recipeId) continue;
    map.set(item.recipeId, (map.get(item.recipeId) || 0) + (Number(item.portions) || 0));
  }
  return map;
};

/** A pantry item for portions you cooked but didn't eat. */
export const leftoverEntry = (recipe, portions, day = dayStamp()) => ({
  name: `${recipe.name} (leftovers)`,
  emoji: recipe.emoji,
  cat: LEFTOVER_CAT,
  location: 'Fridge',
  recipeId: recipe.id,
  portions: Math.max(1, Math.round(portions)),
  qty: `${Math.max(1, Math.round(portions))} portion${portions > 1 ? 's' : ''}`,
  cost: 0,
  expiry: addDays(day, LEFTOVER_DAYS),
  addedAt: day,
});

/**
 * Allocate saved portions to planned meals in calendar order.
 *
 * Rows stay separate so their safe dates survive the calculation: a portion
 * that expires on Tuesday can cover Monday's dinner, but must never suppress
 * shopping for the same dish on Wednesday. Partial coverage is retained too,
 * letting the shopping calculation buy only the fresh portions still needed.
 */
export const leftoverCoverageForPlan = (plan = {}, dates = [], pantry = [], { people = 1 } = {}) => {
  const eaters = Math.max(1, Number(people) || 1);
  const stock = new Map();
  for (const item of leftoverItems(pantry)) {
    if (!item?.recipeId) continue;
    const portions = Math.max(0, Number(item.portions) || 0);
    if (!portions) continue;
    if (!stock.has(item.recipeId)) stock.set(item.recipeId, []);
    stock.get(item.recipeId).push({
      remaining: portions,
      expiry: item.expiry ? String(item.expiry).slice(0, 10) : null,
    });
  }
  for (const rows of stock.values()) {
    rows.sort((a, b) => String(a.expiry || '9999-12-31').localeCompare(String(b.expiry || '9999-12-31')));
  }

  return planEntries(plan, dates).map((entry) => {
    let freshPortions = eaters;
    let savedPortions = 0;
    for (const row of stock.get(entry.recipeId) || []) {
      if (freshPortions <= 0) break;
      if (row.remaining <= 0) continue;
      if (row.expiry && row.expiry < entry.date) continue;
      const used = Math.min(freshPortions, row.remaining);
      row.remaining -= used;
      freshPortions -= used;
      savedPortions += used;
    }
    return { ...entry, leftoverPortions: savedPortions, freshPortions };
  });
};

/** Planned meals the fridge covers completely. */
export const coveredByLeftovers = (plan = {}, dates = [], pantry = [], options = {}) =>
  leftoverCoverageForPlan(plan, dates, pantry, options).filter((entry) => entry.freshPortions <= 0);

/* ---------- Variety ---------- */

/**
 * What repeats in a planned range — same dish, same cuisine, or the same
 * ingredient carrying the load. Presented as a fact, not a judgement, so the
 * plan screen can say "three chilli nights this week" without pretending.
 */
export const planVariety = (plan = {}, dates = []) => {
  const entries = planEntries(plan, dates);
  const dishes = new Map();
  const cuisines = new Map();
  const ingredients = new Map();
  for (const entry of entries) {
    const id = entry.recipe.id;
    dishes.set(id, (dishes.get(id) || 0) + 1);
    if (entry.recipe.cuisine) cuisines.set(entry.recipe.cuisine, (cuisines.get(entry.recipe.cuisine) || 0) + 1);
    for (const line of entry.recipe.ingredients || []) {
      const key = canonicalName(line.name);
      ingredients.set(key, (ingredients.get(key) || 0) + 1);
    }
  }
  return {
    meals: entries.length,
    repeatedDishes: [...dishes.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, name: byId(id)?.name || id, times: n })),
    repeatedCuisines: [...cuisines.entries()].filter(([, n]) => n > 1).map(([name, times]) => ({ name, times })),
    heavyIngredients: [...ingredients.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, times]) => ({ name, times })),
  };
};

/* ---------- Batch cooking ---------- */

/**
 * Dishes planned more than once in a range: cook them once, on the first day
 * they appear, and the rest of the week reheats.
 */
export const batchGroups = (plan = {}, dates = [], { people = 1 } = {}) =>
  planDishes(plan, dates)
    .filter((d) => d.slots.length > 1)
    .map(({ recipe, slots }) => ({
      recipe,
      cookOn: slots[0].date,
      covers: slots.slice(1),
      portions: slots.length * people,
      batches: Math.ceil((slots.length * people) / (recipe.servings || 1)),
      saves: Math.round(recipe.time * (slots.length - 1) * 0.75),
    }));

/* ---------- Shopping ---------- */

/**
 * The list for a range: every dish you haven't already got in the fridge as
 * leftovers, minus ingredients your pantry already covers *with confidence*.
 * Unknown / running_low / confirmed_insufficient rows are NOT considered
 * sufficient — they still generate a shopping item so the list reflects
 * what you truly need.
 */
export const shoppingForPlan = (plan = {}, dates = [], {
  pantry = [], today = dayStamp(), learnedAliases = {}, people = null,
} = {}) => {
  const scaledPeople = people == null ? null : Math.max(1, Number(people) || 1);
  const recipeNeeds = [];
  for (const entry of leftoverCoverageForPlan(plan, dates, pantry, { people: scaledPeople || 1 })) {
    if (entry.freshPortions <= 0) continue;
    // Keep every uncovered occurrence. `itemsFromRecipes` still creates one
    // visible row per ingredient, while `needByKey` below adds the quantities
    // together. Dropping repeated recipe ids here made two planned dinners buy
    // only one dinner's ingredients.
    recipeNeeds.push({ recipe: entry.recipe, freshPortions: entry.freshPortions });
  }
  // quantity-aware pass: if an ingredient needs e.g. "500 g" but pantry has "100 g", treat as insufficient
  const byName = new Map();
  for (const item of pantry) {
    const k = canonicalName(item.name, learnedAliases);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(item);
  }
  const usablePantryRows = (key) => (byName.get(key) || []).filter((item) => {
    const truth = pantryAvailability(item, today);
    return truth === 'confirmed_sufficient' || truth === 'probably_available';
  });
  const availableFor = (key) => usablePantryRows(key)
    .reduce((total, item) => mergeQtys(total, item.qty || '', { ingredient: key }), '');
  const pantryCoversNeed = (key, needQty) => {
    const candidates = usablePantryRows(key);
    if (!candidates.length) return false;
    const combined = qtySuffices(availableFor(key), needQty, { ingredient: key });
    if (combined !== null) return combined;
    return candidates.some((item) => {
      const truth = pantryTruthForNeed(item, needQty, { today, learnedAliases });
      return truth === 'confirmed_sufficient' || truth === 'probably_available';
    });
  };
  // Scale the recipe's written batch to the household BEFORE comparing it with
  // pantry stock. Scaling afterwards can make 500 g on the shelf look enough
  // for a 400 g recipe even when an 8-person household really needs 800 g.
  const filteredRecipes = scaledPeople == null
    ? recipeNeeds.map(({ recipe }) => recipe)
    : recipeNeeds.map(({ recipe, freshPortions }) => {
      const factor = freshPortions / Math.max(1, Number(recipe.servings) || 1);
      return {
        ...recipe,
        ingredients: (recipe.ingredients || []).map((ingredient) => ({
          ...ingredient,
          qty: scaleQty(ingredient.qty || '1', factor),
        })),
      };
    });
  // Build one row for every distinct ingredient first, then decide whether the
  // pantry covers that canonical ingredient. Passing canonical pantry names to
  // itemsFromRecipes used to compare them against raw recipe names and could
  // therefore re-list an alias-equivalent item (for example "tin tomatoes"
  // versus "Chopped tomatoes").
  const raw = itemsFromRecipes(filteredRecipes, []);
  // The week's need for an ingredient is every recipe's need added together.
  const needByKey = new Map();
  const sourceRecipesByKey = new Map();
  for (const r of filteredRecipes) {
    for (const ing of r.ingredients) {
      const k = canonicalName(ing.name, learnedAliases);
      needByKey.set(k, mergeQtys(needByKey.get(k) || "", ing.qty || "", { ingredient: k }));
      if (!sourceRecipesByKey.has(k)) sourceRecipesByKey.set(k, []);
      if (!sourceRecipesByKey.get(k).includes(r.name)) sourceRecipesByKey.get(k).push(r.name);
    }
  }
  const annotate = (rows) => rows.map((row) => {
    const key = canonicalName(row.name, learnedAliases);
    const requiredQty = needByKey.get(key);
    if (!requiredQty) return row;
    const availableQty = availableFor(key);
    const sufficient = pantryCoversNeed(key, requiredQty);
    const shortfallQty = sufficient ? '' : shortfallQuantity(availableQty, requiredQty, { ingredient: key });
    return {
      ...row,
      // The list is what still needs buying, not the recipe's full requirement.
      // Keep requiredQty separately so explanations/evaluation retain the
      // original need behind the pantry deduction.
      qty: availableQty && shortfallQty ? shortfallQty : (requiredQty || row.qty),
      requiredQty,
      pantryQty: availableQty,
      shortfallQty,
      sourceRecipes: sourceRecipesByKey.get(key) || [],
      explanation: shortfallQty || !sufficient
        ? explainPantryShortfall({
          name: row.name,
          needQty: requiredQty,
          availableQty,
          shortfallQty,
          sourceRecipes: sourceRecipesByKey.get(key) || [],
        })
        : row.explanation,
      pantryTruth: sufficient ? row.pantryTruth : 'confirmed_insufficient',
    };
  });
  return annotate(raw).filter((row) => {
    const key = canonicalName(row.name, learnedAliases);
    return !pantryCoversNeed(key, row.requiredQty || row.qty);
  });
};

/**
 * The plan generator's hand-off into shopping, kept on the same authoritative
 * Plan → List path as the calendar and week loop. `people` is the number the
 * household explicitly chose in that generator session, not a silent reset to
 * the profile value.
 */
export const shoppingForGeneratedEntries = (entries = [], {
  pantry = [], people = 1, today = '', learnedAliases = {},
} = {}) => {
  const usable = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.date && entry?.slot && entry?.recipeId);
  const dates = [...new Set(usable.map((entry) => entry.date))].sort();
  if (!usable.length || !dates.length) return [];
  return shoppingForPlan(applyEntries({}, usable), dates, {
    pantry, people, today, learnedAliases,
  });
};
