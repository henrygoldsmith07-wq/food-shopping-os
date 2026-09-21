import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assessPrepassDraft, classifyRecipeLines, DEFAULT_PREPASS_GATE, draftFromClassifiedLines,
} from '../src/server/recipe-extract.js';
import {
  classifierTelemetry, clearClassifierCache, notePrepassOutcome, resetClassifierTelemetry,
} from '../src/server/classifier-adapter.js';
import {
  isLabel, taxonomyFingerprint, taxonomyLabels, taxonomyVersion,
} from '../src/server/classify-taxonomies.js';
import { classifyBatch } from '../src/server/classifier-adapter.js';
import { deterministicProductCategory } from '../src/server/classify-deterministic.js';

/**
 * The prepass quality gate: a classified recipe must not bypass the extraction
 * model unless enough of the source has been confidently understood. When in
 * doubt the prepass declines and the existing extraction model runs instead —
 * a decline is a model call, never a failed import and never a dropped recipe.
 *
 * All remote-dependent cases run with the classifier disabled
 * (CLASSIFIER_API_URL='') so they exercise the deterministic rules only and
 * never touch the network; the mocked-remote cases stub fetchImpl instead.
 */

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

const row = (item, label, confidence = 0.8, source = 'deterministic') => ({
  item, label, confidence, source,
});

beforeEach(() => {
  vi.unstubAllEnvs();
  clearClassifierCache();
  resetClassifierTelemetry();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('taxonomy versioning', () => {
  it('versions every taxonomy', () => {
    expect(taxonomyVersion('recipe-line')).toBe('recipe-line.v1');
    expect(taxonomyVersion('product')).toBe('product.v1');
    expect(taxonomyVersion('recipe-meal')).toBe('recipe-meal.v1');
    expect(taxonomyVersion('nope')).toBeNull();
  });

  it('fingerprints the exact label set, stably', () => {
    const first = taxonomyFingerprint('recipe-line');
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(taxonomyFingerprint('recipe-line')).toBe(first);
    expect(taxonomyFingerprint('product')).not.toBe(first);
    expect(taxonomyFingerprint('nope')).toBeNull();
  });

  it('a label change invalidates cached answers', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const labels = taxonomyLabels('product');
    // Prime the cache under the real label set.
    await classifyBatch('product', ['bananas'], { deterministic: deterministicProductCategory });
    expect(classifierTelemetry().deterministicHits).toBe(1);
    // Simulate a taxonomy change: the same text must not be served the old answer.
    labels.push('test-label-then-removed');
    try {
      await classifyBatch('product', ['bananas'], { deterministic: deterministicProductCategory });
      expect(classifierTelemetry().deterministicHits).toBe(2);
    } finally {
      labels.pop();
    }
  });
});

describe('assessPrepassDraft', () => {
  it('accepts a confident, complete draft', () => {
    const results = [
      row('Pasta', 'title', 0.9),
      row('200 g spaghetti', 'ingredient', 0.85),
      row('2 tins tomatoes', 'ingredient', 0.8),
      row('1 tbsp oil', 'ingredient', 0.8),
      row('Heat the pan.', 'instruction', 0.75),
    ];
    const draft = draftFromClassifiedLines(results);
    const out = assessPrepassDraft(draft, results);
    expect(out.accept).toBe(true);
    expect(out.reasons).toEqual([]);
    expect(out.measurements.totalLines).toBe(5);
  });

  it('refuses without a confident title', () => {
    const results = [
      row('200 g flour', 'ingredient'),
      row('100 g butter', 'ingredient'),
      row('My weeknight pasta', 'title', 0.62, 'classifier'),
    ];
    const draft = draftFromClassifiedLines(results);
    expect(draft).not.toBeNull(); // assembly is lenient; the gate is not
    const out = assessPrepassDraft(draft, results);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('no-confident-title');
  });

  it('refuses too few ingredients', () => {
    const results = [row('Soup', 'title', 0.9), row('200 g tomatoes', 'ingredient', 0.85)];
    const out = assessPrepassDraft(draftFromClassifiedLines(results), results);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('too-few-ingredients');
  });

  it('refuses when the count exists but the confidence does not', () => {
    const results = [
      row('Weak soup', 'title', 0.9),
      row('200 g tomatoes', 'ingredient', 0.85),
      row('mystery powder', 'ingredient', 0.65, 'classifier'),
      row('secret spice', 'ingredient', 0.62, 'classifier'),
    ];
    const draft = draftFromClassifiedLines(results);
    expect(draft.ingredients).toHaveLength(3);
    const out = assessPrepassDraft(draft, results);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('weak-ingredient-confidence');
  });

  it('refuses when method-like content left no instruction evidence', () => {
    const results = [
      row('Slow soup', 'title', 0.9),
      row('400 g tomatoes', 'ingredient', 0.85),
      row('1 onion', 'ingredient', 0.8),
      row('Let it bake until golden then serve', 'other', 0, 'fallback'),
    ];
    const draft = draftFromClassifiedLines(results);
    expect(draft.steps).toEqual([]);
    const out = assessPrepassDraft(draft, results);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('missing-instruction-evidence');
  });

  it('does not demand instructions when nothing method-like exists', () => {
    const results = [
      row('Scones', 'title', 0.9),
      row('500 g flour', 'ingredient', 0.85),
      row('300 ml milk', 'ingredient', 0.85),
    ];
    const out = assessPrepassDraft(draftFromClassifiedLines(results), results);
    expect(out.accept).toBe(true);
  });

  it('refuses a low classified rate', () => {
    const results = [
      row('Omelette', 'title', 0.9),
      row('2 eggs', 'ingredient', 0.8),
      row('1 knob butter', 'ingredient', 0.8),
      row('some text here', 'other', 0, 'fallback'),
      row('blorp blorp', 'other', 0, 'fallback'),
      row('whatever this is', 'other', 0, 'fallback'),
      row('and more prose', 'other', 0, 'fallback'),
    ];
    const draft = draftFromClassifiedLines(results);
    const out = assessPrepassDraft(draft, results);
    expect(out.measurements.classifiedRate).toBeLessThan(DEFAULT_PREPASS_GATE.minClassifiedRate);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('low-classified-rate');
  });

  it('refuses a high other rate', () => {
    const results = [
      row('Omelette', 'title', 0.9),
      row('2 eggs', 'ingredient', 0.8),
      row('1 knob butter', 'ingredient', 0.8),
      row('some text here', 'other', 0, 'fallback'),
      row('blorp blorp', 'other', 0, 'fallback'),
      row('whatever this is', 'other', 0, 'fallback'),
    ];
    const draft = draftFromClassifiedLines(results);
    const out = assessPrepassDraft(draft, results);
    expect(out.measurements.otherRate).toBeGreaterThan(DEFAULT_PREPASS_GATE.maxOtherRate);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('high-other-rate');
  });

  it('refuses a high fallback rate even when every line carries a label', () => {
    // Below-floor deterministic answers keep their label but are marked
    // fallback — three of them means the source is mostly unresolved.
    const results = [
      row('Pasta', 'title', 0.9),
      row('200 g spaghetti', 'ingredient', 0.85),
      row('100 g cheese', 'ingredient', 0.85),
      row('a pinch of this', 'ingredient', 0.55, 'fallback'),
      row('a dash of that', 'ingredient', 0.5, 'fallback'),
      row('something else', 'ingredient', 0.55, 'fallback'),
    ];
    const draft = draftFromClassifiedLines(results);
    expect(draft.ingredients).toHaveLength(5);
    const out = assessPrepassDraft(draft, results);
    expect(out.measurements.otherRate).toBe(0);
    expect(out.measurements.fallbackRate).toBeGreaterThan(DEFAULT_PREPASS_GATE.maxFallbackRate);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('high-fallback-rate');
    expect(out.reasons).not.toContain('high-other-rate');
  });

  it('refuses dangling quantities — a bare number with no food word', () => {
    const results = [
      row('Leftover numbers', 'title', 0.9),
      row('200 g flour', 'ingredient', 0.85),
      row('100 g sugar', 'ingredient', 0.85),
      row('2', 'quantity', 0.85),
      row('3', 'quantity', 0.85),
    ];
    const draft = draftFromClassifiedLines(results);
    expect(draft.ingredients).toHaveLength(2);
    const out = assessPrepassDraft(draft, results);
    expect(out.measurements.danglingQuantities).toBe(2);
    expect(out.accept).toBe(false);
    expect(out.reasons).toContain('dangling-quantities');
  });

  it('does not punish merged quantities — "500 g" + flour is one ingredient', () => {
    const results = [
      row('Scones', 'title', 0.9),
      row('500 g', 'quantity', 0.85),
      row('self-raising flour', 'ingredient', 0.8),
      row('300 ml', 'quantity', 0.85),
      row('milk', 'ingredient', 0.8),
    ];
    const draft = draftFromClassifiedLines(results);
    const out = assessPrepassDraft(draft, results);
    expect(out.measurements.danglingQuantities).toBe(0);
    expect(out.accept).toBe(true);
  });

  it('reports coverage measurements and thin-but-accepted drafts as incomplete', () => {
    const results = [
      row('Scones', 'title', 0.9),
      row('500 g flour', 'ingredient', 0.85),
      row('300 ml milk', 'ingredient', 0.85),
    ];
    const out = assessPrepassDraft(draftFromClassifiedLines(results), results);
    expect(out.accept).toBe(true);
    expect(out.measurements.ingredientCoverage).toBeCloseTo(2 / 3, 3);
    expect(out.measurements.instructionCoverage).toBe(0);
    expect(out.measurements.incomplete).toBe(true); // no steps, two ingredients
  });

  it('a stricter gate rejects what the default accepts', () => {
    const results = [
      row('Pasta', 'title', 0.9),
      row('200 g spaghetti', 'ingredient', 0.85),
      row('100 g cheese', 'ingredient', 0.85),
      row('Heat the pan.', 'instruction', 0.75),
    ];
    const draft = draftFromClassifiedLines(results);
    expect(assessPrepassDraft(draft, results).accept).toBe(true);
    expect(assessPrepassDraft(draft, results, { ...DEFAULT_PREPASS_GATE, minIngredients: 5 }).accept).toBe(false);
  });
});

describe('classifyRecipeLines with the gate', () => {
  it('accepts imperial units, leading counts and a real method', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'Grandma beef stew',
      'Serves 6',
      '2 lb beef chuck',
      '3 carrots',
      '1 onion, diced',
      'Simmer gently for 2 hours.',
    ].join('\n'));
    expect(out.draft).toMatchObject({
      title: 'Grandma beef stew',
      servings: 6,
      ingredients: expect.arrayContaining(['2 lb beef chuck', '3 carrots', '1 onion, diced']),
      steps: ['Simmer gently for 2 hours.'],
    });
    expect(out.assessment.accept).toBe(true);
    expect(typeof out.latencyMs).toBe('number');
    expect(classifierTelemetry().prepassAccepted).toBe(1);
  });

  it('declines bare quantities with no food words — a model call, not a dropped recipe', async () => {
    // "400 g" of what? A quantity that never merges into an ingredient is a
    // pairing the source never explained. (Single characters never reach the
    // rules at all — the adapter short-circuits them to `other` first.)
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines(['Mystery quantities', '400 g', '200 ml', '2 tbsp'].join('\n'));
    expect(out.results.map((r) => r.label)).toEqual(['title', 'quantity', 'quantity', 'quantity']);
    expect(out.draft).toBeNull();
    expect(out.assessment.measurements.danglingQuantities).toBe(3);
    expect(out.assessment.reasons).toContain('dangling-quantities');
    expect(classifierTelemetry().prepassDeclined).toBe(1);
  });

  it('declines method-like fallback lines with no recovered steps', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'Slow soup',
      '400 g tomatoes',
      '1 onion',
      'Let it bake until golden then serve',
    ].join('\n'));
    expect(out.draft).toBeNull();
    expect(out.assessment.reasons).toContain('missing-instruction-evidence');
  });

  it('declines servings-and-time with no ingredients', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'Weeknight dinner',
      'Serves 4',
      'Ready in 30 minutes',
      'Heat the oven to 200C.',
    ].join('\n'));
    expect(out.draft).toBeNull();
    expect(out.assessment.reasons).toContain('too-few-ingredients');
  });

  it('declines health-only prose without grading it', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'Heart healthy low sodium',
      'Gluten free and diabetic friendly',
      'No allergens in this one',
    ].join('\n'));
    expect(out.draft).toBeNull();
  });

  it('declines a weak remote title even when the ingredients arrived', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      results: [{ label: 'title', confidence: 0.62 }],
    }));
    const out = await classifyRecipeLines('200 g flour\n100 g butter\nMy weeknight pasta', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The assembly would accept this (a title plus two ingredients), but the
    // gate declines it — and the route reads the gated draft, so the caller
    // falls back to the extraction model.
    expect(out.results.find((r) => r.label === 'title')).toMatchObject({ source: 'classifier' });
    expect(out.draft).toBeNull();
    expect(out.assessment.accept).toBe(false);
    expect(out.assessment.reasons).toContain('no-confident-title');
  });

  it('declines weak remote ingredient confidence', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      results: [
        { label: 'ingredient', confidence: 0.65 },
        { label: 'ingredient', confidence: 0.62 },
      ],
    }));
    const out = await classifyRecipeLines('Weak soup\n200 g tomatoes\nmystery powder\nsecret spice', { fetchImpl });
    expect(out.results.filter((r) => r.label === 'ingredient')).toHaveLength(3);
    expect(out.draft).toBeNull();
    expect(out.assessment.reasons).toContain('weak-ingredient-confidence');
  });

  it('still accepts chrome around a real recipe — noise is dropped, not punished', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'Speedy noodles',
      'Serves 2',
      '200 g noodles',
      '1 tbsp soy sauce',
      'Toss everything in a hot wok.',
    ].join('\n'));
    expect(out.draft).toMatchObject({ title: 'Speedy noodles', servings: 2 });
    expect(out.draft.ingredients).toHaveLength(2);
    expect(out.assessment.accept).toBe(true);
  });
});

describe('adapter hardening used by the prepass', () => {
  it('counts a short row list as a mismatch and falls the tail back', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      results: [{ label: 'ingredient', confidence: 0.9 }],
    }));
    const out = await classifyRecipeLines('Short rows\n200 g flour\nmystery one\nmystery two', { fetchImpl });
    expect(out.results).toHaveLength(4);
    expect(out.results.at(-1)).toMatchObject({ label: 'other', source: 'fallback' });
    expect(classifierTelemetry().rowCountMismatches).toBe(1);
  });

  it('rejects non-object rows instead of reading labels off them', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: ['ingredient'] }));
    const out = await classifyRecipeLines('Ragged rows\n200 g flour\n100 g butter\nmystery bit', { fetchImpl });
    expect(out.results.at(-1)).toMatchObject({ label: 'other', source: 'fallback' });
    expect(classifierTelemetry().unknownLabelDiscards).toBe(1);
  });

  it('notePrepassOutcome counts accepts, declines and stable reason codes only', () => {
    notePrepassOutcome(true);
    notePrepassOutcome(false, ['too-few-ingredients', 'bogus-reason-xyz']);
    notePrepassOutcome(false, 'high-other-rate');
    const telemetry = classifierTelemetry();
    expect(telemetry.prepassAccepted).toBe(1);
    expect(telemetry.prepassDeclined).toBe(2);
    expect(telemetry.prepassDeclineReasons).toEqual({ 'too-few-ingredients': 1, 'high-other-rate': 1 });
  });
});

describe('hard boundary: the line taxonomy never grades health', () => {
  it('carries no allergy, medical, safety or diet-judgement labels', () => {
    for (const label of taxonomyLabels('recipe-line')) {
      expect(isLabel('recipe-line', label)).toBe(true);
    }
    for (const forbidden of ['allergen', 'allergy', 'safe', 'unsafe', 'healthy', 'unhealthy', 'medical', 'diagnosis', 'low-fat', 'gluten-free']) {
      expect(isLabel('recipe-line', forbidden)).toBe(false);
    }
  });

  it('health prose is other, never an ingredient, and never a bypass', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyRecipeLines([
      'Healthy dinner idea',
      'Contains nuts and dairy',
      'Low fat and gluten free',
      '200 g chicken',
      '100 g rice',
    ].join('\n'));
    const health = out.results.find((r) => r.item === 'Contains nuts and dairy');
    expect(health.label).toBe('other');
    // The health lines are dropped from the draft rather than acted on.
    expect(out.draft.ingredients).not.toContain('Contains nuts and dairy');
  });
});
