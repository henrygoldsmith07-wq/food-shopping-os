import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rankedFreeModels, freeChat } from '../src/server/openrouter.js';

const catalog = {
  data: [
    { id: 'nvidia/nemotron-nano-9b-v2:free' },
    { id: 'z-ai/glm-5.2:free' },
    { id: 'nvidia/nemotron-3-ultra:free' },
    { id: 'nvidia/llama-nemotron-embed-vl-1b-v2:free' }, // non-chat
    { id: 'acme/flux-tts:free' },                        // non-chat
    { id: 'liquid/lfm2.5-2.6b:free' },
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
