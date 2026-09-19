import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifierConfigured, classifierTelemetry, classifyBatch, clearClassifierCache,
  confidenceFloor, MAX_BATCH, noteLlmCallsAvoided, resetClassifierTelemetry,
} from '../src/server/classifier-adapter.js';
import { PRODUCT_TAXONOMY } from '../src/server/classify-taxonomies.js';

/**
 * The adapter's contract, label by label:
 *   cache → rules → one batched classifier call → fallback.
 * And the measurement: every answer that did not need a general LLM is counted.
 */

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

const reset = () => {
  vi.unstubAllEnvs();
  clearClassifierCache();
  resetClassifierTelemetry();
};

beforeEach(reset);

describe('classifier-adapter: configuration', () => {
  it('is on by default and needs no key — classifier.dev is free and keyless', () => {
    expect(classifierConfigured()).toBe(true);
  });

  it('treats an explicitly empty URL as off, like any other provider toggle', () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    expect(classifierConfigured()).toBe(false);
  });

  it('honours an explicit disable and a confidence floor from the environment', () => {
    vi.stubEnv('CLASSIFIER_DISABLED', 'true');
    vi.stubEnv('CLASSIFIER_CONFIDENCE_FLOOR', '0.9');
    expect(classifierConfigured()).toBe(false);
    expect(confidenceFloor()).toBe(0.9);
  });

  it('keeps the default floor of 0.6 when nothing is configured', () => {
    expect(confidenceFloor()).toBe(0.6);
  });
});

describe('classifier-adapter: batching', () => {
  it('sends one batched request for the unresolved batch, never one per item', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      results: ['pantry', 'drinks', 'dairy', 'produce', 'household'].map((label) => ({ label, confidence: 0.9 })),
    }));
    const out = await classifyBatch('product', [
      'tinned tomatoes', 'orange juice', 'semi-skimmed milk', 'bananas', 'bin bags',
    ], { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.inputs).toHaveLength(5);
    expect(body.labels).toEqual(PRODUCT_TAXONOMY);
    expect(out.map((row) => row.label)).toEqual(['pantry', 'drinks', 'dairy', 'produce', 'household']);
    expect(out.every((row) => row.source === 'classifier')).toBe(true);
  });

  it('confident deterministic answers never leave the process', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', ''); // nothing may leave, so a call would fail loudly
    const fetchImpl = vi.fn();
    const out = await classifyBatch('product', ['bananas', 'mystery thing'], {
      fetchImpl,
      deterministic: (item) => (item === 'bananas' ? { label: 'produce', confidence: 0.85 } : null),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ label: 'produce', source: 'deterministic' });
    // The unmatchable one still gets an honest answer, not an error.
    expect(out[1]).toMatchObject({ label: 'other', source: 'fallback', reason: 'classifier-not-configured' });
  });

  it('sends only what the rules could not place', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'dairy', confidence: 0.8 }] }));
    await classifyBatch('product', ['bananas', 'some unnameable thing'], {
      fetchImpl,
      deterministic: (item) => (item === 'bananas' ? { label: 'produce', confidence: 0.85 } : null),
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.inputs).toEqual(['some unnameable thing']);
  });

  it('answers a batch larger than the cap without failing the tail', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [] }));
    const items = Array.from({ length: MAX_BATCH + 5 }, (_, i) => `item number ${i}`);
    const out = await classifyBatch('product', items, { fetchImpl });
    expect(out).toHaveLength(MAX_BATCH + 5);
    expect(out.slice(-5).every((row) => row.reason === 'batch-too-large')).toBe(true);
  });
});
describe('classifier-adapter: caching', () => {
  it('answers a repeated item from the cache without a second remote call', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'produce', confidence: 0.9 }] }));
    const first = await classifyBatch('product', ['bananas'], { fetchImpl });
    const second = await classifyBatch('product', ['bananas'], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second[0]).toMatchObject({ label: 'produce', source: 'cache', confidence: 0.9 });
    expect(first[0].label).toBe(second[0].label);
  });

  it('caches per taxonomy: the same text under a different taxonomy is not a cache hit', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'other', confidence: 0.9 }] }));
    await classifyBatch('product', ['lemon drizzle'], { fetchImpl });
    await classifyBatch('recipe-meal', ['lemon drizzle'], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('also caches deterministic answers, so a rule is evaluated once', async () => {
    const fetchImpl = vi.fn();
    const rules = (item) => (item === 'bananas' ? { label: 'produce', confidence: 0.85 } : null);
    await classifyBatch('product', ['bananas'], { fetchImpl, deterministic: rules });
    vi.stubEnv('CLASSIFIER_API_URL', ''); // a remote call now would fail loudly
    const again = await classifyBatch('product', ['bananas'], { fetchImpl, deterministic: rules });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(again[0].source).toBe('cache');
  });
});

describe('classifier-adapter: confidence thresholds and other/unknown', () => {
  it('discards a remote label below the floor and falls back to other', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'produce', confidence: 0.4 }] }));
    const out = await classifyBatch('product', ['mystery fruit'], { fetchImpl });
    expect(out[0]).toMatchObject({ label: 'other', source: 'fallback', reason: 'low-confidence', confidence: 0 });
    expect(classifierTelemetry().lowConfidenceDiscards).toBe(1);
  });

  it('discards a label outside the taxonomy, whatever its confidence', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'definitely-a-vegetable', confidence: 0.99 }] }));
    const out = await classifyBatch('product', ['mystery fruit'], { fetchImpl });
    expect(out[0].label).toBe('other');
    expect(out[0].source).toBe('fallback');
    expect(classifierTelemetry().unknownLabelDiscards).toBe(1);
  });

  it('keeps a below-floor rule answer as a marked fallback, not a verified label', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const out = await classifyBatch('product', ['curious condiment'], {
      fetchImpl: vi.fn(),
      deterministic: () => ({ label: 'pantry', confidence: 0.4 }),
    });
    expect(out[0]).toMatchObject({ label: 'pantry', source: 'fallback', reason: 'classifier-not-configured' });
  });

  it('never lets a malformed remote response become an error', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ hello: 'world' }));
    const out = await classifyBatch('product', ['mystery fruit'], { fetchImpl });
    expect(out[0]).toMatchObject({ label: 'other', source: 'fallback' });
    expect(classifierTelemetry().remoteFailures).toBe(1);
  });
});
describe('classifier-adapter: graceful fallback', () => {
  it('degrades to fallback labels when the classifier is unreachable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); });
    const out = await classifyBatch('product', ['mystery fruit', 'another mystery'], { fetchImpl });
    expect(out.map((row) => row.label)).toEqual(['other', 'other']);
    expect(out.every((row) => row.source === 'fallback')).toBe(true);
    expect(classifierTelemetry().remoteFailures).toBe(1);
  });

  it('degrades on a non-200 response, counting the reason', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({}, 429));
    const out = await classifyBatch('recipe-meal', ['some dish'], { fetchImpl });
    expect(out[0]).toMatchObject({ label: 'other', source: 'fallback', reason: 'remote-429' });
  });

  it('answers instantly with fallbacks when the adapter is disabled', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', '');
    const fetchImpl = vi.fn();
    const out = await classifyBatch('product', ['anything at all'], { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ label: 'other', source: 'fallback' });
  });

  it('treats a caller abort as the caller answer, not a classifier failure', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(classifyBatch('product', ['mystery fruit'], { fetchImpl: vi.fn(), signal: controller.signal }))
      .rejects.toThrow();
  });

  it('refuses an unknown taxonomy loudly, before any call', async () => {
    await expect(classifyBatch('medical-advice', ['anything'], { fetchImpl: vi.fn() }))
      .rejects.toThrow('unknown-taxonomy');
  });
});

describe('classifier-adapter: telemetry and the measurement of avoided LLM calls', () => {
  it('counts every resolution that did not need a general LLM call', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'dairy', confidence: 0.9 }] }));
    await classifyBatch('product', ['bananas', 'greek yogurt', 'mystery thing'], {
      fetchImpl,
      deterministic: (item) => (item === 'bananas' ? { label: 'produce', confidence: 0.85 } : null),
    });
    const telemetry = classifierTelemetry();
    expect(telemetry.llmCallsAvoided).toBe(2); // the rule hit + the classifier hit
    expect(telemetry.avoidedBy).toMatchObject({ deterministic: 1, classifier: 1 });
    expect(telemetry.fallbacks).toBe(1); // the unresolved one is not claimed as avoided
  });

  it('separates cache hits into their own avoided bucket', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ results: [{ label: 'produce', confidence: 0.9 }] }));
    await classifyBatch('product', ['bananas'], { fetchImpl });
    await classifyBatch('product', ['bananas'], { fetchImpl });
    expect(classifierTelemetry().avoidedBy.cache).toBe(1);
  });

  it('records route-level avoidance through noteLlmCallsAvoided', () => {
    noteLlmCallsAvoided(3, 'routing');
    noteLlmCallsAvoided(1, 'routing');
    const telemetry = classifierTelemetry();
    expect(telemetry.llmCallsAvoided).toBe(4);
    expect(telemetry.avoidedBy.routing).toBe(4);
  });

  it('reports the batch shape: one remote call covering every batched item', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      results: Array.from({ length: 6 }, () => ({ label: 'pantry', confidence: 0.8 })),
    }));
    await classifyBatch('product', ['a', 'b', 'c', 'd', 'e', 'f'].map((p) => `thing ${p} of six`), { fetchImpl });
    const telemetry = classifierTelemetry();
    expect(telemetry.remoteCalls).toBe(1);
    expect(telemetry.batchedItems).toBe(6);
    expect(telemetry.classifierHits).toBe(6);
  });
});