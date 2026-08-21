import { z } from 'zod';

export const stateSchema = z.object({
  schemaVersion: z.number().int().min(1).max(100).optional(),
  onboarded: z.boolean(),
}).catchall(z.unknown());

export const syncSchema = z.object({
  version: z.number().int().min(0),
  deviceId: z.string().min(8).max(100),
  state: stateSchema,
});

export const householdSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const invitationSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['adult', 'child']),
  permissions: z.array(z.enum(['shopping', 'pantry', 'recipes', 'health'])).max(4),
});

export const aiRequestSchema = z.object({
  task: z.enum(['shopping', 'nutrition', 'recipe', 'pantry', 'substitution', 'meal-plan', 'budget', 'waste', 'route', 'cooking']),
  prompt: z.string().trim().min(1).max(4000),
  context: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => JSON.stringify(value.context || {}).length <= 12000, {
  message: 'AI context is too large.',
  path: ['context'],
});

export const coachShareSchema = z.object({
  label: z.string().trim().min(1).max(80).default('Coach'),
  scopes: z.array(z.enum(['diary', 'nutrition', 'plan', 'health'])).min(1).max(4),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

export const calendarEventSchema = z.object({
  provider: z.enum(['google', 'azure-ad']),
  title: z.string().trim().min(1).max(160),
  notes: z.string().max(2000).optional(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
}).refine((value) => new Date(value.end) > new Date(value.start), {
  message: 'Event end must be after its start.',
});

export const calendarRangeSchema = z.object({
  provider: z.enum(['google', 'azure-ad']),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
}).refine((value) => {
  const duration = new Date(value.to) - new Date(value.from);
  return duration > 0 && duration <= 93 * 86400000;
}, { message: 'Calendar range must be between one moment and 93 days.' });

export const barcodeLookupSchema = z.object({
  barcode: z.string().trim().regex(/^\d{8,14}$/, 'Barcode must contain 8 to 14 digits.'),
});

export const productDataSchema = z.object({
  barcode: z.string().regex(/^\d{8,14}$/),
  name: z.string().max(200),
  brand: z.string().max(200).nullable().optional(),
  quantity: z.string().max(120).nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  ingredients: z.string().max(4000).nullable().optional(),
  allergens: z.string().max(1000).nullable().optional(),
  labels: z.string().max(1000).nullable().optional(),
  nutriScore: z.string().max(20).nullable().optional(),
  ecoScore: z.string().max(20).nullable().optional(),
  nutrition: z.record(z.string().max(40), z.number().finite()).optional(),
  source: z.literal('open-food-facts'),
  sourceLabel: z.literal('Open Food Facts'),
  checkedAt: z.iso.datetime(),
});

export const priceLookupSchema = z.object({
  barcode: z.string().trim().regex(/^\d{8,14}$/, 'Barcode must contain 8 to 14 digits.').optional(),
  query: z.string().trim().min(2).max(120).optional(),
}).refine((value) => value.barcode || value.query, {
  message: 'Provide a barcode or product name.',
});

export const observedPriceSchema = z.object({
  id: z.string().max(100).optional(),
  barcode: z.string().regex(/^\d{8,14}$/).nullable().optional(),
  name: z.string().max(200),
  brand: z.string().max(200).nullable().optional(),
  price: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  offer: z.string().max(200).nullable().optional(),
  store: z.string().max(200).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  observedAt: z.string().max(40).nullable().optional(),
  source: z.literal('open-prices'),
  sourceLabel: z.literal('Open Prices (community observed)'),
  checkedAt: z.iso.datetime(),
});

const analyticsPropertyKey = z.string().refine((key) => [
  'screen', 'source', 'intent', 'scope', 'result', 'count', 'mealCount',
  'hasPantry', 'seasonal', 'leftoverFirst',
].includes(key), 'Unsupported product insight property.');

export const analyticsEventSchema = z.object({
  id: z.string().min(8).max(100).optional(),
  name: z.enum([
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
  ]),
  properties: z.record(analyticsPropertyKey, z.union([
    z.string().max(40), z.number().finite(), z.boolean(),
  ])).default({}),
  at: z.iso.datetime().optional(),
});

export const analyticsBatchSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(50),
});
