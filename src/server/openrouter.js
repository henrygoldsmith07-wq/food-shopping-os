/**
 * Free-tier AI providers: NVIDIA NIM first, OpenRouter second.
 *
 * Both expose OpenAI-compatible catalogs. Chat model selection is ranked by
 * capability (Nemotron Ultra → DeepSeek V4 Pro → GLM → Kimi → … → Laguna),
 * excludes non-chat endpoints (embeddings, rerankers, TTS, safety classifiers)
 * and fails over down the ranking one model at a time, so a rate-limited or
 * withdrawn model costs a retry rather than the feature. Free/unmetered
 * providers bypass the household AI budget.
 *
 * `freeVision` is the same failover over the subset of the catalog that can
 * actually read an image. Where none can, it says so rather than sending the
 * picture to a text model and returning whatever that hallucinates.
 */

import { raceAbort, racedFetch, abortError } from './abort-race.js';

/**
 * Capability order: position = preference. Every token must appear in the id.
 *
 * The named ten are the ladder we were asked for, strongest first. The tail
 * below them is deliberately generic: NVIDIA rotates its free catalog, so when
 * none of the ten are being served the ranking still has something to walk
 * down rather than falling back to alphabetical order.
 */
const CHAT_MODEL_ORDER = [
  { name: 'Nemotron 3 Ultra 550B', tokens: ['nemotron', 'ultra'] },
  { name: 'DeepSeek V4 Pro', tokens: ['deepseek', 'v4', 'pro'] },
  { name: 'GLM-5.2', tokens: ['glm', '5.2'] },
  { name: 'Kimi K2.6', tokens: ['kimi', 'k2.6'] },
  { name: 'DeepSeek V4 Flash', tokens: ['deepseek', 'v4', 'flash'] },
  { name: 'MiniMax M3', tokens: ['minimax', 'm3'] },
  { name: 'Nemotron 3.5 Lightning', tokens: ['nemotron', 'lightning'] },
  { name: 'Mistral Medium 3.5', tokens: ['mistral', 'medium'] },
  { name: 'GPT-OSS-120B', tokens: ['gpt-oss'] },
  { name: 'Poolside Laguna', tokens: ['laguna'] },
  // Generic tail — catalog drift, not a preference in its own right.
  { name: 'DeepSeek (any)', tokens: ['deepseek'] },
  { name: 'GLM (any)', tokens: ['glm'] },
  { name: 'Kimi (any)', tokens: ['kimi'] },
  { name: 'Lightning (any)', tokens: ['lightning'] },
  { name: 'Super (non-nano)', tokens: ['super'] },
  { name: 'Gemma large', tokens: ['gemma'] },
  { name: '70B class', tokens: ['70b'] },
  { name: '30B MoE', tokens: ['30b'] },
  { name: '12B VL', tokens: ['12b'] },
  { name: '9B', tokens: ['9b'] },
  { name: 'LFM', tokens: ['lfm'] },
  { name: 'Inkling', tokens: ['inkling'] },
];

/** Endpoint-only models that can never serve chat completions. */
const NON_CHAT_TOKENS = ['embed', 'rerank', 'tts', 'safety', 'moderation', 'whisper', 'guard'];

const CATALOG_TTL_MS = 10 * 60 * 1000;
let cachedRanking = null;
let cachedAt = 0;
// The cache belongs to the provider it was built from: swap the key or the
// base URL and last provider's catalog is not an answer about this one.
let cachedFor = '';

/**
 * Shipped NVIDIA key, used when the environment sets none.
 *
 * Embedded at the repo owner's explicit instruction: the key is free, carries
 * no billing, and shipping it means the app works with no setup. Anyone
 * self-hosting should still set NVIDIA_API_KEY, which always wins over this —
 * a key in a public repo is one anybody can spend the rate limit on, and it
 * cannot be rotated without a release.
 */
const BUNDLED_NVIDIA_KEY = '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';

/**
 * The NVIDIA key in force: environment first, bundled key as the fallback.
 *
 * Setting NVIDIA_API_KEY to an empty string is honoured as "no NVIDIA" rather
 * than falling back to the bundled key, so a deployment can turn the shipped
 * credential off without editing source.
 */
export const nvidiaKey = () => {
  const configured = process.env.NVIDIA_API_KEY;
  return configured === undefined || configured === null ? BUNDLED_NVIDIA_KEY : configured;
};

export const activeProvider = () => {
  const nvidia = nvidiaKey();
  if (nvidia) {
    return {
      id: 'nvidia',
      base: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
      key: nvidia,
      suffix: null,
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      id: 'openrouter',
      base: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
      key: process.env.OPENROUTER_API_KEY,
      suffix: ':free',
    };
  }
  return null;
};

export const isOpenRouterConfigured = () => Boolean(activeProvider());

/** The ranked ladder, for diagnostics and the backend status panel. */
export const modelLadder = () => CHAT_MODEL_ORDER.map((entry) => entry.name);

const matchScore = (id) => {
  const lower = id.toLowerCase();
  let best = Infinity;
  CHAT_MODEL_ORDER.forEach((entry, position) => {
    if (entry.tokens.every((t) => lower.includes(t))) best = Math.min(best, position);
  });
  return best;
};

/** Free/chat-capable models, strongest first, for the active provider. */
export async function rankedFreeModels(fetchImpl = fetch, options = {}) {
  const provider = activeProvider();
  if (!provider) return [];
  const key = `${provider.id}:${provider.base}`;
  if (cachedRanking && cachedFor === key && Date.now() - cachedAt < CATALOG_TTL_MS) return cachedRanking;
  try {
    const res = await racedFetch(fetchImpl, `${provider.base}/models`, {
      headers: { authorization: `Bearer ${provider.key}` },
    }, { signal: options?.signal, timeoutMs: options?.timeoutMs ?? 15000 });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const body = await res.json();
    let ids = (body?.data || []).map((m) => m.id).filter((id) => typeof id === 'string');
    if (provider.suffix) ids = ids.filter((id) => id.endsWith(provider.suffix));
    cachedRanking = ids
      .filter((id) => !NON_CHAT_TOKENS.some((t) => id.toLowerCase().includes(t)))
      .map((id) => ({ id, rank: matchScore(id) }))
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
      .map((r) => r.id);
    cachedAt = Date.now();
    cachedFor = key;
  } catch {
    cachedRanking = [];
    cachedFor = key;
  }
  return cachedRanking;
}

/**
 * Chat completion with failover down the intelligence ranking. A 401 stops
 * immediately — a bad key never fixes itself on the next model.
 *
 * `timeoutMs` bounds each model attempt and `signal` aborts the whole walk:
 * a stalled transport or a caller whose time budget expired must not keep
 * stepping through the ladder (or hang on one await) — abort means stop now.
 */
export async function freeChat({
  system, user, maxTokens = 1200, temperature = 0.4, maxAttempts = 6, fetchImpl = fetch,
  signal, timeoutMs = 20000,
} = {}) {
  const provider = activeProvider();
  if (!provider) throw new Error('no-free-model');
  const models = await rankedFreeModels(fetchImpl, { signal, timeoutMs });
  if (!models.length) throw new Error('no-free-model');
  let lastError = null;
  for (const model of models.slice(0, Math.max(1, maxAttempts))) {
    if (signal?.aborted) throw abortError('Model request aborted');
    const attemptSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      ...(timeoutMs ? [AbortSignal.timeout(timeoutMs)] : []),
    ]);
    try {
      const res = await raceAbort(
        () => fetchImpl(`${provider.base}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${provider.key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          signal: attemptSignal,
        }),
        // Race the composed signal too: a transport that ignores its own
        // signal must still be cut loose by either the caller's abort or the
        // per-attempt deadline.
        attemptSignal,
      );
      if (!res.ok) {
        lastError = Object.assign(new Error(`provider ${res.status}`), { status: res.status });
        if (res.status === 401) break;
        continue;
      }
      const body = await raceAbort(() => res.json(), signal);
      return { text: body?.choices?.[0]?.message?.content ?? '', model };
    } catch (error) {
      // An abort is the caller giving up, not a model failing — stop the
      // whole walk rather than spending the next slot on a dead request.
      if (error?.name === 'AbortError') throw abortError('Model request aborted');
      lastError = error;
      if (error?.status === 401) break;
    }
  }
  throw lastError || new Error('no-free-model');
}

/** Ids that mark a model as able to read an image, not only text. */
const VISION_TOKENS = ['vl', 'vision', 'llava', 'pixtral', 'multimodal'];

const looksMultimodal = (id) => {
  const lower = id.toLowerCase();
  return VISION_TOKENS.some((token) => new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(lower));
};

/** Free chat-capable models that can also read an image, strongest first. */
/** Free vision models, strongest first — the chat ranking filtered to readers. */
export async function rankedVisionModels(fetchImpl = fetch, options = {}) {
  return (await rankedFreeModels(fetchImpl, options)).filter(looksMultimodal);
}

/**
 * Read an image with a model, failing over down the vision ranking.
 *
 * `image` is a data URL, so nothing is uploaded anywhere but the provider. If
 * the catalog has no model that can see, this throws `no-vision-model` — the
 * caller then tells the user to type it in, which is the honest answer.
 */
export async function freeVision({
  system, user, image, maxTokens = 1200, fetchImpl = fetch, signal, timeoutMs = 30000,
} = {}) {
  const provider = activeProvider();
  if (!provider) throw new Error('no-free-model');
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(String(image || ''))) {
    throw new Error('bad-image');
  }
  const models = await rankedVisionModels(fetchImpl, { signal, timeoutMs });
  if (!models.length) throw new Error('no-vision-model');
  let lastError = null;
  for (const model of models.slice(0, 4)) {
    if (signal?.aborted) throw abortError('Model request aborted');
    const attemptSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      ...(timeoutMs ? [AbortSignal.timeout(timeoutMs)] : []),
    ]);
    try {
      const res = await raceAbort(
        () => fetchImpl(`${provider.base}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${provider.key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: [
                  { type: 'text', text: user },
                  { type: 'image_url', image_url: { url: image } },
                ],
              },
            ],
          }),
          signal: attemptSignal,
        }),
        // Race the composed signal too: a transport that ignores its own
        // signal must still be cut loose by either the caller's abort or the
        // per-attempt deadline.
        attemptSignal,
      );
      if (!res.ok) {
        lastError = Object.assign(new Error(`provider ${res.status}`), { status: res.status });
        if (res.status === 401) break;
        continue;
      }
      const body = await raceAbort(() => res.json(), signal);
      return { text: body?.choices?.[0]?.message?.content ?? '', model };
    } catch (error) {
      if (error?.name === 'AbortError') throw abortError('Model request aborted');
      lastError = error;
      if (error?.status === 401) break;
    }
  }
  throw lastError || new Error('no-vision-model');
}
