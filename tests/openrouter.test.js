import { describe, it, expect, vi, beforeEach } from 'vitest';
import { freeChat, freeVision, rankedFreeModels, rankedVisionModels } from '../src/server/openrouter.js';

const catalog = {
  data: [
    { id: 'nvidia/nemotron-nano-9b-v2:free' },
    { id: 'z-ai/glm-5.2:free' },
    { id: 'nvidia/nemotron-3-ultra:free' },
    { id: 'nvidia/llama-nemotron-embed-vl-1b-v2:free' }, // non-chat
    { id: 'acme/flux-tts:free' },                        // non-chat
    { id: 'liquid/lfm2.5-2.6b:free' },
    { id: 'mistral/pixtral-12b:free' },                  // can read an image
  ],
};

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
});

describe('rankedFreeModels — intelligence order with non-chat excluded', () => {
  it('ranks GLM above Nemotron Ultra above Nano, and never offers embed/TTS', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(catalog));
    const models = await rankedFreeModels(fetchImpl);
    expect(models[0]).toContain('ultra');
    expect(models[1]).toContain('glm');
    expect(models.some((m) => m.includes('nano'))).toBe(true);
    expect(models.some((m) => m.includes('embed'))).toBe(false);
    expect(models.some((m) => m.includes('tts'))).toBe(false);
  });
});

describe('freeChat — failover walks down the intelligence ranking', () => {
  it('tries the smartest model first and falls to the next on failure', async () => {
    const tried = [];
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).endsWith('/models')) return jsonRes(catalog);
      const model = JSON.parse(init.body).model;
      tried.push(model);
      if (tried.length === 1) return new Response('rate limited', { status: 429 });
      return jsonRes({ choices: [{ message: { content: 'hello from the fallback' } }] });
    });
    const out = await freeChat({ system: 's', user: 'u', fetchImpl });
    expect(out.model).toContain('glm'); // Ultra failed → next in ranking
    expect(out.text).toBe('hello from the fallback');
    expect(tried[0]).toContain('ultra');
  });

  it('gives up cleanly when every slot refuses, so callers can fall back', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).endsWith('/models')) return jsonRes(catalog);
      return new Response('nope', { status: 503 });
    });
    await expect(freeChat({ system: 's', user: 'u', fetchImpl })).rejects.toThrow();
  });

  it('says plainly when no key or no free slot exists', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(freeChat({ system: 's', user: 'u', fetchImpl: vi.fn() })).rejects.toThrow('no-free-model');
  });
});

describe('freeVision — the models that can actually see', () => {
  it('offers only multimodal models, and never an embedding endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(catalog));
    const models = await rankedVisionModels(fetchImpl);
    expect(models).toEqual(['mistral/pixtral-12b:free']);
    expect(models.some((m) => m.includes('embed'))).toBe(false);
  });

  it('sends the picture as an image part alongside the instruction', async () => {
    let sent = null;
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).endsWith('/models')) return jsonRes(catalog);
      sent = JSON.parse(init.body);
      return jsonRes({ choices: [{ message: { content: '{"title":"Scones"}' } }] });
    });
    const out = await freeVision({
      system: 's', user: 'read it', image: 'data:image/jpeg;base64,zz', fetchImpl,
    });
    expect(out.model).toBe('mistral/pixtral-12b:free');
    expect(sent.messages[1].content).toEqual([
      { type: 'text', text: 'read it' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,zz' } },
    ]);
  });

  it('refuses anything that is not an image data URL', async () => {
    await expect(freeVision({ system: 's', user: 'u', image: 'https://x.test/a.jpg', fetchImpl: vi.fn() }))
      .rejects.toThrow('bad-image');
  });

  it('says so when nothing in the catalog can see, rather than asking a text model', async () => {
    const textOnly = { data: [{ id: 'z-ai/glm-5.2:free' }] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(textOnly));
    // The catalog cache belongs to a provider, so a different base is a fresh
    // catalog rather than the previous one's answer.
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://other.test/api/v1');
    await expect(freeVision({
      system: 's', user: 'u', image: 'data:image/png;base64,zz', fetchImpl,
    })).rejects.toThrow('no-vision-model');
  });
});
