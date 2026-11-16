import { DEFAULT_TARGETS } from '../data/nutrients.js';

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
  // A goal is personal health information. Dietary restrictions remain
  // available to members who can use recipes, so household meal safety still
  // has the context it needs.
  goal: 'health',
  // Calorie and nutrient targets are personal health data, like `goal`.
  targets: 'health',
  weeklyKcal: 'health',
  diets: 'recipes',
  allergies: 'recipes',
  intolerances: 'recipes',
  religious: 'recipes',
  pantry: 'pantry',
  autoUsePantry: 'pantry',
  plan: 'recipes',
  myRecipes: 'recipes',
  favourites: 'recipes',
  tasteRatings: 'recipes',
  recipeCollections: 'recipes',
  recipeRatings: 'recipes',
  recipeNotes: 'recipes',
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
  goal: 'maintain',
  targets: { ...DEFAULT_TARGETS },
  weeklyKcal: 0,
  diets: [],
  allergies: [],
  intolerances: [],
  religious: [],
  pantry: [],
  autoUsePantry: false,
  plan: {},
  myRecipes: [],
  favourites: [],
  tasteRatings: {},
  recipeCollections: [],
  recipeRatings: {},
  recipeNotes: {},
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

const MEMBER_RESTRICTIONS = ['diets', 'allergies', 'intolerances', 'religious'];
const hasRestriction = (member) =>
  MEMBER_RESTRICTIONS.some((field) => Array.isArray(member?.[field]) && member[field].length > 0);

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
  // Member-level food restrictions drive the same household recipe safety
  // rules as the top-level preferences and need the same access boundary.
  if (!has(permissions, 'recipes') && Array.isArray(next.members)) {
    next.members = next.members.map(({ diets, allergies, intolerances, religious, ...member }) => ({
      ...member,
      ...(diets !== undefined ? { diets: [] } : {}),
      ...(allergies !== undefined ? { allergies: [] } : {}),
      ...(intolerances !== undefined ? { intolerances: [] } : {}),
      ...(religious !== undefined ? { religious: [] } : {}),
    }));
  }
  return next;
};

export const mergePermittedState = (
  current = {}, incoming = {}, permissions = [], preservePermissions = [],
) => {
  const next = { ...current, ...incoming };
  for (const [field, permission] of Object.entries(FIELD_PERMISSION)) {
    if (!has(permissions, permission) || preservePermissions.includes(permission)) {
      if (field in current) {
        next[field] = current[field];
      } else {
        // Deny by default: on a document with no agreed value yet (first
        // write), a member without the permission must not seed one â€” there
        // is nothing to revert to, so the incoming value is dropped instead.
        delete next[field];
      }
    }
  }
  // `members` is unvalidated JSON: anything but a list (null, {}, a string)
  // from a writer without recipe access would wipe every member's
  // restrictions, so it leaves the agreed list as it was.
  if (!has(permissions, 'recipes') && 'members' in incoming && !Array.isArray(incoming.members)) {
    if ('members' in current) next.members = current.members;
    else delete next.members;
  }
  if (!has(permissions, 'recipes') && Array.isArray(incoming.members)) {
    const currentMembers = new Map((current.members || []).map((member) => [member.id, member]));
    next.members = incoming.members.map((member) => {
      const saved = currentMembers.get(member.id);
      const clean = { ...member };
      for (const field of MEMBER_RESTRICTIONS) {
        if (saved && field in saved) clean[field] = saved[field];
        else delete clean[field];
      }
      return clean;
    });
    // Removing (or re-keying) a member would take their allergies with them,
    // which is the same write this permission withholds. Members who carry a
    // restriction stay until someone with recipe access removes them.
    const kept = new Set(next.members.map((member) => member.id));
    for (const member of current.members || []) {
      if (!kept.has(member.id) && hasRestriction(member)) next.members.push(member);
    }
  }
  return next;
};

export const permissionForField = (field) => FIELD_PERMISSION[field] || null;

