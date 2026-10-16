/**
 * Food Intelligence — the one place the household's signals become decisions.
 *
 * Forq already contains the hard parts: the waste predictor knows what will
 * go unused, the recovery engine knows how a drifted week repairs itself, the
 * adaptations collector knows what Forq quietly changed, the week manager
 * knows what needs a human, and the next-action ranker knows what to lead
 * with. None of them disagreed about the *facts* — they just answered
 * different questions on different screens.
 *
 * This module composes those engines — it never re-derives their answers —
 * and turns them into one ranked stack of decisions, each shaped the same
 * way:
 *
 *   title       — the recommendation, in one line
 *   reason      — why now, in plain kitchen terms
 *   evidence    — the specific observations behind it
 *   impact      — what acting is worth
 *   confidence  — how strong the evidence is (never weak evidence as certainty)
 *   action      — one primary action, as a *descriptor* (kind + target), so
 *                 this layer stays pure and any surface can execute it
 *
 * Ranking is a straight urgency ladder over the kitchen, the same one
 * lib/next-action.js uses for the lead: waste first, then a week that needs
 * repair, then confirmations, then shopping and planning, then leftovers and
 * learning. The lead decision and the week manager's exceptions describe the
 * same facts through the same engines, so the stack can never disagree with
 * the cards Home already shows — it names the same things as decisions.
 *
 * Pure: state + already-derived signals in, decisions out. No writes, no
 * closures over the store, no AI.
 */

import { nextAction } from './next-action.js';
import { weekManager } from './week-manager.js';
import { collectAdaptations } from './adaptations.js';
import { leftoverItems } from './mealplan.js';

/** How confident a decision is allowed to sound, worst first. */
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

/**
 * One decision, described identically everywhere. `action` is a descriptor —
 * `runDecision` turns it into the store/navigation call for a surface.
 *
 * @param {object} fields
 */
const decision = (fields) => ({
  evidence: [],
  impact: '',
  confidence: 'medium',
  alternative: null,
  recommendationId: fields.id,
  ...fields,
});

/**
 * The lead (lib/next-action.js) and a week-manager exception sometimes
 * describe the same fact. This maps one to the other so the stack shows a
 * fact once, as a decision, not twice as two cards.
 */
const SAME_DECISION = {
  'recover-week': 'repair-week',
  shop: 'to-buy',
  'plan-week': 'open-days',
  'use-soon': 'expiring',
};

/** Turn next-action's closure-based action into a pure descriptor. */
const LEAD_ACTIONS = {
  'use-soon': { kind: 'pantry', target: null, label: 'See the pantry' },
  'confirm-loop': { kind: 'tab', target: 'cook', label: 'Review' },
  'recover-week': { kind: 'weekLoop', target: 'plan', label: 'Show me' },
  'plan-week': { kind: 'weekLoop', target: 'plan', label: 'Plan the week' },
  shop: { kind: 'tab', target: 'shop', label: 'Open the list' },
  setup: { kind: 'guidance', target: 'setup', label: 'Finish setup' },
};

/** Where each week-manager exception sends a household that acts on it. */
const EXCEPTION_DECISIONS = {
  'repair-week': { priority: 1, action: { kind: 'weekLoop', target: 'plan', label: 'Repair week' } },
  expiring: { priority: 0, action: { kind: 'tab', target: 'plan', label: 'Plan around them' } },
  'open-days': { priority: 3, action: { kind: 'weekLoop', target: 'plan', label: 'Fill the week' } },
  'to-buy': { priority: 3, action: { kind: 'tab', target: 'shop', label: 'Open the list' } },
  leftovers: { priority: 4, action: { kind: 'weekLoop', target: 'plan', label: 'Plan around them' } },
};

const daysLeftLine = (daysLeft) => {
  if (daysLeft === null || daysLeft === undefined || !Number.isFinite(Number(daysLeft))) return 'expires soon';
  const days = Number(daysLeft);
  if (days <= 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  return `expires in ${days} days`;
};

/**
 * At risk of going unused: the predictor's high-likelihood rows, or anything
 * with a known expiry inside two days. An unknown expiry (daysLeft null —
 * usual for not-yet-bought items) counts on likelihood alone, never as "0
 * days left". Same predicate lib/next-action.js ranks the lead by, so a
 * decision and its evidence can never disagree.
 */
const atRisk = (row) => {
  if (!row?.name) return false;
  if (row.likelihood === 'high') return true;
  return row.daysLeft !== null && row.daysLeft !== undefined && Number.isFinite(Number(row.daysLeft)) && Number(row.daysLeft) <= 2;
};

/**
 * The expiring items the plan will not use — the proactive half of waste
 * prevention: not "you wasted X" but "here is the meal that saves it".
 *
 * @param {any} wastePrediction predictUnusedIngredients output
 * @param {number} max how many to surface
 * @param {Set<string>} skipNames items the lead decision already names
 */
const wasteDecisions = (wastePrediction, max, skipNames) => {
  const items = (wastePrediction?.items || [])
    .filter((row) => atRisk(row))
    .filter((row) => !skipNames.has(String(row.name).toLowerCase()))
    .slice(0, max);
  return items.map((row) => {
    const name = String(row.name);
    const evidence = [`${name} ${daysLeftLine(row.daysLeft)}`, "Nothing in this week's plan uses it"];
    if (row.learned) evidence.push('You have binned this before');
    return decision({
      id: `waste:${name.toLowerCase()}`,
      kind: 'waste',
      priority: row.likelihood === 'high' ? 0 : 2,
      title: `Use ${name.toLowerCase()} before it goes off`,
      reason: 'Nothing planned uses it, and a meal built around it is the cheapest way to use it up.',
      evidence,
      impact: 'Uses food you already own — nothing new to buy, nothing to bin',
      confidence: row.likelihood === 'high' ? 'medium' : 'low',
      action: { kind: 'tab', target: 'plan', label: 'Plan around it' },
      alternative: { kind: 'pantry', target: null, label: 'Check the pantry' },
    });
  });
};

/**
 * The one ranked stack. `signals` are the derived values deriveApp has
 * already computed — this module recomputes nothing the store already knows.
 *
 * @param {any} state the raw household state
 * @param {any} signals { today, wastePrediction, weekRecovery, tonightDecision, useSoonIngredients, portions }
 */
export function buildFoodIntelligence(state = {}, signals = {}) {
  const today = signals.today || state.day;
  // The view the engines read: state plus the derived pieces they expect.
  // The store's own value has exactly this shape, so every engine sees the
  // same thing it sees on screen.
  const view = {
    ...state,
    day: today,
    wastePrediction: signals.wastePrediction ?? null,
    weekRecovery: signals.weekRecovery ?? null,
    tonightDecision: signals.tonightDecision ?? null,
    useSoonIngredients: signals.useSoonIngredients ?? [],
    leftovers: leftoverItems(state.pantry),
    portions: signals.portions ?? state.portions ?? state.household ?? 1,
  };

  // 1. The lead — the canonical ranker, never re-ranked here.
  const lead = nextAction(view, {});
  const leadNames = new Set(
    lead?.id === 'use-soon'
      ? (signals.wastePrediction?.items || []).slice(0, 2).map((row) => String(row.name || '').toLowerCase())
      : [],
  );

  // 2. The week manager's exceptions, as decisions.
  const week = weekManager(view, { today });
  const exceptionDecisions = (week.exceptions || [])
    .filter((exception) => SAME_DECISION[lead?.id] !== exception.id)
    .filter((exception) => EXCEPTION_DECISIONS[exception.id])
    .map((exception) => {
      const spec = EXCEPTION_DECISIONS[exception.id];
      const evidence = [];
      if (exception.id === 'expiring') evidence.push(exception.detail);
      if (exception.id === 'to-buy') evidence.push(`${week.unchecked} unchecked on a list built from the plan`);
      if (exception.id === 'open-days') evidence.push(`${week.openDays} day${week.openDays === 1 ? '' : 's'} with nothing planned`);
      if (exception.id === 'repair-week' && signals.weekRecovery?.explanations?.length) {
        evidence.push(...signals.weekRecovery.explanations.slice(0, 2));
      }
      if (exception.id === 'leftovers') evidence.push('They keep only a few days — using them is free food');
      const impact = {
        expiring: 'Keeps food out of the bin and off the next list',
        'repair-week': 'Puts the rest of the week back in step with the list',
        'open-days': 'The list builds itself once the week is planned',
        'to-buy': 'The plan and the kitchen stay in step',
        leftovers: 'Using them means buying less next time',
      }[exception.id] || '';
      return decision({
        id: exception.id,
        kind: 'week',
        priority: spec.priority,
        title: exception.title,
        reason: exception.detail || '',
        evidence,
        impact,
        confidence: exception.id === 'expiring' ? 'medium' : 'high',
        action: spec.action,
      });
    });

  // 3. Proactive waste prevention, per item the plan will not use.
  const waste = wasteDecisions(signals.wastePrediction, 2, leadNames);

  // 4. Learning worth hearing about — only changes backed by real evidence.
  const adaptations = collectAdaptations(view, { today }).adaptations
    .filter((row) => row.confidence !== 'low')
    .slice(0, 1)
    .map((row) => decision({
      id: `adapt:${row.id}`,
      kind: 'learn',
      priority: 4,
      title: row.title,
      reason: 'Forq adjusted this from what it observed — you can undo it any time.',
      evidence: [row.evidence].filter(Boolean),
      impact: "Next week's list and portions follow what actually happens",
      confidence: row.confidence,
      action: { kind: 'tab', target: 'learn', label: 'Review changes' },
    }));

  // 5. Loop confirmations the lead didn't take.
  const confirmations = [];
  if (lead?.id !== 'confirm-loop' && (state.loopChecks?.unconfirmed || 0) > 0) {
    confirmations.push(decision({
      id: 'confirm-loop',
      kind: 'cook',
      priority: 2,
      title: `Confirm ${(state.loopChecks.unconfirmed) === 1 ? 'one meal' : `${state.loopChecks.unconfirmed} meals`} from this week`,
      reason: 'Confirming or skipping what you cooked is what teaches Forq.',
      evidence: ['Forq is holding a prediction about these meals'],
      impact: "Next week's plan starts from what actually happened",
      confidence: 'high',
      action: { kind: 'tab', target: 'cook', label: 'Review' },
    }));
  }

  const all = [];
  if (lead) {
    all.push(decision({
      id: lead.id,
      kind: lead.id === 'use-soon' ? 'waste' : 'week',
      priority: 0,
      title: lead.title,
      reason: lead.detail || '',
      evidence: [
        ...(lead.id === 'use-soon'
          ? (signals.wastePrediction?.items || [])
            .filter((row) => atRisk(row))
            .slice(0, 3)
            .map((row) => `${row.name} — ${daysLeftLine(row.daysLeft)}`)
          : []),
        ...(lead.id === 'recover-week' ? (signals.weekRecovery?.explanations || []).slice(0, 2) : []),
        ...(lead.id === 'shop' ? [`${(state.shoppingList || []).filter((row) => !row.checked).length} unchecked on a list built from the plan`] : []),
        ...(lead.id === 'plan-week' ? [`${week.openDays} day${week.openDays === 1 ? '' : 's'} with nothing planned`] : []),
      ],
      impact: {
        'use-soon': 'Uses food you already own — nothing new to buy, nothing to bin',
        'recover-week': 'Puts the rest of the week back in step with the list',
        'confirm-loop': "Next week's plan starts from what actually happened",
        'plan-week': 'The list builds itself once the week is planned',
        shop: 'The plan and the kitchen stay in step',
        setup: 'Unlocks the rest of the loop',
      }[lead.id] || '',
      confidence: lead.id === 'use-soon' ? 'medium' : 'high',
      action: LEAD_ACTIONS[lead.id] || { kind: 'tab', target: 'plan', label: lead.cta || 'Open' },
    }));
  }

  const decisions = [...all, ...exceptionDecisions, ...waste, ...confirmations, ...adaptations]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (CONFIDENCE_RANK[a.confidence] !== CONFIDENCE_RANK[b.confidence]) {
        return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      }
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 6);

  return {
    decisions,
    primary: decisions[0] || null,
    quiet: decisions.length === 0,
    weekState: week.state,
    generatedAt: today,
  };
}

/**
 * Execute a decision's action descriptor. The UI hands over its own
 * navigation callbacks; the mapping lives here so every surface runs a
 * decision the same way.
 */
export const runDecision = (decisionRow, { goTab, openPantry, openWeekLoop, openGuidance } = {}) => {
  const action = decisionRow?.action;
  if (!action) return;
  if (action.kind === 'pantry') openPantry?.();
  else if (action.kind === 'weekLoop') (openWeekLoop ? openWeekLoop(action.target) : goTab?.(action.target));
  else if (action.kind === 'guidance') openGuidance?.(action.target);
  else goTab?.(action.target);
};
