import { expiringSoon, planForDay, runningLow } from './kitchen.js';
import { planEntries } from './mealplan.js';
import { rankLeftovers } from './food-suitability.js';
import { compareStores } from './shopping.js';
import { evidenceConfidence } from './confidence.js';
import { predictionSnapshot } from './prediction-feedback.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const evidence = (parts) => parts.filter(Boolean).join(' · ');

const action = (candidate) => ({
  ...candidate,
  score: Math.round(candidate.score * 100) / 100,
  probability: Math.max(0, Math.min(1, candidate.score / 2)),
});

const learnedSuccess = (app, id) => {
  const outcomes = (app.autopilotOutcomes || []).filter((outcome) => outcome.actionId === id);
  return outcomes.length ? outcomes.filter((outcome) => outcome.completed).length / outcomes.length : 0.5;
};

const decisionScore = (app, id, { waste = 0, money = 0, convenience = 0 } = {}) => {
  const success = learnedSuccess(app, id);
  return waste * 0.4 + money * 0.25 + convenience * 0.15 + success * 0.2;
};

/**
 * Rank the one or two food actions that make the household's next decision
 * easier. Scores stay internal; the returned copy contains only human-facing
 * reasons and an executable action.
 *
 * Confidence-aware: every candidate carries `confidence` (high/medium/low),
 * `reversalCost` (low/medium/high) and `needsConfirmation`. Costly-to-reverse
 * or low-evidence actions are downgraded to normal priority with cautious
 * wording and must never auto-apply — see shouldAutoApply().
 */
export const AUTOPILOT_CONFIDENCE_POLICY = {
  // Auto-apply only cheap, high-confidence nudges. Everything else is a
  // suggestion the household confirms.
  autoApply: { maxReversalCost: 'low', minConfidence: 'high' },
  reversalCost: {
    'use-expiring': 'low',
    'cook-planned': 'low',
    'reuse-leftover': 'low',
    'restock-low': 'low',
    'save-on-shop': 'medium',
    steady: 'low',
  },
};

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1, none: 0 };

export const shouldAutoApply = (candidate = {}) => {
  const cost = candidate.reversalCost || 'low';
  const confidence = candidate.confidence || candidate.confidenceEvidence?.level || 'low';
  if (cost !== 'low') return false;
  return (CONFIDENCE_RANK[confidence] || 0) >= CONFIDENCE_RANK[AUTOPILOT_CONFIDENCE_POLICY.autoApply.minConfidence];
};

const withCaution = (candidate) => {
  const reversalCost = AUTOPILOT_CONFIDENCE_POLICY.reversalCost[candidate.id] || 'low';
  const confidence = candidate.confidenceEvidence?.level || 'low';
  const needsConfirmation = !shouldAutoApply({ ...candidate, reversalCost, confidence });
  // Costly or uncertain actions never shout: cap at normal priority and say why.
  const priority = needsConfirmation && candidate.priority === 'high' && (reversalCost !== 'low' || CONFIDENCE_RANK[confidence] < 3)
    ? 'normal'
    : candidate.priority;
  const caution = needsConfirmation
    ? reversalCost !== 'low'
      ? 'Worth a quick check — harder to undo once done.'
      : 'Based on limited evidence — confirm before acting.'
    : null;
  return { ...candidate, priority, reversalCost, confidence, needsConfirmation, caution };
};
export const rankAutopilotActions = (app = {}) => {
  const pantry = app.pantry || [];
  const today = app.day;
  const expiring = expiringSoon(pantry, 2, today);
  const low = runningLow(pantry);
  const todayPlan = planForDay(app.plan || {}, today);
  const planned = Object.values(todayPlan).filter(Boolean);
  const entries = planEntries(app.plan || {}, [today]);
  const leftovers = rankLeftovers(
    pantry.filter((item) => item.cat === 'Leftovers' || item.recipeId),
    { ...app.prefs, today, members: app.members || [], diets: app.diets || [] },
  );
  const list = app.shoppingList || [];
  const candidates = [];

  if (expiring.length && planned.length === 0) {
    const item = expiring[0];
    candidates.push(action({
      id: 'use-expiring',
      kind: 'pantry',
      priority: 'high',
      title: `Use ${item.name.toLowerCase()} next`,
      reason: `${item.name} expires ${item.expiry === today ? 'today' : 'soon'} and is already in your kitchen.`,
      evidence: evidence([`${expiring.length} item${expiring.length === 1 ? '' : 's'} at risk`, 'avoids waste', 'no shop needed']),
      actionLabel: 'Open pantry',
      action: { kind: 'pantry' },
      confidenceEvidence: evidenceConfidence({ confidence: 'high', source: 'pantry' }),
      score: decisionScore(app, 'use-expiring', {
        waste: 1 + clamp(expiring.length / 5), convenience: 1,
      }),
    }));
  }

  if (planned.length && !app.cooked?.some((item) => item.date === today)) {
    const recipeId = planned[0];
    const recipe = entries.find((entry) => entry.recipeId === recipeId)?.recipe;
    if (recipe) {
      const expiringNames = expiring.map((item) => item.name.toLowerCase());
      const hits = (recipe.ingredients || []).filter((ingredient) => expiringNames.some((name) => String(ingredient.name || ingredient).toLowerCase().includes(name))).length;
      candidates.push(action({
        id: 'cook-planned',
        kind: 'cook',
        priority: hits ? 'high' : 'normal',
        title: `Cook ${recipe.name} tonight`,
        reason: hits ? `${recipe.name} uses food that is going off soon.` : `${recipe.name} is already planned for today.`,
        evidence: evidence([`${hits ? hits + ' expiring ingredient' + (hits === 1 ? '' : 's') : 'planned today'}`, 'keeps the plan moving']),
        actionLabel: 'Open today’s plan',
        action: { kind: 'tab', target: 'plan' },
        confidenceEvidence: evidenceConfidence({ confidence: hits ? 'high' : 'medium', source: 'planned-meals', inferred: !hits }),
        score: decisionScore(app, 'cook-planned', {
          waste: hits ? 1 : 0.35, convenience: 0.9,
        }),
      }));
    }
  }

  if (leftovers.length && !planned.length) {
    const item = leftovers[0];
    candidates.push(action({
      id: 'reuse-leftover',
      kind: 'leftover',
      priority: 'high',
      title: `Use ${item.name.toLowerCase()} before buying again`,
      reason: 'A saved portion is available, so the next meal can come from the fridge.',
      evidence: evidence([`${item.portions || 1} portion${(item.portions || 1) === 1 ? '' : 's'} saved`, 'avoids another purchase']),
      actionLabel: 'Open plan',
      action: { kind: 'tab', target: 'plan' },
      confidenceEvidence: evidenceConfidence({ confidence: 'medium', source: 'pantry', inferred: true }),
      score: decisionScore(app, 'reuse-leftover', { waste: 1, money: 0.8, convenience: 0.9 }),
    }));
  }

  if (low.length) {
    const missing = low.filter((item) => !list.some((row) => row.name?.toLowerCase() === item.name?.toLowerCase()));
    if (missing.length) {
      candidates.push(action({
        id: 'restock-low',
        kind: 'shopping',
        priority: 'normal',
        title: `Add ${missing[0].name.toLowerCase()} to your next shop?`,
        reason: 'This item is marked running low and is not on your current list.',
        evidence: evidence([`${missing.length} low item${missing.length === 1 ? '' : 's'}`, 'prevents a last-minute shop']),
        actionLabel: 'Open shopping list',
        action: { kind: 'tab', target: 'shop' },
        confidenceEvidence: evidenceConfidence({ confidence: 'medium', source: 'pantry', inferred: true }),
        score: decisionScore(app, 'restock-low', { waste: 0.2, convenience: 0.75 }),
      }));
    }
  }

  if (app.weeklyBudget > 0 && list.length > 0) {
    const shops = compareStores(list, app.shops || []);
    const cheapest = shops?.[0];
    if (cheapest?.saving > 0) {
      candidates.push(action({
        id: 'save-on-shop',
        kind: 'price',
        priority: 'normal',
        title: `${cheapest.store} could save about £${Number(cheapest.saving).toFixed(2)} this week`,
        reason: 'The current basket has a cheaper recorded shop option.',
        evidence: 'money saved without changing the plan',
        actionLabel: 'Compare shops',
        action: { kind: 'tab', target: 'shop' },
        confidenceEvidence: evidenceConfidence({ confidence: 'medium', source: 'receipt', inferred: true }),
        score: decisionScore(app, 'save-on-shop', {
          money: clamp(Number(cheapest.saving) / 10), convenience: 0.35,
        }),
      }));
    }
  }

  return candidates
    .map(withCaution)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) => index === 0 || item.actionLabel !== all[index - 1].actionLabel)
    .slice(0, 2);
};

export const autopilotPrimary = (app) => rankAutopilotActions(app)[0] || {
  id: 'steady',
  kind: 'steady',
  priority: 'normal',
  title: 'Your kitchen is in a good rhythm',
  reason: 'No urgent food decision is supported by the information Forq has right now.',
  evidence: 'Nothing urgent',
  actionLabel: 'Review your plan',
  action: { kind: 'tab', target: 'plan' },
  score: 0,
  confidence: 'none',
  reversalCost: 'low',
  needsConfirmation: false,
  caution: null,
};
