/**
 * Progressive disclosure — secondary capabilities stay off until the user
 * adds them. The default experience is the core food loop only:
 *
 *   Plan meals → shopping list → shop → update pantry → cook → repeat
 *
 * Optional tools are never deleted; enabling one only surfaces UI entry points.
 */

/** Always-on product loop (not stored — documentation + copy). */
export const CORE_LOOP = [
  { id: 'plan', label: 'Plan meals', summary: 'Decide what you will cook.' },
  { id: 'list', label: 'Generate shopping list', summary: 'One list from the plan, minus the pantry.' },
  { id: 'shop', label: 'Shop', summary: 'Buy what is on the list.' },
  { id: 'pantry', label: 'Update pantry', summary: 'Put stock away and mark what is low.' },
  { id: 'cook', label: 'Cook', summary: 'Cook what you planned, then repeat.' },
];

const tool = (id, label, blurb, category = 'extra') => ({ id, label, blurb, category });

/**
 * Secondary surfaces hidden from new users until enabled in Add tools.
 * Ids are stable and used in state.enabledTools.
 */
export const OPTIONAL_TOOLS = [
  tool(
    'exercise',
    'Exercise log',
    'Workouts and training minutes. Adjusts targets only if you choose to eat exercise calories back.',
    'health',
  ),
  tool(
    'cycle',
    'Cycle tracking',
    'Periods and symptoms under Health. Off by default and never inferred.',
    'health',
  ),
  tool(
    'bloods',
    'Blood results & glucose',
    'Lab panels and CGM imports you type or paste yourself — not clinical advice.',
    'health',
  ),
  tool(
    'fasting',
    'Fasting windows',
    'A window you start and end yourself. Nothing is inferred from gaps in the diary.',
    'health',
  ),
  tool(
    'carbon',
    'Carbon analysis',
    'Rough food-footprint estimates from logged names and category factors.',
    'insights',
  ),
  tool(
    'receipt',
    'Receipt capture',
    'Scan or paste a receipt to record a shop. Manual trip entry still works without this.',
    'shopping',
  ),
  tool(
    'reports',
    'Advanced reports',
    'Dashboards, exports and deeper reviews beyond the next-step guidance.',
    'insights',
  ),
  tool(
    'coach',
    'Coach links',
    'Time-limited read-only links for a coach or clinician you choose to share with.',
    'sharing',
  ),
  tool(
    'assistant',
    'Food coach (AI)',
    'Ask questions about your plan, pantry and diary. Optional — the app works without it.',
    'insights',
  ),
];

export const OPTIONAL_TOOL_IDS = OPTIONAL_TOOLS.map((t) => t.id);
export const optionalToolBy = Object.fromEntries(OPTIONAL_TOOLS.map((t) => [t.id, t]));

export const TOOL_CATEGORIES = [
  { id: 'health', label: 'Health & body' },
  { id: 'shopping', label: 'Shopping extras' },
  { id: 'insights', label: 'Insights & analysis' },
  { id: 'sharing', label: 'Sharing' },
];

/** New users start with none of the secondary tools. */
export const DEFAULT_ENABLED_TOOLS = [];

/** Full surface — used by the Everything product mode. */
export const ALL_ENABLED_TOOLS = [...OPTIONAL_TOOL_IDS];

export const isToolEnabled = (enabledTools, id) => {
  if (!OPTIONAL_TOOL_IDS.includes(id)) return true; // unknown ids are not gated
  const list = Array.isArray(enabledTools) ? enabledTools : DEFAULT_ENABLED_TOOLS;
  return list.includes(id);
};

export const normaliseEnabledTools = (value) => {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_TOOLS];
  return value.filter((id) => OPTIONAL_TOOL_IDS.includes(id));
};

/** Map advanced-panel view keys → optional tool ids. */
export const ADVANCED_VIEW_TOOL = {
  planet: 'carbon',
  micros: null, // micronutrient gaps stay with nutrition diary; not in the hidden list
  fasting: 'fasting',
  results: 'bloods',
  register: null, // honesty register always available when advanced is open
};

/** Analytics panel view keys that need an optional tool. */
export const ANALYTICS_VIEW_TOOL = {
  impact: 'carbon',
  reports: 'reports',
};
