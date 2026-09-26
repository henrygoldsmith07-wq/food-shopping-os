import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The routes, end to end, with the network stubbed and the model mocked.
 *
 * What is being pinned here is *who answers*: the rules for what they can
 * classify, classifier.dev for cheap labelling, and the general model only
 * where neither can — plus the standing promise that a medical question never
 * reaches a classifier and that a deterministic answer needs no AI configured
 * at all.
 */

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
  isOpenRouterConfigured: vi.fn(),
  classifyAiFailure: vi.fn(() => 'retry-model'),
  freeChat: vi.fn(),
}));

vi.mock('../src/server/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rateLimit: mocks.rateLimit,
  requireUser: mocks.requireUser,
}));
vi.mock('../src/server/households.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireHousehold: mocks.requireHousehold,
}));
vi.mock('../src/server/openrouter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isOpenRouterConfigured: mocks.isOpenRouterConfigured,
  classifyAiFailure: mocks.classifyAiFailure,
  freeChat: mocks.freeChat,
}));

const { POST: classifyPost, GET: classifyGet } = await import('../src/app/api/classify/route.js');
const { POST: aiPost } = await import('../src/app/api/ai/route.js');
const { classifierTelemetry, resetClassifierTelemetry, clearClassifierCache } = await import('../src/server/classifier-adapter.js');

const ORIGIN = 'https://forq.example';

const request = (path, body, { origin = ORIGIN, method = 'POST' } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { origin, 'content-type': 'application/json', 'x-forq-household-id': '507f1f77bcf86cd799439011' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  clearClassifierCache();
  resetClassifierTelemetry();
  mocks.requireUser.mockResolvedValue({ id: 'user-1' });
  mocks.requireHousehold.mockResolvedValue({ household: { _id: 'household-1' }, membership: { role: 'adult' } });
  mocks.isOpenRouterConfigured.mockReturnValue(true);
  mocks.freeChat.mockResolvedValue({ text: 'from the model', provider: 'nvidia', model: 'test-model' });
  mocks.classifyAiFailure.mockReturnValue('retry-model');
  vi.stubEnv('OPENAI_API_KEY', 'paid-key');
});
describe('POST /api/classify — batched labelling', () => {
  it('rejects a cross-origin request before checking the account', async () => {
    const res = await classifyPost(request('/api/classify', { taxonomy: 'product', items: ['apples'] }, { origin: 'https://attacker.example' }));
    expect(res.status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it('rejects an unknown taxonomy at the schema, not deep in the adapter', async () => {
    const res = await classifyPost(request('/api/classify', { taxonomy: 'medical-advice', items: ['x'] }));
    expect(res.status).toBe(400);
  });

  it('labels product names, maps them to aisles, and says where each label came from', async () => {
    vi.stubEnv('CLASSIFIER_API_URL', ''); // rules and fallbacks only
    const res = await classifyPost(request('/api/classify', {
      taxonomy: 'product', items: ['bananas', 'blorp'],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ item: 'bananas', label: 'produce', aisle: 'Fruit & veg', source: 'deterministic' });
    expect(body.results[1]).toMatchObject({ item: 'blorp', label: 'other', aisle: 'Other', source: 'fallback' });
    expect(body.labels).toContain('personal-care');
  });

  it('labels recipe-meal questions from the rules', async () => {
    const res = await classifyPost(request('/api/classify', { taxonomy: 'recipe-meal', items: ['porridge'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ label: 'breakfast', source: 'deterministic' });
  });

  it('reads imported recipe lines into the line taxonomy', async () => {
    const res = await classifyPost(request('/api/classify', {
      taxonomy: 'recipe-line',
      items: ['200 g spaghetti', 'Heat the oven.', 'Serves 2'],
    }));
    const body = await res.json();
    expect(body.results.map((row) => row.label)).toEqual(['ingredient', 'instruction', 'metadata']);
  });

  it('returns the measurement of what did not reach the general model', async () => {
    const res = await classifyPost(request('/api/classify', { taxonomy: 'product', items: ['bananas', 'milk'] }));
    const body = await res.json();
    expect(body.telemetry.llmCallsAvoided).toBe(2);
    expect(body.telemetry.avoidedBy.deterministic).toBe(2);
    expect(body.telemetry.remoteCalls).toBe(0);
  });
});

describe('GET /api/classify — telemetry', () => {
  it('reports the counters and the confidence floor in force', async () => {
    const res = await classifyGet(request('/api/classify', null, { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ llmCallsAvoided: 0, confidenceFloor: 0.6 });
    expect(body.avoidedBy).toMatchObject({ cache: 0, deterministic: 0, classifier: 0, routing: 0 });
  });
});

describe('POST /api/ai — deterministic routing happens before the model', () => {
  it('answers an aisle question from the rules and never calls the model', async () => {
    const res = await aiPost(request('/api/ai', { task: 'shopping', prompt: 'What aisle do oats go in?' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('deterministic');
    expect(body.routed).toBe('product-category');
    expect(JSON.parse(body.output).answer).toContain('pantry');
    expect(mocks.freeChat).not.toHaveBeenCalled();
    expect(classifierTelemetry().llmCallsAvoided).toBe(1);
    expect(classifierTelemetry().avoidedBy.routing).toBe(1);
  });

  it('answers without any AI provider configured, because no model is involved', async () => {
    mocks.isOpenRouterConfigured.mockReturnValue(false);
    vi.stubEnv('OPENAI_API_KEY', '');
    const res = await aiPost(request('/api/ai', { task: 'shopping', prompt: 'What aisle do bin bags go in?' }));
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe('deterministic');
  });

  it('still refuses an ordinary question when no provider is configured', async () => {
    mocks.isOpenRouterConfigured.mockReturnValue(false);
    vi.stubEnv('OPENAI_API_KEY', '');
    const res = await aiPost(request('/api/ai', { task: 'meal-plan', prompt: 'Plan my week' }));
    expect(res.status).toBe(503);
  });

  it('sends an ordinary question to the model exactly as before', async () => {
    const res = await aiPost(request('/api/ai', { task: 'meal-plan', prompt: 'Plan my week' }));
    const body = await res.json();
    expect(body.provider).toBe('nvidia');
    expect(body.model).toBe('test-model');
    expect(body.output).toBe('from the model');
    expect(mocks.freeChat).toHaveBeenCalledTimes(1);
    expect(classifierTelemetry().llmCallsAvoided).toBe(0);
  });

  it('sends a medical question to the model, never to the classifier', async () => {
    const res = await aiPost(request('/api/ai', { task: 'shopping', prompt: 'Is this safe to eat with a nut allergy?' }));
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe('nvidia');
    expect(mocks.freeChat).toHaveBeenCalledTimes(1);
    // The model's system prompt carries the constraint-aware framing.
    const [{ system }] = mocks.freeChat.mock.calls[0];
    expect(system).toContain('allergy and health information as constraints');
  });

  it('never labels an NVIDIA answer as OpenRouter', async () => {
    mocks.freeChat.mockResolvedValue({ text: 'hi', provider: 'nvidia', model: 'm' });
    const res = await aiPost(request('/api/ai', { task: 'meal-plan', prompt: 'Plan my week' }));
    const body = await res.json();
    expect(body.provider).toBe('nvidia');
    expect(body.provider).not.toBe('openrouter-free');
  });

  it('surfaces a provider-wide outage instead of re-spending it on the paid relay', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'paid-key');
    mocks.freeChat.mockRejectedValue(Object.assign(new Error('provider 503'), { status: 503 }));
    mocks.classifyAiFailure.mockReturnValue('retry-provider');
    const res = await aiPost(request('/api/ai', { task: 'meal-plan', prompt: 'Plan my week' }));
    expect(res.status).toBe(500);
  });
});