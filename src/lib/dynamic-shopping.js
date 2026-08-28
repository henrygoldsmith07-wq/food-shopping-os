import { shoppingNameKey, mergeItems, recurringStaples } from './shopping.js';
import { canonicalName } from './aliases.js';
import { planEntries, shoppingForPlan } from './mealplan.js';
import { pantryTruthForNeed } from './kitchen.js';
import { addShoppingExplanations } from './shopping-explanations.js';
import { runoutPredictionFor } from './consumption-predictions.js';
import { evidenceConfidence } from './confidence.js';

const reliable = (item, today) => ['confirmed_sufficient', 'probably_available'].includes(pantryTruthForNeed(item, null, { today }));
const priorityFor = (row) => row.expiryPressure ? 'urgent' : row.mealDependency ? 'planned' : row.staple ? 'routine' : 'normal';

export const deriveDynamicShoppingList = (state = {}, { dates = null } = {}) => {
  const planDates = dates || Object.keys(state.plan || {}).sort();
  const recipePool = state.recipes || [];
  const planRows = shoppingForPlan(state.plan || {}, planDates, { pantry: [], recipes: recipePool });
  const entries = planEntries(state.plan || {}, planDates);
  const recipesById = new Map(recipePool.map((recipe) => [recipe.id, recipe]));
  const recipesByName = new Map(entries.map((entry) => [entry.recipe?.name || recipesById.get(entry.recipeId)?.name, entry.recipe || recipesById.get(entry.recipeId)]).filter(([name]) => name));
  const pantry = state.pantry || [];
  const auto = planRows.map((row) => {
    const recipe = recipesByName.get(row.fromRecipe);
    const pantryRow = pantry.find((item) => canonicalName(item.name, state.aliasMemory) === canonicalName(row.name, state.aliasMemory));
    const truth = pantryRow ? pantryTruthForNeed(pantryRow, row.qty, { today: state.day, learnedAliases: state.aliasMemory }) : 'unknown';
    return {
      ...row,
      fromRecipe: row.fromRecipe || recipe?.name || null,
      mealDependency: row.fromRecipe || recipe?.name || null,
      priority: priorityFor({ mealDependency: row.fromRecipe || recipe?.name, expiryPressure: pantryRow?.expiry && pantryRow.expiry <= state.day }),
      pantryTruth: truth,
      autoListed: true,
      confidenceEvidence: evidenceConfidence({
        confidence: truth === 'confirmed_sufficient' ? 'high' : truth === 'probably_available' ? 'medium' : 'low',
        source: 'pantry',
        inferred: truth !== 'confirmed_sufficient',
      }),
    };
  }).filter((row) => !row.pantryTruth || !reliable(pantry.find((item) => canonicalName(item.name, state.aliasMemory) === canonicalName(row.name, state.aliasMemory)), state.day));

  const staples = recurringStaples(state.shops || [], pantry, state.shoppingList || [], { today: state.day })
    .filter((item) => item.dueNow)
    .map((item) => {
      const prediction = runoutPredictionFor({ ...item, quantity: item.quantity || item.count || 1 }, state.shops || [], { today: state.day });
      return {
        name: item.name,
        qty: item.qty || '1',
        staple: true,
        priority: 'routine',
        mealDependency: null,
        autoListed: true,
        consumptionPrediction: prediction,
        confidenceEvidence: prediction.confidenceEvidence || evidenceConfidence({ confidence: 'none', source: 'history', inferred: true }),
        explanation: prediction.label,
      };
    });
  const manual = (state.shoppingList || []).filter((item) => !item.autoListed && !item.fromRecipe).map((item) => ({ ...item, manuallyRequested: true }));
  const requested = (state.requestedShopping || []).map((item) => ({ ...item, priority: item.priority || 'normal', manuallyRequested: true }));
  const merged = mergeItems([...auto, ...staples, ...requested, ...manual], { learnedAliases: state.aliasMemory || {} });
  return addShoppingExplanations(merged.map((item) => ({ ...item, priority: item.priority || priorityFor(item), mealDependency: item.mealDependency || null })), state)
    .sort((a, b) => ({ urgent: 0, planned: 1, normal: 2, routine: 3 }[a.priority] ?? 4) - ({ urgent: 0, planned: 1, normal: 2, routine: 3 }[b.priority] ?? 4));
};
