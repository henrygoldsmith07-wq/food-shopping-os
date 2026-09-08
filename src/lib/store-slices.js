/**
 * Store domain slices — the map that breaks the oversized central store into
 * clear ownership without breaking the existing `useApp()` API.
 *
 * Each slice lists the EMPTY_STATE keys it owns. Slices never overlap; the
 * arch test enforces coverage of food-loop keys. Domain commands
 * (store-commands.js) and domain events (store-events.js) operate slice by
 * slice; store.jsx / store-api.js remain the thin composition layer.
 */

export const DOMAIN_SLICES = {
  pantry: {
    title: 'Pantry & leftovers',
    keys: ['pantry', 'pantryConflicts', 'listConflicts', 'pantryEvents', 'leftovers', 'lastPantryEvent', 'autoUsePantry'],
  },
  plan: {
    title: 'Meal planning',
    keys: ['plan', 'mealPlanEvents', 'calendarBusy', 'planSimulations'],
  },
  shopping: {
    title: 'Shopping & budget',
    keys: [
      'shoppingList', 'favouriteShopping', 'shops', 'shoppingPreferences', 'shoppingMeta',
      'aisleMemory', 'storeRoutes', 'offers', 'coupons', 'priceAlerts', 'priceAlertConfig',
      'weeklyBudget', 'monthlyBudget',
    ],
  },
  household: {
    title: 'Household & members',
    keys: [
      'household', 'householdName', 'activeMemberId', 'members', 'chores', 'householdEvents',
      'householdLedger', 'portionsOverride',
    ],
  },
  learning: {
    title: 'Learning & taste',
    keys: [
      'tasteRatings', 'preferenceEvents', 'favourites', 'recipeRatings', 'cooked', 'cookingTimeHistory',
      'aliasMemory', 'predictionCorrections', 'predictionSnapshots', 'autopilotOutcomes',
    ],
  },
  kitchen: {
    title: 'Recipes & diary input',
    keys: ['myRecipes', 'recipeCollections', 'recipeFolders', 'log', 'favouriteFoods', 'customFoods', 'mealTemplates'],
  },
};

export const sliceForKey = (key) => {
  for (const [slice, def] of Object.entries(DOMAIN_SLICES)) {
    if (def.keys.includes(key)) return slice;
  }
  return null;
};

/** All owned keys, for coverage checks. */
export const allSliceKeys = () => Object.values(DOMAIN_SLICES).flatMap((d) => d.keys);

/** Pick one slice out of a state object (for domain commands/tests). */
export const selectSlice = (state = {}, slice) => {
  const def = DOMAIN_SLICES[slice];
  if (!def) return {};
  return Object.fromEntries(def.keys.map((k) => [k, state[k]]));
};
