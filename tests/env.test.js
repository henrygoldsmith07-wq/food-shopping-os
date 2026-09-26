import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiReadiness, assertValidEnv, envSchema, envStatus, readEnv, redisConfigured, requireEnv, validateEnv,
} from '../src/server/env.js';

/**
 * The deployment contract. Absence is a supported local-only mode; a present
 * but malformed variable is always a mistake. These tests pin both halves.
 */

const clean = () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_') || key.startsWith('KV_') || key.startsWith('UPSTASH_')
      || key.startsWith('NVIDIA_') || key.startsWith('OPENROUTER_') || key.startsWith('OPENAI_')
      || key.startsWith('MONID_') || key.startsWith('OPEN_') || key.startsWith('PRICE_SCRAPER')
      || key.startsWith('SCRAPER_') || key.startsWith('SCRAPE_') || key.startsWith('CLASSIFIER_')
      || key.startsWith('JINA_') || key.startsWith('FIRECRAWL_')
      || ['ABLY_API_KEY', 'BLOB_READ_WRITE_TOKEN', 'AI_MONTHLY_TOKEN_LIMIT'].includes(key)) {
      delete process.env[key];
    }
  }
};

afterEach(() => {
  clean();
  vi.unstubAllEnvs();
});

describe('the environment contract', () => {
  it('reports every service honestly when nothing is configured', () => {
    clean();
    const status = envStatus();
    expect(status.auth.secret).toBe(false);
    expect(status.auth.google.ready).toBe(false);
    expect(status.auth.google.detail).toContain('Add');
    expect(status.ai.ready).toBe(false);
    // Nothing configured names the whole free-first ladder, not just the paid rung.
    expect(status.ai.detail).toBe('Add NVIDIA_API_KEY, OPENROUTER_API_KEY or OPENAI_API_KEY');
    expect(status.uploads.ready).toBe(false);
    expect(status.realtime.ready).toBe(false);
    expect(redisConfigured()).toBe(false);
  });

  it('flips a service to ready only when its full credential pair is present', () => {
    clean();
    vi.stubEnv('AUTH_GOOGLE_ID', 'id');
    expect(envStatus().auth.google.ready).toBe(false); // secret missing
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'secret');
    expect(envStatus().auth.google.ready).toBe(true);
    expect(envStatus().auth.google.detail).toBe('Connected');
  });

  it('recognises either database naming and wires realtime from ably or redis', () => {
    clean();
    expect(redisConfigured()).toBe(false);
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    expect(redisConfigured()).toBe(false); // token still missing
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    expect(redisConfigured()).toBe(true);
    expect(envStatus().realtime.ready).toBe(true); // redis fallback counts

    clean();
    vi.stubEnv('ABLY_API_KEY', 'key');
    expect(envStatus().realtime.ready).toBe(true);
    expect(envStatus().realtime.ably).toBe(true);
  });

  it('calls present-but-garbage configuration a validation failure', () => {
    clean();
    expect(validateEnv().ok).toBe(true);
    vi.stubEnv('KV_REST_API_URL', 'not a url');
    const report = validateEnv();
    expect(report.ok).toBe(false);
    expect(report.invalid.some((entry) => entry.key === 'KV_REST_API_URL')).toBe(true);
    expect(() => assertValidEnv()).toThrow(/Invalid environment configuration/);
  });

  it('requireEnv lists exactly the missing variables for a full deployment', () => {
    clean();
    expect(() => requireEnv()).toThrow(/KV_REST_API_URL, KV_REST_API_TOKEN, AUTH_SECRET/);
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    expect(() => requireEnv()).toThrow(/AUTH_SECRET/);
    vi.stubEnv('AUTH_SECRET', 'secret');
    expect(() => requireEnv()).not.toThrow();
  });

  it('validates the shape of typed variables through the zod schema', () => {
    clean();
    expect(readEnv({ JINA_READER_ENABLED: 'yes' }).success).toBe(false);
    expect(readEnv({ JINA_READER_ENABLED: 'true' }).success).toBe(true);
    expect(readEnv({ AI_MONTHLY_TOKEN_LIMIT: 'not-a-number' }).success).toBe(false);
    expect(readEnv({ AI_MONTHLY_TOKEN_LIMIT: '120000' }).success).toBe(true);
  });

  it('reports AI ready when the free tier is configured, even without OpenAI', () => {
    clean();
    expect(aiReadiness({}).ready).toBe(false);
    expect(aiReadiness({}).detail).toContain('NVIDIA_API_KEY');
    expect(aiReadiness({ NVIDIA_API_KEY: 'nvapi-x' }).ready).toBe(true);
    expect(aiReadiness({ NVIDIA_API_KEY: 'nvapi-x' }).provider).toBe('nvidia');
    expect(aiReadiness({ OPENROUTER_API_KEY: 'sk-or-x' }).ready).toBe(true);
    expect(aiReadiness({ OPENROUTER_API_KEY: 'sk-or-x' }).provider).toBe('openrouter');
    expect(aiReadiness({ NVIDIA_API_KEY: 'nvapi-x', OPENAI_API_KEY: 'sk-x' }).paid).toBe(true);
    const status = envStatus({ NVIDIA_API_KEY: 'nvapi-x' });
    expect(status.ai.ready).toBe(true);
  });

  it('reads classifier readiness from the passed source, not ambient process.env', () => {
    clean();
    expect(envStatus({ CLASSIFIER_API_URL: '' }).classifier.ready).toBe(false);
    expect(envStatus({ CLASSIFIER_DISABLED: 'true' }).classifier.ready).toBe(false);
  });

  it('registers every variable the server actually reads, so drift fails loudly', async () => {
    const { readFile } = await import('node:fs/promises');
    const serverSources = ['env.js', 'openrouter.js', 'classifier-adapter.js', 'crawler.js',
      'monid-cli.js', 'monid-market.js', 'monid-prices.js', 'price-scraper.js',
      'retailer-providers.js', 'ai-budget.js', 'auth.js', 'calendar.js', 'database.js', 'realtime.js',
      'api.js'];
    const registered = new Set(Object.keys(envSchema.shape));
    const missing = [];
    const keyPattern = /process\.env\.([A-Z][A-Z0-9_]+)/g;
    for (const file of serverSources) {
      let text = '';
      try {
        text = await readFile(new URL(`../src/server/${file}`, import.meta.url), 'utf8');
      } catch {
        continue;
      }
      // UPSTASH_REDIS_PREFIX is read at import; NODE_ENV alters URL trust, not config.
      const ignored = new Set(['UPSTASH_REDIS_PREFIX', 'NODE_ENV']);
      for (const match of text.matchAll(keyPattern)) {
        const key = match[1];
        if (ignored.has(key)) continue;
        if (!registered.has(key)) missing.push(`${file}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});