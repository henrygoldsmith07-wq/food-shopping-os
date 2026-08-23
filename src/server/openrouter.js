/**
 * Free-tier AI providers: NVIDIA NIM first, OpenRouter second.
 *
 * Both expose OpenAI-compatible catalogs. Chat model selection is ranked by
 * capability (Ultra → Super/Lightning → size tiers), excludes non-chat
 * endpoints (embeddings, rerankers, TTS, safety classifiers) and fails over
 * down the ranking. Free/unmetered providers bypass the household AI budget.
 */

/** Capability order: position = preference. Tokens must all appear in the id. */
const CHAT_MODEL_ORDER = [
  { name: 'Nemotron Ultra', tokens: ['ultra'] },
  { name: 'GLM', tokens: ['glm'] },
  { name: 'Lightning', tokens: ['lightning'] },
  { name: 'Super (non-nano)', tokens: ['super'] },
  { name: 'Gemma large', tokens: ['gemma'] },
  { name: '30B MoE', tokens: ['30b'] },
  { name: 'Llama 70B class', tokens: ['70b'] },
  { name: '12B VL', tokens: ['12b'] },
  { name: '9B', tokens: ['9b'] },
  { name: 'LFM', tokens: ['lfm'] },
  { name: 'Inkling', tokens: ['inkling'] },
  { name: 'Laguna', tokens: ['laguna'] },
];

/** Endpoint-only models that can never serve chat completions. */
const NON_CHAT_TOKENS = ['embed', 'rerank', 'tts', 'safety', 'moderation', 'whisper', 'guard'];

const CATALOG_TTL_MS = 10 * 60 * 1000;
let cachedRanking = null;
let cachedAt = 0;

export const activeProvider = () => {
  if (process.env.NVIDIA_API_KEY) {
    return {
      id: 'nvidia',
      base: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
      key: process.env.NVIDIA_API_KEY,
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

const matchScore = (id) => {
  const lower = id.toLowerCase();
  let best = Infinity;
  CHAT_MODEL_ORDER.forEach((entry, position) => {
    if (entry.tokens.every((t) => lower.includes(t))) best = Math.min(best, position);
  });
  return best;
};

/** Free/chat-capable models, strongest first, for the active provider. */
export async function rankedFreeModels(fetchImpl = fetch) {
  const provider = activeProvider();
  if (!provider) return [];
  if (cachedRanking && Date.now() - cachedAt < CATALOG_TTL_MS) return cachedRanking;
  try {
    const res = await fetchImpl(`${provider.base}/models`, {
      headers: { authorization: `Bearer ${provider.key}` },
    });
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
  } catch {
    cachedRanking = [];
  }
  return cachedRanking;
}

/**
 * Chat completion with failover down the intelligence ranking. A 401 stops
 * immediately — a bad key never fixes itself on the next model.
 */
export async function freeChat({ system, user, maxTokens = 1200, fetchImpl = fetch } = {}) {
  const provider = activeProvider();
  if (!provider) throw new Error('no-free-model');
  const models = await rankedFreeModels(fetchImpl);
  if (!models.length) throw new Error('no-free-model');
  let lastError = null;
  for (const model of models.slice(0, 6)) {
    try {
      const res = await fetchImpl(`${provider.base}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${provider.key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        lastError = Object.assign(new Error(`provider ${res.status}`), { status: res.status });
        if (res.status === 401) break;
        continue;
      }
      const body = await res.json();
      return { text: body?.choices?.[0]?.message?.content ?? '', model };
    } catch (error) {
      lastError = error;
      if (error?.status === 401) break;
    }
  }
  throw lastError || new Error('no-free-model');
}
