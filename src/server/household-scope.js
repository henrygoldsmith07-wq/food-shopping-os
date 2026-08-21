const FIELD_PERMISSION = {
  shoppingList: 'shopping',
  favouriteShopping: 'shopping',
  shops: 'shopping',
  aisleMemory: 'shopping',
  storeRoutes: 'shopping',
  offers: 'shopping',
  priceAlerts: 'shopping',
  waste: 'shopping',
  weeklyBudget: 'shopping',
  monthlyBudget: 'shopping',
  pantry: 'pantry',
  autoUsePantry: 'pantry',
  plan: 'recipes',
  myRecipes: 'recipes',
  favourites: 'recipes',
  tasteRatings: 'recipes',
  recipeCollections: 'recipes',
  recipeRatings: 'recipes',
  cooked: 'recipes',
  log: 'health',
  body: 'health',
  measurements: 'health',
  vitals: 'health',
  sleep: 'health',
  stress: 'health',
  cycles: 'health',
  trackCycle: 'health',
  photos: 'health',
  workouts: 'health',
  bloods: 'health',
  glucose: 'health',
};

const EMPTY_BY_FIELD = {
  shoppingList: [],
  favouriteShopping: [],
  shops: [],
  aisleMemory: {},
  storeRoutes: {},
  offers: [],
  priceAlerts: [],
  waste: [],
  weeklyBudget: 0,
  monthlyBudget: 0,
  pantry: [],
  autoUsePantry: false,
  plan: {},
  myRecipes: [],
  favourites: [],
  tasteRatings: {},
  recipeCollections: [],
  recipeRatings: {},
  cooked: [],
  log: {},
  body: {},
  measurements: [],
  vitals: [],
  sleep: [],
  stress: [],
  cycles: [],
  trackCycle: false,
  photos: [],
  workouts: [],
  bloods: [],
  glucose: [],
};

const has = (permissions, permission) =>
  permissions?.includes('admin') || permissions?.includes(permission);

export const changedStateFields = (before = {}, after = {}) =>
  [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));

export const scopeHouseholdState = (state, permissions = []) => {
  if (!state) return null;
  const next = { ...state };
  for (const [field, permission] of Object.entries(FIELD_PERMISSION)) {
    if (!has(permissions, permission) && field in next) next[field] = EMPTY_BY_FIELD[field];
  }
  return next;
};

export const mergePermittedState = (
  current = {}, incoming = {}, permissions = [], preservePermissions = [],
) => {
  const next = { ...current, ...incoming };
  for (const [field, permission] of Object.entries(FIELD_PERMISSION)) {
    if ((!has(permissions, permission) || preservePermissions.includes(permission)) && field in current) {
      next[field] = current[field];
    }
  }
  return next;
};

export const permissionForField = (field) => FIELD_PERMISSION[field] || null;
