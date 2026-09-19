import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyRecipeLines, draftFromClassifiedLines,
} from '../src/server/recipe-extract.js';
import {
  classifierTelemetry, clearClassifierCache, resetClassifierTelemetry,
} from '../src/server/classifier-adapter.js';

/**
 * The recipe prepass: label the lines, and when they already add up to a
 * recipe, skip the extraction model entirely. The count of skipped model calls
 * is the point, so it is asserted here rather than described.
 */

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

const CAPTION = [
  'Quick Tomato Pasta',
  '200 g spaghetti',
  '2 tins chopped tomatoes',
  '1 tbsp olive oil',
  'Heat the pan and add the tomatoes.',
].join('\n');

beforeEach(() => {
  vi.unstubAllEnvs();
  clearClassifierCache();
  resetClassifierTelemetry();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('draftFromClassifiedLines', () => {
  const row = (item, label, source = 'deterministic') => ({ item, label, confidence: 0.8, source });

  it('lays out a titled, ingredient-led list as a recipe draft', () => {
    const draft = draftFromClassifiedLines([
      row('Quick Tomato Pasta', 'title'),
      row('200 g spaghetti', 'ingredient'),
      row('2 tins chopped tomatoes', 'ingredient'),
      row('Heat the pan.', 'instruction'),
    ]);
    expect(draft).toMatchObject({
      title: 'Quick Tomato Pasta',
      servings: 0,
      time: 0,
      ingredients: ['200 g spaghetti', '2 tins chopped tomatoes'],
      steps: ['Heat the pan.'],
    });
  });

  it('merges a stand-alone quantity line into the ingredient that follows it', () => {
    const draft = draftFromClassifiedLines([
      row('Scones', 'title'),
      row('500 g', 'quantity'),
      row('self-raising flour', 'ingredient'),
      row('300 ml', 'quantity'),
      row('milk', 'ingredient'),
    ]);
    expect(draft.ingredients).toEqual(['500 g self-raising flour', '300 ml milk']);
  });

  it('reads servings and time out of metadata lines rather than inventing them', () => {
    const draft = draftFromClassifiedLines([
      row('Fish Pie', 'title'),
      row('Serves 4', 'metadata'),
      row('Total time: 1 hour 10 mins', 'metadata'),
      row('800 g potatoes', 'ingredient'),
      row('400 g fish', 'ingredient'),
    ]);
    expect(draft).toMatchObject({ servings: 4, time: 70 });
  });

  it('refuses a draft with no title — an untitled list is not a recipe', () => {
    expect(draftFromClassifiedLines([
      row('200 g spaghetti', 'ingredient'),
      row('2 tins chopped tomatoes', 'ingredient'),
    ])).toBeNull();
  });

  it('refuses a draft with fewer than two ingredients rather than half a recipe', () => {
    expect(draftFromClassifiedLines([
      row('Something', 'title'),
      row('200 g spaghetti', 'ingredient'),
    ])).toBeNull();
  });

  it('drops noise and other lines instead of smuggling them into the recipe', () => {
    const draft = draftFromClassifiedLines([
      row('Brownies', 'title'),
      row('Subscribe to my newsletter', 'noise'),
      row('blorp', 'other'),
      row('200 g chocolate', 'ingredient'),
      row('100 g butter', 'ingredient'),
    ]);
    expect(draft.ingredients).toEqual(['200 g chocolate', '100 g butter']);
  });
});

describe('classifyRecipeLines', () => {
  it('labels a caption entirely from the rules when the classifier is off', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines(CAPTION);
    expect(out.results[0]).toMatchObject({ label: 'title', source: 'deterministic' });
    expect(out.draft.title).toBe('Quick Tomato Pasta');
    expect(classifierTelemetry().llmCallsAvoided).toBeGreaterThanOrEqual(4);
    expect(classifierTelemetry().remoteCalls).toBe(0);
  });

  it('sends only the unresolved lines, in one batched request', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'ingredient', confidence: 0.9 }] }));
    const out = await classifyRecipeLines(`${CAPTION}\nsea salt to taste`, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.inputs).toEqual(['sea salt to taste']);
    expect(out.results.at(-1)).toMatchObject({ label: 'ingredient', source: 'classifier' });
  });

  it('does not turn a low-confidence guess into an ingredient', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'ingredient', confidence: 0.3 }] }));
    const out = await classifyRecipeLines('Some Recipe\n200 g flour\n100 g butter\nsea salt to taste', { fetchImpl });
    expect(out.results.at(-1)).toMatchObject({ label: 'other', source: 'fallback' });
    expect(out.draft.ingredients).toEqual(['200 g flour', '100 g butter']);
  });

  it('does not bother classifying a scrap too short to be a recipe', async () => {
    const fetchImpl = vi.fn();
    expect(await classifyRecipeLines('Too short', { fetchImpl })).toBeNull();
    expect(await classifyRecipeLines(CAPTION, { fetchImpl: vi.fn() })).not.toBeNull();
  });

  it('gives a back to the model when the lines do not add up to a recipe', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'This is the best pasta I have ever made',
      'honestly, everyone asked for the recipe',
      'link in bio',
    ].join('\n'));
    expect(out.results).toHaveLength(3);
    expect(out.draft).toBeNull();
  });
});