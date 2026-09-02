/**
 * First-session milestones.
 *
 * A new user faces an empty app and a hundred possible first moves; these four
 * name the smallest path to value. Every one is counted from real state —
 * there is nothing to tap-to-complete and nothing pretends progress — and the
 * whole card disappears once all four are done, because a checklist that
 * outlives its usefulness is just noise.
 */

export const FIRST_SESSION_MILESTONES = [
  { id: 'item', label: 'Add your first item', target: (s) => (s.pantry?.length || 0) + (s.shoppingList?.length || 0) > 0 },
  { id: 'meal', label: 'Plan your first meal', target: (s) => Object.keys(s.plan || {}).some((date) => Object.keys(s.plan[date] || {}).length > 0) },
  { id: 'list', label: 'Create your first shopping list', target: (s) => (s.shoppingList?.length || 0) > 0 },
  { id: 'shop', label: 'Log your first purchase', target: (s) => (s.shops?.length || 0) > 0 },
];

/** Milestones with done flags, plus a dismissal guard that needs no state. */
export const firstSessionMilestones = (state = {}) => FIRST_SESSION_MILESTONES.map((milestone) => ({
  id: milestone.id,
  label: milestone.label,
  done: Boolean(milestone.target(state)),
}));

export const milestonesComplete = (milestones = []) => milestones.length > 0 && milestones.every((m) => m.done);
