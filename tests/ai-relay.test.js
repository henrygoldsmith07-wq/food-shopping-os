import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AI_CONTEXT_ALLOWLIST,
  askServerAi,
  buildAiContext,
  classifyAiTask,
  isRelayContextClean,
  parseAiOutput,
} from '../src/lib/ai-relay.js';

/**
 * The server relay is the one place household words leave the device, so the
 * client rules are tested as a privacy boundary, not just a feature:
 * allowlisted keys only, health questions stay local, context stays small.
 */
describe('classifying a question for the server relay', () => {
  it.each([
    ['Can you optimise my shopping basket?', 'shopping'],
    ['What is my shopping route on Saturday?', 'route'],
    ['What can I afford this week?', 'budget'],
    ['What needs using up before it goes off?', 'waste'],
    ['Suggest a substitution for butter', 'substitution'],
    ['Plan my week of dinners', 'meal-plan'],
    ['Generate a pantry recipe with lentils', 'recipe'],
    ['What is in my pantry?', 'pantry'],
    ['How do I roast a chicken?', 'cooking'],
  ])('routes "%s" to %s', (question, task) => {
    expect(classifyAiTask(question)).toBe(task);
  });

  it.each([
    'How am I doing on protein?',
    'What should my calorie target be?',
    'Am I under my weight goal?',
    'Is this safe with a nut allergy?',
    'Which diet should I follow?',
    'Log a workout and eat the calories back?',
    'How did I sleep this week?',
    'When is my next period due?',
    'Is my blood pressure high?',
    'How much iron am I getting?',
  ])('keeps health-shaped questions local: "%s"', (question) => {
    expect(classifyAiTask(question)).toBeNull();
  });

  it('sends unclassifiable chatter to the local answerer, not the relay', () => {
    expect(classifyAiTask('hello there')).toBeNull();
    expect(classifyAiTask('')).toBeNull();
    expect(classifyAiTask(null)).toBeNull();
  });
});

describe('building relay context', () => {
  const app = {
    day: '2026-10-16',
    plan: {
      '2026-10-16': { dinner: 'r1' },
      '2026-10-10': { dinner: 'r2' }, // past: never sent
    },
    safeRecipes: [{ id: 'r1', name: 'Lemon Chicken Traybake' }, { id: 'r2', name: 'Old Stew' }],
    myRecipes: [],
    pantry: [{ name: 'Lentils' }, { name: 'Rice' }, { name: '' }],
    shoppingList: [{ name: 'Milk', checked: false }, { name: 'Bread', checked: true }],
    // Health-shaped state that must never cross the boundary:
    body: { weightKg: 80 },
    targets: { kcal: 2000 },
    goal: 'loss',
    diets: ['vegan'],
    allergies: ['peanuts'],
    measurements: [{ key: 'weight', value: 80 }],
    workouts: [{ type: 'run' }],
  };

  it('sends only allowlisted keys', () => {
    const context = buildAiContext(app);
    expect(isRelayContextClean(context)).toBe(true);
    for (const key of Object.keys(context)) {
      expect(AI_CONTEXT_ALLOWLIST).toContain(key);
    }
  });

  it('sends names only — no health fields, no past plans, no checked items', () => {
    const context = buildAiContext(app);
    expect(context).toEqual({
      mealNames: ['Lemon Chicken Traybake'],
      pantryItems: ['Lentils', 'Rice'],
      listGaps: ['Milk'],
    });
    const serialised = JSON.stringify(context);
    expect(serialised).not.toContain('80');
    expect(serialised).not.toContain('peanut');
    expect(serialised).not.toContain('Old Stew');
    expect(serialised).not.toContain('Bread');
  });

  it('omits empty groups and stays far under the server context limit', () => {
    expect(buildAiContext({})).toEqual({});
    const big = buildAiContext({
      ...app,
      pantry: Array.from({ length: 500 }, (_, i) => ({ name: `item ${i}` })),
    });
    expect(big.pantryItems).toHaveLength(40);
    expect(JSON.stringify(big).length).toBeLessThan(12000);
  });

  it('rejects contexts with smuggled keys', () => {
    expect(isRelayContextClean({ mealNames: ['x'], targets: {} })).toBe(false);
    expect(isRelayContextClean({ body: {} })).toBe(false);
  });
});

describe('reading relay output', () => {
  it('parses the contracted JSON shape', () => {
    expect(parseAiOutput(JSON.stringify({
      answer: 'Buy oats.',
      suggestions: ['Check the pantry first'],
      warnings: ['Prices change daily'],
    }))).toEqual({
      answer: 'Buy oats.',
      suggestions: ['Check the pantry first'],
      warnings: ['Prices change daily'],
    });
  });

  it('shows unparseable output as text rather than dropping it', () => {
    expect(parseAiOutput('Just some text').answer).toBe('Just some text');
  });

  it('never invents missing parts', () => {
    expect(parseAiOutput(JSON.stringify({}))).toEqual({ answer: '', suggestions: [], warnings: [] });
    expect(parseAiOutput('')).toEqual({ answer: '', suggestions: [], warnings: [] });
    expect(parseAiOutput(null)).toEqual({ answer: '', suggestions: [], warnings: [] });
  });

  it('drops non-string suggestions and caps length', () => {
    const parsed = parseAiOutput(JSON.stringify({ answer: 'a', suggestions: ['ok', 42, null, 'x'.repeat(5000)] }));
    expect(parsed.suggestions).toEqual(['ok', 'x'.repeat(5000)]);
  });
});

describe('sending through the shared gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses health-smuggled context without touching the network', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('must not fetch'); });
    vi.stubGlobal('fetch', fetchMock);
    await expect(askServerAi({ task: 'shopping', prompt: 'x', context: { mealNames: [], body: {} } }))
      .rejects.toThrow(/health fields/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
