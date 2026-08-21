/**
 * The game layer: what earns XP, what a level is called, and the goals,
 * challenges, missions and seasonal events on offer.
 *
 * Like the badges before them, none of these carry progress — each one names a
 * `metric` that `lib/progress.js` counts from what you actually did, and the
 * bar it has to clear. Nothing here can be completed by anything other than
 * cooking, logging, planning or shopping for real.
 */

/** What each real action is worth. XP is counted from these, never stored. */
export const XP_AWARDS = {
  entry: 4, // a food logged
  cooked: 60, // a recipe cooked through
  shop: 10, // a shop recorded
  recipe: 8, // a recipe saved, imported or invented
  planned: 2, // a meal put in the plan
  onTargetDay: 15, // a day landing inside its calorie target
  challenge: 40, // a weekly challenge completed
  mission: 120, // a mission completed
};

export const XP_PER_LEVEL = 160;

/** Level names, by the level you reach. */
export const LEVEL_TITLES = [
  [1, 'Getting started'],
  [3, 'Home cook'],
  [6, 'Regular'],
  [10, 'Batch cooker'],
  [15, 'Kitchen runner'],
  [20, 'Master chef'],
  [30, 'Legend of the larder'],
];

/**
 * Accents that arrive with levels. The five the app has always had stay
 * available from level one — nothing you already use is taken away.
 */
export const ACCENT_UNLOCKS = [
  { id: 'sage', label: 'Sage', level: 4 },
  { id: 'clay', label: 'Clay', level: 8 },
  { id: 'ink', label: 'Deep ink', level: 12 },
];

const q = (id, label, detail, metric, of, xp) => ({ id, label, detail, metric, of, xp });

/** Today's goals — small, and all of them reachable in one day. */
export const DAILY_GOALS = [
  q('log-meals', 'Log three meals', 'Breakfast, lunch and dinner in the diary', 'mealsLoggedToday', 3, 10),
  q('protein', 'Hit your protein', 'The one target most days miss', 'proteinPctToday', 100, 15),
  q('water', 'Drink your water', 'Eight glasses, however you count them', 'waterToday', 8, 8),
  q('cook', 'Cook something', 'Anything cooked through in cooking mode', 'cookedToday', 1, 20),
  q('plan-ahead', 'Plan tomorrow', 'At least one meal in tomorrow’s plan', 'plannedTomorrow', 1, 10),
];

/**
 * Weekly challenges. Three are live each week, chosen by the week itself, so
 * everyone's week is the same week and nothing reshuffles when you refresh.
 */
export const WEEKLY_CHALLENGES = [
  q('cook-3', 'Cook three times', 'Three recipes cooked through this week', 'cookedThisWeek', 3, 40),
  q('plants-4', 'Four plant-based meals', 'Vegan or vegetarian dishes cooked', 'plantMealsThisWeek', 4, 40),
  q('log-5', 'Log five days', 'Five days with something in the diary', 'loggedDaysThisWeek', 5, 40),
  q('budget', 'Shop inside your budget', 'The week’s recorded spend under your weekly budget', 'underBudgetThisWeek', 1, 40),
  q('plan-week', 'Fill five dinners', 'Five dinners planned for the week', 'plannedDinnersThisWeek', 5, 40),
  q('no-waste', 'Waste nothing', 'A week with nothing binned from the pantry', 'zeroWasteThisWeek', 1, 40),
  q('new-dish', 'Cook something new', 'A dish you haven’t cooked before', 'newDishesThisWeek', 1, 40),
  q('on-target-4', 'Four days on target', 'Four days inside your calorie target', 'onTargetDaysThisWeek', 4, 40),
];

/** Missions run long — they're the ones worth a month of ordinary use. */
export const MISSIONS = [
  q('cook-25', 'Twenty-five dinners', 'Cook twenty-five recipes, whenever you like', 'recipesCooked', 25, 120),
  q('log-30', 'A month of diary', 'Log food on thirty days', 'loggedDays', 30, 120),
  q('cuisines-8', 'Eight cuisines', 'Cook your way through eight different kitchens', 'cuisines', 8, 120),
  q('budget-6', 'Six weeks in budget', 'Six weeks where recorded spend stayed under', 'budgetWeeks', 6, 120),
  q('own-10', 'Ten of your own', 'Save, import or invent ten recipes', 'ownRecipes', 10, 120),
  q('streak-14', 'A fortnight running', 'Fourteen days of cooking in a row', 'bestCookStreak', 14, 120),
];

/**
 * Seasonal events follow the real calendar — the same one the growing
 * calendar uses. Nothing is announced that isn't simply true of the month.
 */
export const SEASONAL_EVENTS = [
  {
    id: 'new-year',
    name: 'The January reset',
    months: [1],
    blurb: 'Cheap, warm and planned. The month everyone means to cook more.',
    challenge: q('jan-plan', 'Plan a whole week', 'Seven dinners in the planner at once', 'plannedDinnersThisWeek', 7, 60),
  },
  {
    id: 'store-cupboard',
    name: 'Store-cupboard February',
    months: [2],
    blurb: 'The leanest month of the year — cook what you already have in.',
    challenge: q('feb-pantry', 'Three meals from the pantry', 'Cook three dishes you had everything for', 'pantryMealsThisWeek', 3, 60),
  },
  {
    id: 'spring-greens',
    name: 'Spring greens',
    months: [3, 4, 5],
    blurb: 'Purple sprouting, asparagus, wild garlic — the good stuff is back.',
    challenge: q('spring-veg', 'Four plant-based meals', 'Cook four vegan or vegetarian dishes', 'plantMealsThisWeek', 4, 60),
  },
  {
    id: 'summer',
    name: 'Summer of salads',
    months: [6, 7, 8],
    blurb: 'Tomatoes, courgettes and berries at their best and cheapest.',
    challenge: q('summer-season', 'Three seasonal dishes', 'Cook three dishes using what’s in season now', 'seasonalMealsThisWeek', 3, 60),
  },
  {
    id: 'harvest',
    name: 'Harvest',
    months: [9, 10],
    blurb: 'Squash, apples and mushrooms. The batch-cooking half of the year.',
    challenge: q('harvest-batch', 'Batch cook twice', 'Two dishes cooked to cover more than one meal', 'batchMealsThisWeek', 2, 60),
  },
  {
    id: 'winter',
    name: 'Deep winter',
    months: [11, 12],
    blurb: 'Roots, brassicas and slow things. Waste nothing.',
    challenge: q('winter-waste', 'Waste nothing all week', 'Nothing binned from the pantry', 'zeroWasteThisWeek', 1, 60),
  },
];

export const eventForMonth = (month) => SEASONAL_EVENTS.find((e) => e.months.includes(month)) || null;
