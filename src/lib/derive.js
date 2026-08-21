/**
 * Everything the app reads back, computed from what you stored.
 *
 * This is the other half of the store: `state` is the record of what you did,
 * and this turns it into every number the screens show. Keeping it a plain
 * function of state is what guarantees the app never stores a figure twice —
 * delete the thing behind a number and the number goes with it.
 */

import { CATALOGUE } from '../data/foods.js';
import { GLASS_ML } from '../data/nutrients.js';
import { dayTotals, hydration, nutrientCoverage } from './nutrition.js';
import {
  groceryInflation, kitchenStats, pantryAvailability, pantryConfidenceLevel, pantryTruthLabel, pantryTruthTone, pantryValue, savingsSummary, spentInMonth, spentInWeek, streakFrom, weekDates,
} from './kitchen.js';
import {
  defaultWeeklyKcal, goalSummary, resolveMaintenance, targetSafety, weekProgress,
} from './goals.js';
import { leftoverItems, leftoverPortions } from './mealplan.js';
import { progressSummary } from './progress.js';
import { bodySummary, cycleSummary, sleepSummary, stressSummary, vitalSummary } from './health.js';
import { activityAdjustment, weekSummary } from './exercise.js';
import {
  basketProjection, priceAlertMatches, restockSuggestions, recurringStaples, shoppingNameKey, wasteSummary,
} from './shopping.js';
import { couponVaultStats, couponsForList } from './coupons.js';
import { derivePriceAnomalies, priceAnomalyForList } from './price-alerts.js';
import { shoppingInsightFor } from './shopping-intelligence.js';
import { recentFoodsFrom } from './state.js';
import {
  evaluateFoodSuitability,
  filterBySuitability,
  rankBySuitability,
  suitabilityContextFrom,
  suitabilityReach,
  suitabilitySummary,
} from './food-suitability.js';
import { formatters } from './units.js';
import {
  cleanModes, hiddenModules, moduleOn, modesSummary, visibleTabs, visibleWidgets,
} from './modes.js';
import { DEFAULT_WIDGETS } from '../data/preferences.js';
import { resolveProductMode, tabsForMode } from '../data/productModes.js';
import { isToolEnabled } from '../data/optionalTools.js';
import { RECIPES } from '../data/recipes.js';
import { periodFootprint, swapIdeas } from './footprint.js';
import { fastingSummary } from './fasting.js';
import { DEFAULT_PERMISSIONS, permissionsForRole } from './household.js';
import { buildTasteProfile } from './taste.js';
import {
  cookingTimeLearning, householdPreferenceProfile, leftoverAwareness, mealPlanAdherence,
  perishabilitySummary, repeatFatigue, useSoonIngredients,
} from './planning-intelligence.js';
import { learnWasteProfile } from './waste-planner.js';
import { YOUTH_COPY, youthPolicy } from './youth.js';
import { savingsSnapshot } from './savings.js';
import { wasteOutcome } from './pantry-lifecycle.js';
import { planOutcome } from './plan-outcome.js';
import { outcomeDashboard } from './outcome-dashboard.js';
import { optimiseShopping } from './shopping-optimisation.js';
import { weeklyFoodLoop } from './food-loop.js';

export const deriveApp = (state) => {
  const activeMember = state.members.find((member) => member.id === state.activeMemberId) || null;
  const youth = youthPolicy(state);
  const householdAccess = activeMember
    ? { ...permissionsForRole(activeMember.role), ...(activeMember.permissions || {}) }
    : { ...DEFAULT_PERMISSIONS };

  // One context object for every surface that asks "is this safe / preferred?".
  const planDiets = [...new Set([...state.diets, ...state.members.flatMap((m) => m.diets || [])])];
  // One person's allergen is everyone's hard line: a recipe naming it is never
  // offered, no matter who's logged in. Dislikes stay per-member and only move
  // a dish down the ranking, never off the list.
  const memberAllergies = [...new Set(state.members.flatMap((m) => m.allergies || []))];
  const memberIntolerances = [...new Set(state.members.flatMap((m) => m.intolerances || []))];
  const memberDislikes = [...new Set(state.members.flatMap((m) => m.dislikes || []))];
  const suitabilityCtx = suitabilityContextFrom({
    allergies: [...new Set([...state.allergies, ...memberAllergies])],
    intolerances: [...new Set([...state.intolerances, ...memberIntolerances])],
    religious: state.religious,
    diets: state.diets,
    planDiets,
    members: state.members,
    cuisines: state.cuisines,
    skill: state.skill,
    timeBudget: state.timeBudget,
    units: state.units,
    dislikes: memberDislikes,
  });

  // Legacy prefs bag kept for components that still read app.prefs.*
  const prefs = {
    allergies: state.allergies,
    intolerances: state.intolerances,
    religious: state.religious,
    diets: state.diets,
    cuisines: state.cuisines,
    skill: state.skill,
    timeBudget: state.timeBudget,
    units: state.units,
    dislikes: memberDislikes,
  };

  const catalogue = [...CATALOGUE, ...state.customFoods];
  const recipeBook = [...RECIPES, ...state.myRecipes];
  const tasteProfile = buildTasteProfile(recipeBook, state.tasteRatings, state.favourites, state.cooked);
  const planningDates = weekDates(state.day);
  const useSoon = useSoonIngredients(state.pantry, { today: state.day });
  const leftoversAware = leftoverAwareness(state.pantry, { today: state.day });
  const perishability = perishabilitySummary(state.pantry, { today: state.day });
  const planningAdherence = mealPlanAdherence(state.plan, planningDates, state.mealPlanEvents, state.cooked);
  const repeatFatigueSignal = repeatFatigue(state.plan, planningDates, state.cooked, { today: state.day });
  const cookingTime = cookingTimeLearning(state.cookingTimeHistory, recipeBook);
  const householdPreferences = householdPreferenceProfile({
    recipes: recipeBook,
    cooked: state.cooked,
    ratings: state.tasteRatings,
    favourites: state.favourites,
    members: state.members,
  });
  const wasteProfile = learnWasteProfile(state.waste, { learnedAliases: state.aliasMemory });
  const honestSavings = savingsSnapshot(state, state.day, 30);
  const wasteOutcome30 = wasteOutcome(state.pantry, state.waste, state.pantryEvents);
  const closedLoop = weeklyFoodLoop(state, state.day).closedLoop;
  const planOutcome30 = planOutcome(state.plan, weekDates(state.day), state.mealPlanEvents, state.cooked, state.pantry);
  const dashboard = outcomeDashboard(state, { today: state.day, windowDays: 30 });
  const entries = state.log[state.day] || [];
  const totals = dayTotals(entries);
  const glasses = state.water + state.waterExtraMl / GLASS_ML;
  const cookedDays = state.cooked.map((c) => c.date);
  const progress = progressSummary(state, state.day);
  const loggedDays = Object.keys(state.log).filter((date) => state.log[date]?.length).length;
  const personaTier = loggedDays < 3 && state.cooked.length < 2
    ? 'starter'
    : loggedDays < 30 && state.cooked.length < 20
      ? 'regular'
      : 'established';
  const footprint = periodFootprint(state.log, { today: state.day });

  return {
    catalogue,
    entries,
    totals,
    kcalToday: totals.kcal,
    proteinToday: totals.protein,
    carbsToday: totals.carbs,
    fatToday: totals.fat,
    fibreToday: totals.fibre,
    kcalGoal: state.targets.kcal,
    proteinGoal: state.targets.protein,
    carbsGoal: state.targets.carbs,
    fatGoal: state.targets.fat,
    coverage: nutrientCoverage(entries),
    hydration: hydration(totals, glasses),
    maintenanceKcalResolved: resolveMaintenance(state),
    targetSafety: targetSafety(state),
    goalSummary: goalSummary(state),
    weeklyKcalTarget: state.weeklyKcal || defaultWeeklyKcal(state.targets.kcal),
    week: weekProgress(state.log, {
      weeklyKcal: state.weeklyKcal || defaultWeeklyKcal(state.targets.kcal),
      today: state.day,
    }),
    recentFoods: recentFoodsFrom(state.log, catalogue),
    entriesFor: (date) => state.log[date] || [],
    kcalFor: (date) => dayTotals(state.log[date] || []).kcal,
    portions: state.members.length
      ? Math.round(state.members.reduce((n, m) => n + (Number(m.portions) || 1), 0) * 10) / 10
      : state.household || 1,
    planDiets,
    activeMember,
    youth,
    childMode: youth.on,
    householdAccess,
    leftovers: leftoverItems(state.pantry),
    leftoverPortions: leftoverPortions(state.pantry),
    leftoverAwareness: leftoversAware,
    useSoonIngredients: useSoon,
    perishability,
    planningAdherence,
    repeatFatigue: repeatFatigueSignal,
    cookingTimeLearning: cookingTime,
    householdPreferences,
    wasteProfile,
    body_: bodySummary(state, state.day),
    vitalsSummary: vitalSummary(state.vitals),
    sleepSummary: sleepSummary(state.sleep, { today: state.day }),
    stressSummary: stressSummary(state.stress, { today: state.day }),
    cycle: cycleSummary(state.cycles, state.day),
    training: weekSummary(state.workouts, state.day),
    activity: activityAdjustment(state, state.day),
    game: progress,
    xp: progress.xp,
    level: progress.level,
    streak: streakFrom(cookedDays, state.day),
    cookedToday: cookedDays.includes(state.day),
    cookedIds: state.cooked.map((c) => c.recipeId),
     pantryValue: pantryValue(state.pantry),
     pantryTruth: (() => {
       const counts = { confirmed_sufficient: 0, probably_available: 0, running_low: 0, unknown: 0, confirmed_insufficient: 0 };
      for (const item of state.pantry || []) counts[pantryAvailability(item, state.day)] = (counts[pantryAvailability(item, state.day)] || 0) + 1;
      const byItem = (state.pantry || []).map((item) => {
        const truth = pantryAvailability(item, state.day);
        const confidence = pantryConfidenceLevel(item, state.day);
        return { item, truth, label: pantryTruthLabel(truth), tone: pantryTruthTone(truth), confidence };
      });
      return { counts, byItem, unknown: counts.unknown, low: counts.running_low, sufficient: counts.confirmed_sufficient + counts.probably_available };
     })(),
     pantryIntelligence: (() => {
       const rows = (state.pantry || []).map((item) => ({
         item,
         confidence: pantryConfidenceLevel(item, state.day),
       }));
       return {
         lowConfidence: rows.filter(({ confidence }) => confidence.requiresConfirmation),
         confidence: rows,
         openConflicts: (state.pantryConflicts || []).filter((conflict) => conflict.status !== 'resolved'),
         recentEvents: (state.pantryEvents || []).slice(-10).reverse(),
       };
     })(),
    spentThisWeek: spentInWeek(state.shops, state.day),
    spentThisMonth: spentInMonth(state.shops, state.day),
    inflation: groceryInflation(state.shops),
    savings: savingsSummary(state.shops),
    priceAlertStatus: priceAlertMatches(state.priceAlerts, state.shops),
    priceAnomalies: derivePriceAnomalies(state.shops, state.priceAlertConfig),
    priceAnomaliesForList: priceAnomalyForList(state.shoppingList, state.shops, state.priceAlertConfig),
    shoppingInsights: (() => {
      const sharedDiets = [...new Set([
        ...(state.diets || []),
        ...(state.members || []).flatMap((member) => member.diets || []),
      ])];
      const sharedAllergies = [...new Set([
        ...(state.allergies || []),
        ...(state.members || []).flatMap((member) => member.allergies || []),
      ])];
      const sharedIntolerances = [...new Set([
        ...(state.intolerances || []),
        ...(state.members || []).flatMap((member) => member.intolerances || []),
      ])];
      const byId = {};
      const byKey = {};
      for (const item of state.shoppingList || []) {
        const insight = shoppingInsightFor(item, {
          shops: state.shops,
          pantry: state.pantry,
          list: state.shoppingList,
          diets: sharedDiets,
          allergies: sharedAllergies,
          intolerances: sharedIntolerances,
          today: state.day,
          learnedAliases: state.aliasMemory,
          store: item.store || '',
          routes: state.storeRoutes,
          memory: state.aisleMemory,
        });
        byId[item.id] = insight;
        byKey[shoppingNameKey(item.name)] = insight;
      }
      return {
        byId,
        byKey,
        shared: Boolean(state.members?.length || state.householdName),
        offlineMode: Boolean(state.shoppingPreferences?.offlineMode),
        lastChangedAt: Number(state.shoppingMeta?.lastChangedAt || 0),
        lastChangedBy: state.shoppingMeta?.lastChangedBy || '',
      };
    })(),
    couponVault: couponVaultStats(state.coupons, state.day),
    couponsForList: couponsForList(state.coupons, state.shoppingList, state.day),
    basket: basketProjection(state.shoppingList, {
      budget: state.weeklyBudget,
      spent: spentInWeek(state.shops, state.day),
      offers: state.offers,
      today: state.day,
    }),
    restock: restockSuggestions(state.shops, state.pantry, state.shoppingList),
    staples: recurringStaples(state.shops, state.pantry, state.shoppingList, { today: state.day }),
    wasted: wasteSummary(state.waste),
    honestSavings,
    wasteOutcome: wasteOutcome30,
    closedLoop,
    planOutcome: planOutcome30,
    dashboard,
    shoppingOptimisation: (mode = 'balanced') => optimiseShopping(state.shoppingList, {
      shops: state.shops, pantry: state.pantry, mode, today: state.day, learnedAliases: state.aliasMemory,
    }),
    stats: kitchenStats({ ...state, xp: progress.xp }, state.day),
    personaTier,

    /* ---------- Central food suitability (every surface reads these) ---------- */
    prefs,
    suitabilityCtx,
    prefsSummary: suitabilitySummary(suitabilityCtx),
    /** Blocked recipes removed once, not re-hidden later. */
    safeRecipes: filterBySuitability(recipeBook, suitabilityCtx),
    recipeReach: suitabilityReach(recipeBook, suitabilityCtx),
    tasteProfile,
    /** Full structured result for one recipe or food. */
    suitabilityFor: (item) => evaluateFoodSuitability(item, suitabilityCtx),
    /** Legacy shape used by older components. */
    fitFor: (recipe) => {
      const s = evaluateFoodSuitability(recipe, suitabilityCtx);
      return {
        blocked: s.blockers.filter((b) => b.kind === 'allergy' || b.kind === 'religious' || b.kind === 'diet' || b.kind === 'household')
          .map((b) => ({ id: b.code.split(':')[1] || b.code, label: b.label })),
        flagged: s.warnings.filter((w) => w.kind === 'intolerance')
          .map((w) => ({ id: w.code.split(':')[1] || w.code, label: w.label })),
        tooLong: s.warnings.some((w) => w.code === 'time:over'),
        tooFiddly: s.warnings.some((w) => w.code === 'skill:over'),
        favouriteCuisine: s.preferences.some((p) => p.kind === 'preference' && p.code.startsWith('cuisine:')),
        suitability: s,
      };
    },
    rankRecipes: (list) => rankBySuitability(list, suitabilityCtx),
    filterRecipesSafe: (list) => filterBySuitability(list, suitabilityCtx),
    fmt: formatters(prefs),
    /* product modes: one answer to "is this module on", read by the tab bar,
       Home and the settings panels alike. It filters screens, never records —
       every total above is computed from all of state regardless of what is
       currently on show. */
    modes: cleanModes(state.modes),
    modesSummary: modesSummary(state.modes),
    moduleOn: (id) => moduleOn(id, state.modes),
    visibleTabs: (tabs) => visibleTabs(state.modes, tabs),
    hiddenModules: hiddenModules(state),
    homeWidgets: visibleWidgets(state.widgets || DEFAULT_WIDGETS, state.modes),
    // ---- productMode compat (from feat/forq-product-modes) ----
    // Tests and newer code address a single productMode string + enabledTools.
    // Keep both models live: derive reads the string if present, and exposes
    // navTabs/homeWidgets aliases plus hasTool so both old and new tests pass.
    productMode: state.productMode ?? (state.modes && state.modes[0]) ?? 'meal_planning',
    get productModeDef() { return resolveProductMode(this.productMode); },
    navTabs: tabsForMode(state.productMode ?? (state.modes && state.modes[0]) ?? 'meal_planning'),
    enabledTools: state.enabledTools ?? [],
    advancedToolsVisible: state.advancedToolsVisible ?? resolveProductMode(state.productMode ?? 'meal_planning').advancedToolsVisible ?? [],
    hasTool: function(id){ return isToolEnabled(state.enabledTools, id); },
    /* advanced surfaces, each derived from what you logged like everything else */
    footprint,
    footprintSwaps: swapIdeas(footprint),
    fasting: youth.fasting
      ? fastingSummary(state.log, { today: state.day, plan: state.fastPlan })
      : { ready: false, hidden: true, nights: 0, reason: YOUTH_COPY.fasting },
  };
};
