/**
 * Product events are deliberately coarse. They measure the plan-to-table
 * journey without including food names, health values, recipe text or prices.
 */
export const PRODUCT_EVENT_NAMES = [
  'app_opened',
  'onboarding_completed',
  'screen_viewed',
  'plan_generated',
  'plan_accepted',
  'shopping_started',
  'shopping_completed',
  'recipe_cooked',
  'pantry_reconciled',
  'household_invite_accepted',
  'price_comparison_opened',
];

export const PRODUCT_EVENT_NAME_SET = new Set(PRODUCT_EVENT_NAMES);

export const PRODUCT_EVENT_PROPERTY_KEYS = new Set([
  'screen',
  'source',
  'intent',
  'scope',
  'result',
  'count',
  'mealCount',
  'hasPantry',
  'seasonal',
  'leftoverFirst',
]);
