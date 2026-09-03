import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as healthGET } from '../src/app/api/health/route.js';
import { GET as readinessGET } from '../src/app/api/readiness/route.js';

/**
 * Liveness says the process is up; readiness says the deployment is
 * configured as declared. Together they give an orchestrator the two
 * questions separately, without either probing a database.
 */

const clean = () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_') || key.startsWith('KV_') || key.startsWith('UPSTASH_')
      || ['ABLY_API_KEY', 'OPENAI_API_KEY', 'BLOB_READ_WRITE_TOKEN'].includes(key)) {
      delete process.env[key];
    }
  }
};

afterEach(() => {
  clean();
  vi.unstubAllEnvs();
});

describe('health probe', () => {
  it('answers 200 with ok true and a timestamp, touching nothing', async () => {
    const response = await healthGET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.now).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('readiness probe', () => {
  it('reports a clean, empty deployment as ok with every service off', async () => {
    clean();
    const body = await (await readinessGET()).json();
    expect(body.ok).toBe(true);
    expect(body.database).toBe(false);
    expect(body.realtime).toBe(false);
    expect(body.ai).toBe(false);
    expect(body.uploads).toBe(false);
    expect(body.auth).toBe(false);
  });

  it('flips each service flag when its credentials appear', async () => {
    clean();
    vi.stubEnv('ABLY_API_KEY', 'key');
    vi.stubEnv('OPENAI_API_KEY', 'key');
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    vi.stubEnv('AUTH_SECRET', 'secret');
    const body = await (await readinessGET()).json();
    expect(body.database).toBe(true);
    expect(body.realtime).toBe(true);
    expect(body.ai).toBe(true);
    expect(body.auth).toBe(true);
  });

  it('calls a malformed present variable a not-ready configuration', async () => {
    clean();
    vi.stubEnv('KV_REST_API_URL', 'not a url');
    const body = await (await readinessGET()).json();
    expect(body.ok).toBe(false);
    expect(body.validation.ok).toBe(false);
    expect(body.validation.invalid[0].key).toBe('KV_REST_API_URL');
  });
});