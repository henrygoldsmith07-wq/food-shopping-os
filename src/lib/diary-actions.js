/**
 * The food diary, and what cooking a recipe does to everything else.
 *
 * `completeRecipe` is the big one and deserves its size: cooking a dish logs
 * it, spends the pantry it used, records whether it was the meal that was
 * planned, and remembers how long it really took. Those are one event, so they
 * are one write.
 *
 * Split out of store-api.js, which assembles these alongside the pantry,
 * shopping and household actions.
 */

import { CATALOGUE } from '../data/foods.js';
import { buildEntry, copyEntries } from './nutrition.js';
import { recipeFood } from './foodlog.js';
import { consumePantryIngredients } from './kitchen.js';
import { inferConsumption } from './pantry-intelligence.js';
import { leftoverEntry } from './mealplan.js';
import { householdPermission } from './household.js';
import { uid } from './state.js';

export const diaryActions = (set) => {
  const addEntries = (entries, date) =>
    set((s) => {
      const day = date || s.day;
      if (!entries.length) return {};
      return {
        log: { ...s.log, [day]: [...(s.log[day] || []), ...entries] },
      };
    });

  return {
    logEntries: addEntries,
    logEntry: (entry, date) => addEntries([entry], date),
    updateEntry: (id, patch, date) =>
      set((s) => {
        const day = date || s.day;
        return {
          log: { ...s.log, [day]: (s.log[day] || []).map((e) => (e.id === id ? { ...e, ...patch } : e)) },
        };
      }),
    removeEntry: (id, date) =>
      set((s) => {
        const day = date || s.day;
        return { log: { ...s.log, [day]: (s.log[day] || []).filter((e) => e.id !== id) } };
      }),
    copyMeal: ({ fromDate, fromMeal, toMeal, toDate }) =>
      set((s) => {
        const source = (s.log[fromDate] || []).filter((e) => e.meal === fromMeal);
        if (!source.length) return {};
        const day = toDate || s.day;
        const copied = copyEntries(source, { meal: toMeal || fromMeal });
        return { log: { ...s.log, [day]: [...(s.log[day] || []), ...copied] } };
      }),
    saveTemplate: (name, meal, entries) =>
      set((s) => ({
        mealTemplates: [...s.mealTemplates, {
          id: uid('tpl'),
          name: name || `${meal} template`,
          meal,
          entries: entries.map((e) => ({ ...e, time: '00:00' })),
        }],
      })),
    deleteTemplate: (id) => set((s) => ({ mealTemplates: s.mealTemplates.filter((t) => t.id !== id) })),
    applyTemplate: (id, meal) =>
      set((s) => {
        const tpl = s.mealTemplates.find((t) => t.id === id);
        if (!tpl) return {};
        const copied = copyEntries(tpl.entries, { meal: meal || tpl.meal }).map((e) => ({
          ...e,
          time: new Date().toTimeString().slice(0, 5),
          source: 'template',
        }));
        return { log: { ...s.log, [s.day]: [...(s.log[s.day] || []), ...copied] } };
      }),
    addCustomFood: (food) => set((s) => ({ customFoods: [...s.customFoods, food] })),
    removeCustomFood: (id) => set((s) => ({ customFoods: s.customFoods.filter((f) => f.id !== id) })),
    toggleFavouriteFood: (id) =>
      set((s) => ({
        favouriteFoods: s.favouriteFoods.includes(id)
          ? s.favouriteFoods.filter((x) => x !== id)
          : [...s.favouriteFoods, id],
      })),
    completeRecipe: (recipe, { leftovers = 0, actualMins = null } = {}) =>
      set((s) => {
        const entry = buildEntry(recipeFood(recipe, [...CATALOGUE, ...s.customFoods]), { source: 'recipe' });
        // Cooking a 4-serving dish for a household of 2 uses half of it.
        const consumed = householdPermission(s, 'pantry') && s.autoUsePantry
          ? consumePantryIngredients(s.pantry, recipe.ingredients, {
            learnedAliases: s.aliasMemory,
            servings: Math.max(1, Math.round(s.portions || 0)) + Math.max(0, Number(leftovers) || 0),
            recipeServings: recipe.servings,
            today: s.day,
          })
          : { pantry: s.pantry, used: [], shortfalls: [], assumed: [], confirmationNeeded: [] };
        const inference = inferConsumption({
          recipe,
          ...consumed,
          today: s.day,
          enabled: householdPermission(s, 'pantry') && s.autoUsePantry,
        });
        const pantryEvent = { id: uid('pe'), ...inference };
        const plannedSlots = Object.entries(s.plan?.[s.day] || {});
        const plannedSlot = plannedSlots.find(([, recipeId]) => recipeId === recipe.id) || plannedSlots[0] || null;
        const plannedRecipeId = plannedSlot?.[1] || null;
        const mealPlanEvent = plannedSlot ? {
          id: uid('mpe'),
          date: s.day,
          slot: plannedSlot[0],
          plannedRecipeId,
          actualRecipeId: recipe.id,
          status: plannedRecipeId === recipe.id ? 'cooked' : 'substituted',
          reason: plannedRecipeId === recipe.id ? null : 'cooked-a-different-meal',
          at: Date.now(),
        } : null;
        const elapsed = Number(actualMins);
        const timeEvent = Number.isFinite(elapsed) && elapsed > 0 ? {
          id: uid('ct'),
          recipeId: recipe.id,
          date: s.day,
          estimatedMins: Number(recipe.time) || null,
          actualMins: Math.round(elapsed * 10) / 10,
        } : null;
        return {
          cooked: [...s.cooked, { recipeId: recipe.id, date: s.day }],
          log: { ...s.log, [s.day]: [...(s.log[s.day] || []), entry] },
          mealPlanEvents: mealPlanEvent
            ? [...(s.mealPlanEvents || []).filter((item) => !(item.date === s.day && item.slot === mealPlanEvent.slot)), mealPlanEvent].slice(-500)
            : s.mealPlanEvents || [],
          cookingTimeHistory: timeEvent
            ? [...(s.cookingTimeHistory || []), timeEvent].slice(-300)
            : s.cookingTimeHistory || [],
          pantry: householdPermission(s, 'pantry') && leftovers > 0
            ? [...consumed.pantry, { id: uid('p'), low: false, ...leftoverEntry(recipe, leftovers, s.day) }]
            : consumed.pantry,
          pantryEvents: [...(s.pantryEvents || []), pantryEvent].slice(-100),
          lastPantryEvent: pantryEvent,
        };
      }),
  };
};
