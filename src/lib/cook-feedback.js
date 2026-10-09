/**
 * Cook feedback — extremely lightweight structured outcome.
 * Loved / Good / Fine / Wouldn't repeat + optional reasons. Seconds to
 * complete; feeds taste ratings + preference events + waste learning.
 */
export const COOK_VERDICTS = [
  { id: 'loved', label: 'Loved it' },
  { id: 'good', label: 'Good' },
  { id: 'fine', label: 'Fine' },
  { id: 'no-repeat', label: "Wouldn't repeat" },
];
export const COOK_REASONS = [
  { id: 'too-much-effort', label: 'Too much effort' },
  { id: 'too-expensive', label: 'Too expensive' },
  { id: 'too-much-food', label: 'Too much food' },
  { id: 'household-disliked', label: "Household didn't like it" },
  { id: 'took-longer', label: 'Took longer than expected' },
  { id: 'hard-to-find', label: 'Ingredient difficult to find' },
  { id: 'great-leftovers', label: 'Great leftovers' },
];
const verdictToTaste = { loved: 'love', good: 'like', fine: 'like', 'no-repeat': 'nope' };
export const cookFeedbackActions = (set) => ({
  recordCookFeedback: ({ recipeId, verdict, reasons = [], actualMins = null } = {}) => set((s) => {
    if (!recipeId || !COOK_VERDICTS.some((v) => v.id === verdict)) return {};
    const taste = verdictToTaste[verdict] || 'like';
    const event = { recipeId, date: s.day, rating: taste, cookingRating: verdict === 'no-repeat' ? 'nope' : taste, reasons, actualMins, source: 'cook-feedback' };
    return {
      tasteRatings: { ...(s.tasteRatings || {}), [recipeId]: taste },
      preferenceEvents: [...(s.preferenceEvents || []), event].slice(-500),
      cookFeedback: [...(s.cookFeedback || []), { ...event, at: Date.now() }].slice(-500),
    };
  }),
});
