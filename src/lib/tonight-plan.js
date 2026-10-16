/**
 * What Home's "Tonight" card should lead with.
 *
 * The household's own plan outranks any suggestion: when tonight's dinner is
 * planned, the card is about that dish; once a dinner has been cooked today,
 * it says so instead of offering another one. Only an unplanned evening falls
 * through to the meal decision engine's pick from what is in the kitchen.
 *
 * @param {{ plan?: Record<string, any>, cooked?: Array<{ recipeId?: string, date?: string }>, day: string,
 *   byId: (id: string) => any }} input
 * @returns {{ mode: 'cooked' | 'planned' | 'suggest', recipe: any }}
 */
export function tonightPlanState({ plan = {}, cooked = [], day, byId }) {
  const plannedId = plan?.[day]?.dinner || null;
  const planned = plannedId ? byId(plannedId) || null : null;
  const cookedToday = (cooked || []).filter((entry) => entry?.date === day && entry.recipeId);
  const cookedPlanned = planned && cookedToday.some((entry) => entry.recipeId === planned.id) ? planned : null;
  // An off-plan dinner cooked tonight still means dinner is done.
  const cookedDinner = cookedPlanned || cookedToday
    .map((entry) => byId(entry.recipeId))
    .find((recipe) => recipe?.meal === 'dinner') || null;
  if (cookedDinner) return { mode: 'cooked', recipe: cookedDinner };
  if (planned) return { mode: 'planned', recipe: planned };
  return { mode: 'suggest', recipe: null };
}
