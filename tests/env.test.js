import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertValidEnv, envStatus, readEnv, redisConfigured, requireEnv, validateEnv,
} from '../src/server/env.js';

/**
 * The deployment contract. Absence is a supported local-only mode; a present
 * but malformed variable is always a mistake. These tests pin both halves.
 */

const clean = () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_') || key.startsWith('KV_') || key.startsWith('UPSTASH_')
      || ['ABLY_API_KEY', 'OPENAI_API_KEY', 'BLOB_READ_WRITE_TOKEN', 'JINA_READER_ENABLED',
        'FIRECRAWL_WAIT_MS', 'AI_MONTHLY_TOKEN_LIMIT'].includes(key)) {
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
    expect(status.ai.detail).toBe('Add OPENAI_API_KEY');
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
});