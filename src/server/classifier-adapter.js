/**
 * The classifier.dev adapter: batching, caching, thresholds, fallback, telemetry.
 *
 * classifier.dev is zero-shot text classification over plain HTTP — no key for
 * the free tier, up to a thousand inputs per request, and a calibrated
 * confidence. It sits *between* the deterministic rules (see
 * classify-deterministic.js) and the general LLM: it answers the cheap labelling
 * work a chat model is wasteful for, and it is never the authority on anything
 * that matters — allergies, medical nutrition, food safety and health
 * interpretation are routed straight to the assistant and never here.
 *
 * The contract, in order of precedence:
 *
 *   1. cache      — same text, same taxonomy, same answer, for the TTL.
 *   2. rules      — a confident deterministic answer is never sent anywhere.
 *   3. classifier — everything unresolved goes in ONE batched request.
 *   4. fallback   — unconfigured, unreachable, low-confidence, out-of-taxonomy
 *                    or malformed answers degrade to `other`, never an error.
 *
 * Every resolution is counted, and every count of a resolution that would
 * otherwise have been a chat completion is added to `llmCallsAvoided` — the
 * measurement of what this layer actually saves.
 */

import { createHash } from 'node:crypto';
import { FALLBACK_LABELS, isLabel, isTaxonomy, taxonomyLabels } from './classify-taxonomies.js';

const DEFAULT_BASE = 'https://classifier.dev/v1/classify';
const DEFAULT_FLOOR = 0.6;
const DEFAULT_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;
/** One request, one round trip: classifier.dev takes 1,000 inputs a call. */
export const MAX_BATCH = 500;
export const MAX_ITEM_LENGTH = 300;

export const confidenceFloor = () => {
  const configured = Number(process.env.CLASSIFIER_CONFIDENCE_FLOOR);
  return Number.isFinite(configured) && configured >= 0 && configured <= 1
    ? configured : DEFAULT_FLOOR;
};

const adapterTimeoutMs = () => {
  const configured = Number(process.env.CLASSIFIER_TIMEOUT_MS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
};

/** classifier.dev needs no key; a Pro key is honoured when a deployment has one. */
export const classifierConfigured = () =>
  process.env.CLASSIFIER_DISABLED !== 'true' && process.env.CLASSIFIER_API_URL !== '';

/* ---------- Cache and telemetry ---------- */

const cache = new Map();
const cacheKey = (taxonomy, text) =>
  createHash('sha256').update(`${taxonomy}\u0000${text.trim().toLowerCase()}`).digest('hex');

const cacheGet = (key, now) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return hit;
};

const cachePut = (key, result, now) => {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Oldest first — insertion order is a Map guarantee.
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { ...result, expiresAt: now + CACHE_TTL_MS });
};

export const clearClassifierCache = () => cache.clear();

let telemetry = freshTelemetry();

function freshTelemetry() {
  return {
    requests: 0,             // classifyBatch calls
    remoteCalls: 0,          // HTTP calls to classifier.dev
    batchedItems: 0,         // items actually sent in one
    cacheHits: 0,
    deterministicHits: 0,
    classifierHits: 0,       // accepted remote labels
    lowConfidenceDiscards: 0,
    unknownLabelDiscards: 0,
    remoteFailures: 0,
    fallbacks: 0,            // items that ended on `other`/unknown
    llmCallsAvoided: 0,      // items/requests resolved without a general LLM
    avoidedBy: { cache: 0, deterministic: 0, classifier: 0, routing: 0 },
  };
}

export const classifierTelemetry = () => ({
  ...telemetry,
  avoidedBy: { ...telemetry.avoidedBy },
  confidenceFloor: confidenceFloor(),
  cacheSize: cache.size,
});

export const resetClassifierTelemetry = () => {
  telemetry = freshTelemetry();
};

/**
 * Record a general LLM call that did not happen. The adapter counts resolved
 * items; route-level avoidance (a request answered by rules alone) calls this
 * directly, so the number is one currency across every caller.
 */
export const noteLlmCallsAvoided = (count = 1, via = 'routing') => {
  const n = Math.max(0, Math.min(1000000, Number(count) || 0));
  telemetry.llmCallsAvoided += n;
  if (telemetry.avoidedBy[via] !== undefined) telemetry.avoidedBy[via] += n;
};

/* ---------- The adapter ---------- */

/**
 * Classify a batch of items.
 *
 * `deterministic(item)` optionally answers an item locally: return
 * `{ label, confidence }` or null. Confident answers never leave the process.
 *
 * Each result is `{ item, label, confidence, source, reason? }` where source is
 * `cache` | `deterministic` | `classifier` | `fallback`. Never throws on a
 * failing classifier: that costs a batch of fallback labels, not the request.
 */
export async function classifyBatch(taxonomyId, items, {
  deterministic = null, fetchImpl = fetch, signal, timeoutMs,
} = {}) {
  if (!isTaxonomy(taxonomyId)) throw new Error(`unknown-taxonomy:${taxonomyId}`);
  if (signal?.aborted) throw abortError(signal);
  telemetry.requests += 1;

  const list = (Array.isArray(items) ? items : [items]).map((item) => String(item ?? ''));
  const now = Date.now();
  const floor = confidenceFloor();
  const results = new Array(list.length);
  const unresolved = [];

  for (let index = 0; index < list.length; index += 1) {
    const item = list[index].slice(0, MAX_ITEM_LENGTH).trim();
    if (item.length < 2) {
      results[index] = {
        item: list[index], label: FALLBACK_LABELS[taxonomyId], confidence: 0,
        source: 'fallback', reason: 'empty',
      };
      telemetry.fallbacks += 1;
      continue;
    }
    const key = cacheKey(taxonomyId, item);
    const cached = cacheGet(key, now);
    if (cached) {
      const { expiresAt, ...stored } = cached;
      results[index] = { item, ...stored, source: 'cache' };
      telemetry.cacheHits += 1;
      noteLlmCallsAvoided(1, 'cache');
      continue;
    }
    const local = deterministic?.(item) || null;
    if (local && isLabel(taxonomyId, local.label) && local.confidence >= floor) {
      results[index] = { item, label: local.label, confidence: local.confidence, source: 'deterministic' };
      cachePut(key, { label: local.label, confidence: local.confidence }, now);
      telemetry.deterministicHits += 1;
      noteLlmCallsAvoided(1, 'deterministic');
      continue;
    }
    unresolved.push({ index, item, key, local });
  }

  if (unresolved.length) {
    const answered = await classifyRemote(taxonomyId, unresolved, {
      fetchImpl, signal, timeoutMs: timeoutMs ?? adapterTimeoutMs(), floor,
    });
    for (const entry of answered) {
      results[entry.index] = { item: entry.item, ...entry.result };
      if (entry.result.source === 'classifier') {
        cachePut(entry.key, { label: entry.result.label, confidence: entry.result.confidence }, Date.now());
      }
    }
  }

  return results;
}


/** One HTTP call for the whole unresolved batch, read leniently. */
async function classifyRemote(taxonomyId, unresolved, { fetchImpl, signal, timeoutMs, floor }) {
  if (!classifierConfigured()) {
    telemetry.fallbacks += unresolved.length;
    return unresolved.map((entry) => ({
      ...entry, result: fallbackResult(taxonomyId, entry, 'classifier-not-configured', entry.local),
    }));
  }
  // Over the batch cap the tail still gets an answer — deterministically
  // conservative — rather than the request failing for having too much to say.
  const batch = unresolved.slice(0, MAX_BATCH);
  const overflow = unresolved.slice(MAX_BATCH);
  telemetry.fallbacks += overflow.length;
  const overflowResults = overflow.map((entry) => ({
    ...entry, result: fallbackResult(taxonomyId, entry, 'batch-too-large', entry.local),
  }));

  telemetry.remoteCalls += 1;
  telemetry.batchedItems += batch.length;
  try {
    const url = process.env.CLASSIFIER_API_URL || DEFAULT_BASE;
    const body = JSON.stringify({
      inputs: batch.map((entry) => entry.item),
      labels: taxonomyLabels(taxonomyId),
      ...(process.env.CLASSIFIER_TIER ? { tier: process.env.CLASSIFIER_TIER } : {}),
    });
    const headers = { 'content-type': 'application/json' };
    if (process.env.CLASSIFIER_API_KEY) headers.authorization = `Bearer ${process.env.CLASSIFIER_API_KEY}`;
    const res = await raceClassifier(
      () => fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      }),
      signal,
    );
    if (!res.ok) {
      // 429 with Retry-After is the known shape of "try again soon"; every
      // other status means the same thing for the caller: not confident.
      telemetry.remoteFailures += 1;
      telemetry.fallbacks += batch.length;
      return [
        ...batch.map((entry) => ({
          ...entry, result: fallbackResult(taxonomyId, entry, `remote-${res.status}`, entry.local),
        })),
        ...overflowResults,
      ];
    }
    const data = await raceClassifier(() => res.json(), signal);
    const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : null;
    if (!rows) throw new Error('malformed-classifier-response');

    const remote = batch.map((entry, i) => {
      const row = rows[i] || {};
      const label = row.label ?? row.class ?? row.category;
      const confidence = Number(row.confidence);
      if (!isLabel(taxonomyId, label)) {
        telemetry.unknownLabelDiscards += 1;
        telemetry.fallbacks += 1;
        return { ...entry, result: fallbackResult(taxonomyId, entry, 'unknown-label', entry.local) };
      }
      if (!Number.isFinite(confidence) || confidence < floor) {
        telemetry.lowConfidenceDiscards += 1;
        telemetry.fallbacks += 1;
        return { ...entry, result: fallbackResult(taxonomyId, entry, 'low-confidence', entry.local) };
      }
      telemetry.classifierHits += 1;
      noteLlmCallsAvoided(1, 'classifier');
      return { ...entry, result: { item: entry.item, label, confidence, source: 'classifier' } };
    });
    return [...remote, ...overflowResults];
  } catch (error) {
    // The caller's own abort is their answer, not the classifier failing.
    if (error?.name === 'AbortError' && signal?.aborted) throw error;
    telemetry.remoteFailures += 1;
    telemetry.fallbacks += batch.length;
    return [
      ...batch.map((entry) => ({
        ...entry, result: fallbackResult(taxonomyId, entry, 'remote-error', entry.local),
      })),
      ...overflowResults,
    ];
  }
}

const fallbackResult = (taxonomyId, entry, reason, local = null) => {
  // A rule that answered below the floor is still better evidence than nothing,
  // but it is marked for what it is: a fallback, not a verified label.
  if (local && isLabel(taxonomyId, local.label)) {
    return {
      item: entry.item, label: local.label, confidence: local.confidence,
      source: 'fallback', reason,
    };
  }
  return { item: entry.item, label: FALLBACK_LABELS[taxonomyId], confidence: 0, source: 'fallback', reason };
};

/** A timeout that also honours the caller's abort, one way or the other. */
async function raceClassifier(promiseFactory, signal) {
  if (signal?.aborted) throw abortError(signal);
  const work = promiseFactory();
  if (!signal) return work;
  return Promise.race([
    work,
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(abortError(signal)), { once: true })),
  ]);
}

const abortError = (signal) => {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
};

