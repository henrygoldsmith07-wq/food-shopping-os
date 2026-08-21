import { RECIPES } from '../data/recipes.js';
import { expiringSoon, recipesUsing } from './kitchen.js';
import { filterByDiet, goalSummary, recipeAllowed } from './goals.js';
import { habitAnalysis, predictProgress } from './coach.js';
import {
  groceryRecommendations, healthierSwaps, mealFeedback, personalTips, restaurantPicks,
} from './advice.js';
import { buildPlan } from './planner.js';
import { inventRecipe } from './recipe-ai.js';
import { swapsFor } from './recipe-tools.js';
import { compareStores, groupForStore } from './shopping.js';
import { gbp } from './utils.js';
import { YOUTH_SIGNPOST } from './youth.js';

const recipeLine = (recipe) =>
  `• ${recipe.name} — ${recipe.time} min, ${gbp(recipe.costPerServing, { always: true })}/serving, ${recipe.kcal} kcal`;

const recipeForTonight = (app) => {
  const id = app.plan?.[app.day]?.dinner || app.cooked?.at(-1)?.recipeId;
  const book = [...(app.safeRecipes || RECIPES), ...(app.myRecipes || [])];
  return book.find((recipe) => recipe.id === id) || null;
};

const shoppingOptimisation = (app) => {
  const list = app.shoppingList || [];
  if (!list.length) return 'Your shopping list is empty. Add the things you need and I’ll optimise the basket from prices you have recorded.';
  const comparisons = compareStores(list, app.shops || []);
  const basket = app.basket || {};
  const lines = [
    `${list.length} item${list.length === 1 ? '' : 's'} on the list; ${basket.priced || 0} priced and ${basket.unpriced ?? list.length} unpriced.`,
  ];
  if (basket.priced) {
    lines.push(`Current projected basket: ${gbp(basket.projected, { always: true })}${basket.saved ? ` after ${gbp(basket.saved, { always: true })} of recorded offers` : ''}.`);
  }
  if (comparisons.length) {
    const best = comparisons[0];
    lines.push(`Best recorded comparison: ${best.store} at ${gbp(best.total, { always: true })} for ${best.covered} of ${best.of} items.`);
  } else {
    lines.push('There are not enough recorded receipt prices to compare stores yet.');
  }
  if (basket.left !== null && basket.left !== undefined) {
    lines.push(basket.over
      ? `That would put the weekly budget ${gbp(Math.abs(basket.left), { always: true })} over.`
      : `${gbp(basket.left, { always: true })} would remain in the weekly budget.`);
  }
  return lines.join('\n\n');
};

const shoppingRoute = (app) => {
  const list = app.shoppingList || [];
  if (!list.length) return 'Your shopping list is empty, so there is no route to build yet.';
  const store = app.shops?.at(-1)?.store || Object.keys(app.storeRoutes || {})[0] || null;
  const groups = groupForStore(list, {
    store,
    routes: app.storeRoutes || {},
    memory: app.aisleMemory || {},
  });
  const route = groups.map(([aisle]) => aisle);
  return `${store ? `${store}: ` : ''}${route.join(' → ')}.\n\nThis follows the aisle order learned from your own completed shops; new aisles fall back to the standard order.`;
};

const generatedRecipe = (app) => {
  if (!app.pantry?.length) return 'Your pantry is empty. Scan or add a few ingredients first and I can build a recipe around what is actually there.';
  const options = {
    have: app.pantry.map((item) => item.name),
    diets: app.planDiets || app.diets || [],
    servings: app.portions || app.household || 2,
    month: Number(app.day?.slice(5, 7)) || null,
  };
  const firstSeed = app.pantry.length * 41 + (app.cooked?.length || 0);
  const candidates = Array.from({ length: 20 }, (_, index) => inventRecipe({ ...options, seed: firstSeed + index }));
  const recipe = candidates.find((candidate) => !(app.fitFor?.(candidate).blocked.length)) || candidates[0];
  const blocked = app.fitFor?.(recipe).blocked || [];
  if (blocked.length) {
    return `I couldn’t build a recipe from the recorded pantry without naming ${blocked.map((item) => item.label).join(', ')}. Check the pantry entries or allergy settings rather than risking a suggestion.`;
  }
  const missing = recipe.bought.length ? ` You would still need ${recipe.bought.join(', ')}.` : '';
  return `Generated from your kitchen: ${recipe.name}.\n\n${recipe.time} minutes, ${recipe.protein}g protein and ${gbp(recipe.costPerServing, { always: true })} per serving.${missing}\n\nOpen Recipes → Invent a recipe to save or cook it.`;
};

const plannedMeals = (app) => {
  const plan = buildPlan({
    scope: 'A week',
    diets: app.planDiets || app.diets || [],
    goal: app.goal,
    budget: app.weeklyBudget ? Math.max(1, app.weeklyBudget / 7 / Math.max(1, app.portions || 1)) : 4,
    pantry: (app.pantry || []).map((item) => item.name),
    people: app.portions || app.household || 1,
    month: Number(app.day?.slice(5, 7)) || null,
    recipes: app.safeRecipes || RECIPES,
    taste: app.tasteProfile,
  }, (app.cooked?.length || 0) + (app.pantry?.length || 0) + 17);
  return `A pantry-first week that fits your current diet and budget settings:\n\n${plan.meals.slice(0, 7).map(recipeLine).join('\n')}${plan.note ? `\n\n${plan.note}` : ''}\n\nOpen Plan → Generate to put these into the calendar.`;
};

const substitutions = (app) => {
  const recipe = recipeForTonight(app);
  if (!recipe) return 'Plan a dinner first, then I can suggest ingredient substitutions for that recipe.';
  const rows = swapsFor(recipe).slice(0, 3);
  if (!rows.length) return `${recipe.name} has no substitutions in the app’s verified ingredient table.`;
  return `Substitutions for ${recipe.name}:\n\n${rows.map(({ ingredient, options }) =>
    `• ${ingredient}: ${options.slice(0, 2).map((option) => `${option.name} (${option.why})`).join(' or ')}`).join('\n')}`;
};

const recipeExplanation = (app) => {
  const recipe = recipeForTonight(app);
  if (!recipe) return 'Plan dinner first and I can explain how the recipe works, why each stage matters and what to prepare ahead.';
  const first = recipe.steps?.[0]?.text;
  return `${recipe.name}: ${recipe.ingredients.length} ingredients, ${recipe.prep || 0} minutes prep and ${recipe.time} minutes total.\n\nWhy it works: ${recipe.protein}g protein and ${recipe.fibre || 0}g fibre per serving, with a ${recipe.healthScore}/100 nutrition score calculated from its ingredients.${first ? `\n\nStart here: ${first}` : ''}`;
};

const cookingHelp = (app) => {
  const recipe = recipeForTonight(app);
  if (!recipe) return 'Plan dinner or choose a recipe first. Its Cook mode will then walk you through one step and timer at a time.';
  const timed = (recipe.steps || []).find((step) => step.timerMins);
  return `${recipe.name} takes about ${recipe.time} minutes. Prep all ${recipe.ingredients.length} ingredients before starting.${timed ? `\n\nKey timed step: ${timed.text} Set a ${timed.timerMins}-minute timer.` : ''}\n\nOpen the recipe and tap Cook mode for step-by-step guidance.`;
};

const mealImprovement = (app) => {
  const order = ['dinner', 'lunch', 'breakfast', 'snack'];
  const feedback = order.map((meal) =>
    mealFeedback(app.entries || [], meal, {
      targets: app.targets || {},
      dayEntries: app.entries || [],
      youth: app.youth?.calorieDebtLanguage === false,
    })).find(Boolean);
  if (!feedback) return 'Log a meal first and I’ll assess it from its calories, protein and fibre—without inventing a star rating.';
  return `${feedback.label}: ${feedback.points.join(' · ')}.\n\n${feedback.suggestion || 'This meal is balanced against the targets you set; no evidence-backed change stands out.'}`;
};

const dietaryRecommendations = (app) => {
  const book = filterByDiet(app.safeRecipes || RECIPES, app.planDiets || app.diets || []);
  const picks = [...book]
    .sort((a, b) => (b.healthScore + b.proteinScore) - (a.healthScore + a.proteinScore))
    .slice(0, 3);
  const pattern = [...(app.planDiets || app.diets || []), ...(app.allergies || [])].join(', ') || 'your current preferences';
  return `Best matches for ${pattern}:\n\n${picks.map(recipeLine).join('\n')}\n\nDietary filters remove conflicting recipes; these are suggestions, not medical advice.`;
};

/**
 * A local assistant whose responses are derived from the user's records and
 * the app's own recipe tables. It deliberately refuses unsupported answers.
 */
export function answer(text, app) {
  const t = String(text || '').toLowerCase();
  const pantry = app.pantry || [];
  const expiring = expiringSoon(pantry, 3, app.day);
  const book = filterByDiet(app.safeRecipes || RECIPES, app.diets || []);

  if (/shopping route|route.*shop|aisle order|walk.*store/.test(t)) return shoppingRoute(app);
  if (/optimis.*shop|optimis.*basket|cheapest basket|compare store|shopping assistant/.test(t)) return shoppingOptimisation(app);
  if (/generate|invent|create/.test(t) && /recipe|dish|dinner|meal/.test(t)) return generatedRecipe(app);
  if (/meal plan|plan my (week|meal)|plan.*week/.test(t)) return plannedMeals(app);
  if (/substitut|ingredient swap|swap.*ingredient/.test(t)) return substitutions(app);
  if (/explain.*recipe|recipe.*explain|why.*recipe/.test(t)) return recipeExplanation(app);
  if (/cooking help|help me cook|cooking helper|how do i cook/.test(t)) return cookingHelp(app);
  if (/meal rating|rate.*meal|improve.*meal|meal.*improv/.test(t)) return mealImprovement(app);
  if (/dietary recommendation|what fits my diet|diet.*recommend|allerg/.test(t)) return dietaryRecommendations(app);

  if (/pantry assistant|pantry check|what.*pantry/.test(t)) {
    if (!pantry.length) return 'Your pantry is empty. Add or scan products and I’ll track what needs using, what is low and what can become dinner.';
    const low = pantry.filter((item) => item.low);
    return `${pantry.length} pantry item${pantry.length === 1 ? '' : 's'} recorded${expiring.length ? `; ${expiring.length} need using within three days` : ''}${low.length ? `; ${low.length} marked low` : ''}.\n\nAsk “What needs using up?” for recipe matches.`;
  }

  if (/waste|expir|use ?up|using up|going off|needs? using/.test(t)) {
    if (!expiring.length) {
      return pantry.length
        ? 'Nothing in your pantry is close to its use-by date. Add dates as you shop and I’ll flag things here.'
        : 'Your pantry is empty, so there’s nothing for me to watch. Add a few items and I’ll tell you what to cook before it turns.';
    }
    const uses = recipesUsing(pantry, 4, app.day).filter((u) => recipeAllowed(u.recipe, app.diets || [])).slice(0, 2);
    return `${expiring.length} thing${expiring.length === 1 ? '' : 's'} need using: ${expiring.slice(0, 4).map((p) => p.name).join(', ')}.${
      uses.length ? `\n\n${uses.map((u) => recipeLine(u.recipe)).join('\n')}` : ''
    }`;
  }

  if (/on track|progress|predict|losing|gaining|weight|pace/.test(t)) {
    const p = predictProgress(app, { today: app.day });
    if (p.youth) return `${p.reason}\n\n${YOUTH_SIGNPOST}`;
    if (!p.ready) return `${p.reason}\n\nI’d rather say nothing than guess at your progress.`;
    const target = p.toTarget?.weeks
      ? `\n\n${Math.abs(p.toTarget.gapKg)} kg to your target — roughly ${p.toTarget.weeks} weeks at this rate.`
      : '';
    return `At ${p.avgKcal.toLocaleString()} kcal a day against ${p.maintenance.toLocaleString()} maintenance, you're ${p.direction} at about ${Math.abs(p.perWeekKg)} kg a week (${p.days} logged days).${target}\n\n${p.onCourse ? 'That matches what your goal asks for.' : 'That isn’t the direction your goal asks for.'}\n\n${p.caveat}`;
  }

  if (/habit|pattern|when do i|snack|weekend|window/.test(t)) {
    const h = habitAnalysis(app.log || {}, { today: app.day });
    if (!h.days) return 'Your diary is empty, so I can’t see any patterns yet. Log a few days and ask again.';
    const bits = [`Across ${h.days} logged day${h.days === 1 ? '' : 's'}: ${h.perDay} entries a day, ${h.snackShare}% of calories from snacks.`];
    if (h.window) bits.push(`You eat between ${h.window.first} and ${h.window.last} — a ${h.window.hours} hour window.`);
    if (h.weekendGap !== null && Math.abs(h.weekendGap) >= 200) bits.push(`Weekends run ${h.weekendGap > 0 ? 'heavier' : 'lighter'} by about ${Math.abs(h.weekendGap)} kcal a day.`);
    if (h.skipped.length) bits.push(`${h.skipped[0].label} is logged on only ${h.skipped[0].days} of those days.`);
    return bits.join('\n\n');
  }

  if (/tip|advice|suggest|what should i change|improve/.test(t)) {
    return personalTips(app, { today: app.day }).map((tip) => `• ${tip.title}\n  ${tip.detail}\n  (${tip.evidence})`).join('\n\n');
  }

  if (/eat(ing)? out|restaurant|takeaway|takeout|nando|greggs|pret/.test(t)) {
    const out = restaurantPicks(app, { today: app.day });
    if (!out.picks.length) return 'Nothing on the bundled menus fits what’s left of today. The app only knows a handful of chains and has no idea what is near you.';
    // "X kcal left today" is a running balance; under 18 the answer is the
    // dishes and what is in them, without the ledger.
    const budget = app.youth?.calorieDebtLanguage === false || !out.kcalLeft
      ? ''
      : `${out.kcalLeft.toLocaleString()} kcal left today. `;
    return `${budget}Best protein per calorie:\n\n${out.picks.map((p) => `• ${p.food.name} (${p.food.chain}) — ${p.kcal} kcal, ${p.protein}g protein`).join('\n')}\n\nThese are the only chains I ship figures for.`;
  }

  if (/swap|instead of|healthier|alternative/.test(t)) {
    const recent = app.recentFoods?.[0];
    if (!recent) return 'Log something first and I’ll suggest swaps for it—I only compare foods I can see in your diary.';
    const swaps = healthierSwaps(recent, { catalogue: app.catalogue, diets: app.planDiets });
    if (!swaps.length) return `Nothing in the catalogue clearly beats ${recent.name} on protein, fibre, saturated fat or sugar.`;
    return `Instead of ${recent.name}:\n\n${swaps.map((swap) => `• ${swap.food.name} — ${swap.why}`).join('\n')}`;
  }

  if (/goal|target|aiming/.test(t)) {
    // No weekly figure under 18: a week's total is the number a day gets paid
    // back into, and that is the compensation loop this mode removes.
    const week = app.youth?.weeklyCompensation === false
      ? ''
      : ` (${app.weeklyKcalTarget.toLocaleString()} across the week)`;
    return `You're set to ${goalSummary(app)}: ${app.targets.kcal.toLocaleString()} kcal a day${week}, ${app.targets.protein}g protein, ${app.targets.carbs}g carbs, ${app.targets.fat}g fat.`;
  }

  if (/protein|macro|calorie|kcal|nutrition coach|how am i doing/.test(t)) {
    if (!app.entries?.length) return 'Nothing logged today yet—add a meal in the diary and I can tell you where you stand.';
    const left = Math.round(app.targets.protein - app.totals.protein);
    const pick = [...book].sort((a, b) => b.protein - a.protein)[0];
    return `You're on ${app.totals.kcal.toLocaleString()} kcal of ${app.targets.kcal.toLocaleString()} and ${Math.round(app.totals.protein)}g of ${app.targets.protein}g protein.\n\n${left > 0 ? `${left}g protein to go. ${pick.name} would bring ${pick.protein}g.` : 'Protein target already met.'}`;
  }

  if (/afford|budget|money|spend|£/.test(t)) {
    if (!app.weeklyBudget) return 'No weekly budget is set yet—add one under Budget and I’ll track it against recorded shops.';
    const left = app.weeklyBudget - app.spentThisWeek;
    const cheap = [...book].sort((a, b) => a.costPerServing - b.costPerServing).slice(0, 3);
    return `You've recorded ${gbp(app.spentThisWeek, { always: true })} of your ${gbp(app.weeklyBudget)} weekly budget—${left >= 0 ? `${gbp(left, { always: true })} left` : `${gbp(-left, { always: true })} over`}.\n\nCheapest per serving:\n${cheap.map(recipeLine).join('\n')}`;
  }

  if (/15 min|20 min|quick|fast|tonight|dinner/.test(t)) {
    const planned = recipeForTonight(app);
    if (planned && /tonight|dinner/.test(t)) return `Dinner is already planned: ${recipeLine(planned).slice(2)}.`;
    const quick = book.filter((recipe) => recipe.time <= 25).sort((a, b) => a.time - b.time);
    return `Quickest recipes:\n\n${quick.slice(0, 4).map(recipeLine).join('\n')}`;
  }

  if (/grocery recommendation|shopping list|what should i buy/.test(t)) {
    const groceries = groceryRecommendations(app, { today: app.day });
    if (!groceries.ready) return groceries.reason;
    return `Based on ${groceries.days} logged days:\n\n${groceries.items.map((item) => `• ${item.food.name} — ${item.why}`).join('\n')}`;
  }

  if (pantry.length && /cook|make|recipe|what should/.test(t)) {
    const uses = recipesUsing(pantry, 5, app.day).filter((u) => recipeAllowed(u.recipe, app.diets || [])).slice(0, 3);
    if (uses.length) return `Based on what's in your kitchen:\n\n${uses.map((u) => recipeLine(u.recipe)).join('\n')}`;
  }

  return 'I answer from your pantry, diary, plan, shopping history and budget. Ask me to generate or explain a recipe, plan meals, suggest substitutions, improve a meal, reduce waste, optimise a basket or build a shopping route.';
}
