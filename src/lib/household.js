import { YOUTH_PERMISSIONS } from './youth.js';

const PREFIX = 'FORQ-HOUSEHOLD-1.';
const encodeUtf8 = (value) => btoa(unescape(encodeURIComponent(value)));
const decodeUtf8 = (value) => decodeURIComponent(escape(atob(value)));
const text = (value, max = 120) => String(value || '').trim().slice(0, max);
const id = (value, fallback) => text(value, 80) || fallback;

export const DEFAULT_PERMISSIONS = {
  shopping: true,
  pantry: true,
  recipes: true,
  health: false,
};

/**
 * A child profile starts stricter than an adult one: household spending stays
 * with the adults until somebody grants it, and health records are never
 * shared by default. Anything already set on the member is respected — this
 * decides the starting point, not the answer.
 */
export const permissionsForRole = (role) => (role === 'child' ? YOUTH_PERMISSIONS : DEFAULT_PERMISSIONS);

export const householdPermission = (state, permission) => {
  const member = (state.members || []).find((item) => item.id === state.activeMemberId);
  return member
    ? (member.permissions?.[permission] ?? permissionsForRole(member.role)[permission])
    : true;
};

const cleanMember = (member, index) => {
  const role = member.role === 'child' ? 'child' : 'adult';
  return {
    id: id(member.id, `shared-member-${index + 1}`),
    name: text(member.name, 60) || `Person ${index + 1}`,
    role,
    portions: Math.max(0.5, Math.min(4, Number(member.portions) || 1)),
    diets: Array.isArray(member.diets) ? member.diets.slice(0, 20).map((diet) => text(diet, 40)).filter(Boolean) : [],
    allergies: Array.isArray(member.allergies) ? member.allergies.slice(0, 30).map((item) => text(item, 60)).filter(Boolean) : [],
    intolerances: Array.isArray(member.intolerances) ? member.intolerances.slice(0, 30).map((item) => text(item, 60)).filter(Boolean) : [],
    dislikes: Array.isArray(member.dislikes) ? member.dislikes.slice(0, 30).map((item) => text(item, 60)).filter(Boolean) : [],
    permissions: { ...permissionsForRole(role), ...(member.permissions || {}) },
    notifications: member.notifications !== false,
  };
};

const cleanPantry = (item, index) => ({
  ...item,
  id: id(item.id, `shared-pantry-${index + 1}`),
  name: text(item.name),
  qty: text(item.qty, 60),
  cost: Math.max(0, Number(item.cost) || 0),
  expiry: /^\d{4}-\d{2}-\d{2}$/.test(item.expiry || '') ? item.expiry : null,
  low: Boolean(item.low),
});

const cleanListItem = (item, index) => ({
  ...item,
  id: id(item.id, `shared-list-${index + 1}`),
  name: text(item.name),
  qty: text(item.qty, 60),
  note: text(item.note, 160),
  price: Math.max(0, Number(item.price) || 0),
  checked: Boolean(item.checked),
  assigneeId: item.assigneeId ? text(item.assigneeId, 80) : null,
});

const cleanRecipe = (recipe, index) => ({
  ...recipe,
  id: id(recipe.id, `shared-recipe-${index + 1}`),
  name: text(recipe.name, 100) || `Shared recipe ${index + 1}`,
  ingredients: Array.isArray(recipe.ingredients)
    ? recipe.ingredients.slice(0, 60).map((line) => ({ name: text(line.name), qty: text(line.qty, 60) })).filter((line) => line.name)
    : [],
  steps: Array.isArray(recipe.steps)
    ? recipe.steps.slice(0, 40).map((step) => ({ text: text(step.text, 500), timerMins: Number(step.timerMins) || undefined })).filter((step) => step.text)
    : [],
  shared: true,
});

const cleanChore = (chore, index) => ({
  id: id(chore.id, `shared-task-${index + 1}`),
  title: text(chore.title, 100) || `Task ${index + 1}`,
  assigneeId: chore.assigneeId ? text(chore.assigneeId, 80) : null,
  due: /^\d{4}-\d{2}-\d{2}$/.test(chore.due || '') ? chore.due : null,
  done: Boolean(chore.done),
});

export const householdShareCode = (state = {}) => PREFIX + encodeUtf8(JSON.stringify({
  householdName: text(state.householdName, 60),
  members: (state.members || []).map(cleanMember),
  pantry: (state.pantry || []).map(cleanPantry),
  shoppingList: (state.shoppingList || []).map(cleanListItem),
  myRecipes: (state.myRecipes || []).map(cleanRecipe),
  chores: (state.chores || []).map(cleanChore),
}));

export const householdFromShareCode = (code) => {
  try {
    const raw = String(code || '').trim();
    if (!raw.startsWith(PREFIX) || raw.length > 2_000_000) throw new Error();
    const value = JSON.parse(decodeUtf8(raw.slice(PREFIX.length)));
    if (!value || typeof value !== 'object') throw new Error();
    const limits = { members: 50, pantry: 500, shoppingList: 500, myRecipes: 200, chores: 200 };
    for (const [key, limit] of Object.entries(limits)) {
      if (!Array.isArray(value[key] || []) || (value[key] || []).length > limit) throw new Error();
    }
    return {
      householdName: text(value.householdName, 60),
      members: value.members.map(cleanMember),
      pantry: value.pantry.map(cleanPantry).filter((item) => item.name),
      shoppingList: value.shoppingList.map(cleanListItem).filter((item) => item.name),
      myRecipes: value.myRecipes.map(cleanRecipe).filter((recipe) => recipe.ingredients.length && recipe.steps.length),
      chores: value.chores.map(cleanChore),
    };
  } catch {
    throw new Error('That household code is invalid or damaged.');
  }
};
