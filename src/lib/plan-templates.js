/**
 * Adaptive meal-plan templates — planning strategies, not fixed recipes.
 * Applying a template regenerates the week from current pantry, prefs,
 * history, budget, size, availability and waste. Saved templates store the
 * strategy + household pattern, never seven frozen meals.
 */
export const PLAN_TEMPLATES = [
  { id: 'normal', label: 'Normal week', blurb: 'Balanced school/work week.', buildPlanInput: {} },
  { id: 'busy', label: 'Busy week', blurb: 'Fast cooks, minimal effort.', buildPlanInput: { maxTime: 25, variety: false } },
  { id: 'low-budget', label: 'Low-budget week', blurb: 'Cheapest sensible meals.', buildPlanInput: { budget: 1.5 } },
  { id: 'use-up', label: 'Use-up week', blurb: 'Pantry-first, expiry-first.', buildPlanInput: { budget: 2.0 } },
  { id: 'leftovers', label: 'High-leftover week', blurb: 'Cook once, eat twice.', buildPlanInput: { batch: true } },
  { id: 'family', label: 'Family week', blurb: 'Crowd-pleasers, bigger portions.', buildPlanInput: { occasion: 'Family' } },
  { id: 'minimal', label: 'Minimal-cooking week', blurb: 'Fewest cooks possible.', buildPlanInput: { batch: true, maxTime: 30, variety: false } },
];
export const templateById = (id) => PLAN_TEMPLATES.find((t) => t.id === id) || null;
/** Resolve a saved template (strategy + overrides) for the autopilot. */
export const resolveTemplate = (saved) => {
  if (!saved) return null;
  const base = templateById(saved.templateId || saved.id);
  if (!base) return null;
  return { ...base, ...(saved.overrides || {}), buildPlanInput: { ...base.buildPlanInput, ...(saved.overrides || {}) } };
};
