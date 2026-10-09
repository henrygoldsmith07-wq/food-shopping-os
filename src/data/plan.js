/**
 * Planning vocabulary and the achievement catalogue.
 *
 * Nothing here is user data: the weekly plan, what you cooked and how far
 * along each badge is all live in app state and start empty. Badges declare
 * which real metric they read, so progress is always earned, never seeded.
 */

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MEAL_SLOTS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

export const PLANNER_GOALS = ['Balanced', 'Weight loss', 'Muscle gain', 'Family friendly', 'Sustainable'];
export const PLANNER_DIETS = ['None', 'Vegetarian', 'Vegan', 'Dairy-free', 'Gluten-free', 'Halal'];
export const PLANNER_SCOPES = ['1 meal', 'A day', 'A week'];
export const PLANNER_OCCASIONS = ['Everyday', 'Meal prep', 'Date night', 'Party', 'BBQ', 'Camping', 'Student'];

/**
 * `metric` names a counter derived from what you've actually done
 * (see `badgeProgress` in lib/kitchen.js); `of` is the bar to clear.
 */
/**
 * Plan slots that are deliberately *not* a recipe.
 *
 * A household that eats leftovers on Tuesday and eats out on Thursday has
 * planned its week — there is just nothing to buy, cost or cook for either
 * night. These sentinels live in the plan map beside recipe ids so the
 * calendar can show the decision, while every recipe-resolving read
 * (`planEntries` and everything built on it: stats, shopping, ICS,
 * adherence) ignores them exactly as it would an unknown id.
 *
 * The `__` prefix keeps them out of the recipe book's reach: catalogue ids
 * are slugs and runtime ids come from `uid()`, neither of which produces a
 * double underscore, so a sentinel can never collide with a real dish.
 */
export const LEFTOVER_NIGHT = '__leftovers__';
export const EATING_OUT = '__eating_out__';

export const PLAN_SPECIALS = {
  [LEFTOVER_NIGHT]: {
    id: LEFTOVER_NIGHT,
    label: 'Leftover night',
    hint: 'Eat what is already in the fridge',
  },
  [EATING_OUT]: {
    id: EATING_OUT,
    label: 'Eating out',
    hint: 'Nothing to buy or cook',
  },
};

export const isPlanSpecial = (value) =>
  Object.prototype.hasOwnProperty.call(PLAN_SPECIALS, value);

export const planSpecialLabel = (value) => PLAN_SPECIALS[value]?.label || null;

export const BADGES = [
  { id: 'first-cook', emoji: '🍳', name: 'First Flame', desc: 'Cook your first recipe', metric: 'recipesCooked', of: 1 },
  { id: 'streak-7', emoji: '🔥', name: 'Week of Fire', desc: 'Cook seven days running', metric: 'streak', of: 7 },
  { id: 'logger', emoji: '📓', name: 'Kept a Diary', desc: 'Log your food on 7 days', metric: 'loggedDays', of: 7 },
  { id: 'world-tour', emoji: '🌍', name: 'World Tour', desc: 'Cook six different cuisines', metric: 'cuisines', of: 6 },
  { id: 'batch-chef', emoji: '🧊', name: 'Batch Chef', desc: 'Cook ten recipes', metric: 'recipesCooked', of: 10 },
  { id: 'green-plate', emoji: '🌱', name: 'Green Plate', desc: 'Cook ten plant-based meals', metric: 'plantMeals', of: 10 },
  { id: 'budget-boss', emoji: '💷', name: 'Budget Boss', desc: 'Four weeks inside your budget', metric: 'budgetWeeks', of: 4 },
  { id: 'master-chef', emoji: '👨‍🍳', name: 'Master Chef', desc: 'Reach level 20', metric: 'level', of: 20 },
  { id: 'planner', emoji: '📅', name: 'Planner', desc: 'Plan twenty-one meals', metric: 'plannedMeals', of: 21 },
  { id: 'own-book', emoji: '📖', name: 'Own Book', desc: 'Five recipes of your own', metric: 'ownRecipes', of: 5 },
  { id: 'century', emoji: '💯', name: 'Century', desc: 'Log a hundred foods', metric: 'entriesLogged', of: 100 },
  { id: 'regular', emoji: '🧾', name: 'Regular', desc: 'Record ten shops', metric: 'shops', of: 10 },
];
