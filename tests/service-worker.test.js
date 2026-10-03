import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Service worker caching safety.
 *
 * Forq holds household and personal data, so the worker's contract is a
 * security boundary: nothing personal may ever enter a cache, and an offline
 * API request must fail as itself rather than be answered with app HTML.
 * These tests execute the real worker script in a harness that records which
 * requests are fetched, cached or answered from a cache.
 */

const swSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/sw.js'),
  'utf8',
);

const ORIGIN = 'https://forq.test';
const keyOf = (request) => {
  const raw = typeof request === 'string' ? request : request.url;
  return new URL(raw, ORIGIN).href;
};

class FakeResponse {
  constructor(body = '', init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Map(
      Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
  }

  clone() { return new FakeResponse(this.body, { status: this.status, headers: Object.fromEntries(this.headers) }); }
}

class FakeCache {
  constructor() { this.store = new Map(); }

  async addAll(urls) {
    for (const url of urls) this.store.set(keyOf(url), new FakeResponse(url));
  }

  async put(request, response) {
    this.store.set(keyOf(request), response);
  }

  async match(request) {
    return this.store.get(keyOf(request));
  }

  async keys() { return [...this.store.keys()].map((url) => ({ url })); }

  async delete(key) { return this.store.delete(keyOf(key)); }
}

class FakeCacheStorage {
  constructor() { this.caches = new Map(); }

  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name);
  }

  async keys() { return [...this.caches.keys()]; }

  async match(request) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }

  async delete(name) { return this.caches.delete(name); }
}

const makeRequest = (url, { method = 'GET', mode = 'cors', destination = '', headers = {} } = {}) => ({
  url: new URL(url, 'https://forq.test').href,
  method,
  mode,
  destination,
  headers: new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  get(name) { return this.headers.get(name.toLowerCase()) || null; },
});

const loadWorker = () => {
  const handlers = {};
  const waits = [];
  const fetches = [];
  let fetchImpl = () => Promise.resolve(new FakeResponse('network'));

  const self = {
    location: new URL('https://forq.test/sw.js'),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  const caches = new FakeCacheStorage();

  const run = (type, request, { network } = {}) => {
    if (network) fetchImpl = network;
    let responded = null;
    let waited = null;
    const event = {
      request,
      respondWith: (promise) => { responded = promise; },
      waitUntil: (promise) => { waits.push(promise); waited = promise; },
    };
    handlers[type](event);
    return { responded, waited, fetches };
  };

  const fetchShim = (request) => {
    fetches.push(request.url);
    return fetchImpl(request);
  };

  const factory = new Function('self', 'caches', 'fetch', 'Response', 'URL', swSource);
  factory(self, caches, fetchShim, FakeResponse, URL);

  return {
    handlers,
    caches,
    run,
    fetches,
    settle: async () => { await Promise.all(waits.splice(0, waits.length)); },
  };
};

describe('service worker caching is explicit and safe', () => {
  let worker;
  beforeEach(() => { worker = loadWorker(); });
  afterEach(() => vi.restoreAllMocks());

  const install = async () => {
    worker.run('install', makeRequest('/sw.js'));
    await worker.settle();
  };

  it('registers install, activate and fetch handlers', () => {
    expect(typeof worker.handlers.install).toBe('function');
    expect(typeof worker.handlers.activate).toBe('function');
    expect(typeof worker.handlers.fetch).toBe('function');
  });

  it('precaches the offline shell only', async () => {
    await install();
    const names = await worker.caches.keys();
    expect(names).toEqual(['forq-shell-v6']);
    const shell = await worker.caches.open(names[0]);
    expect((await shell.keys()).map((k) => k.url)).toContain('https://forq.test/');
  });

  it('removes obsolete caches on activation and keeps the current versions', async () => {
    await worker.caches.open('forq-shell-v5');
    await worker.caches.open('forq-assets-v5');
    await worker.caches.open('forq-shell-v6');
    worker.run('activate', makeRequest('/sw.js'));
    await worker.settle();
    // v5 caches are gone; the current shell survives and assets start empty.
    const names = await worker.caches.keys();
    expect(names).toEqual(['forq-shell-v6']);
    // An assets cache still in use (created by a runtime write) also survives.
    await worker.caches.open('forq-assets-v6');
    worker.run('activate', makeRequest('/sw.js'));
    await worker.settle();
    expect((await worker.caches.keys()).sort()).toEqual(['forq-assets-v6', 'forq-shell-v6']);
  });

  it('never runtime-caches /api/* and never falls back to / HTML when offline', async () => {
    await install();
    const request = makeRequest('/api/sync/push', { destination: '' });
    const { responded } = worker.run('fetch', request, {
      network: () => Promise.reject(new Error('offline')),
    });
    // The private request is handed to the network untouched: no respondWith,
    // so the browser reports a failed fetch — never a cached document.
    expect(responded).toBe(null);
    for (const name of await worker.caches.keys()) {
      const cache = await worker.caches.open(name);
      expect((await cache.keys()).some((k) => k.url.includes('/api/'))).toBe(false);
    }
  });

  it('never caches authentication, account, sync or household endpoints', async () => {
    await install();
    for (const path of [
      '/api/auth/session',
      '/api/auth/callback/google',
      '/api/sync/pull',
      '/api/households/invite',
      '/api/health/vault',
    ]) {
      const { responded } = worker.run('fetch', makeRequest(path), {
        network: () => Promise.resolve(new FakeResponse('personal')),
      });
      expect(responded).toBe(null);
    }
    await worker.settle();
    for (const name of await worker.caches.keys()) {
      const cache = await worker.caches.open(name);
      const keys = (await cache.keys()).map((k) => k.url);
      expect(keys.some((url) => url.includes('/api/'))).toBe(false);
    }
  });

  it('never caches requests that carry credentials', async () => {
    await install();
    const { responded } = worker.run(
      'fetch',
      makeRequest('/icon.svg', { headers: { authorization: 'Bearer secret' } }),
      { network: () => Promise.resolve(new FakeResponse('authed')) },
    );
    expect(responded).toBe(null);
    await worker.settle();
  });

  it('never caches a response that sets a cookie', async () => {
    await install();
    const { responded, waited } = worker.run(
      'fetch',
      makeRequest('/logo.svg', { destination: 'image' }),
      { network: () => Promise.resolve(new FakeResponse('svg', { headers: { 'Set-Cookie': 'session=1' } })) },
    );
    await responded;
    await worker.settle();
    const cache = await worker.caches.open('forq-assets-v6');
    expect(await cache.match('https://forq.test/logo.svg')).toBe(undefined);
  });

  it('caches known static assets cache-first and serves them offline', async () => {
    await install();
    const request = makeRequest('/_next/static/chunks/main-abc123.js', { destination: 'script' });
    const { responded } = worker.run('fetch', request, {
      network: () => Promise.resolve(new FakeResponse('bundle')),
    });
    expect((await responded).body).toBe('bundle');
    await worker.settle();

    // Second request is served from cache with no network call.
    worker.fetches.length = 0;
    const again = worker.run('fetch', request, {
      network: () => Promise.reject(new Error('offline')),
    });
    expect((await again.responded).body).toBe('bundle');
    expect(worker.fetches).toHaveLength(0);
  });

  it('serves the precached shell for navigations when offline', async () => {
    await install();
    const { responded } = worker.run('fetch', makeRequest('/plan', { mode: 'navigate', destination: 'document' }), {
      network: () => Promise.reject(new Error('offline')),
    });
    const response = await responded;
    expect(response.body).toBe('/');
  });

  it('returns a plain 503 when the shell itself is unavailable offline', async () => {
    worker.run('install', makeRequest('/sw.js'));
    await worker.settle();
    // Empty the shell cache to simulate a broken install.
    (await worker.caches.open('forq-shell-v6')).store.clear();
    const { responded } = worker.run('fetch', makeRequest('/plan', { mode: 'navigate' }), {
      network: () => Promise.reject(new Error('offline')),
    });
    const response = await responded;
    expect(response.status).toBe(503);
  });

  it('keeps non-navigational unknown same-origin GETs network-only', async () => {
    await install();
    const { responded, waited } = worker.run('fetch', makeRequest('/readiness-report.json'), {
      network: () => Promise.resolve(new FakeResponse('report')),
    });
    await responded;
    await worker.settle();
    const cache = await worker.caches.open('forq-assets-v6');
    expect(await cache.match('https://forq.test/readiness-report.json')).toBe(undefined);
  });

  it('caps the asset cache so it cannot grow without bound', async () => {
    await install();
    for (let i = 0; i < 120; i += 1) {
      const { responded } = worker.run('fetch', makeRequest(`/_next/static/chunk-${i}.js`, { destination: 'script' }), {
        network: () => Promise.resolve(new FakeResponse(`c${i}`)),
      });
      await responded;
      await worker.settle();
    }
    const cache = await worker.caches.open('forq-assets-v6');
    const keys = await cache.keys();
    expect(keys.length).toBeLessThanOrEqual(80);
  });

  it('ignores cross-origin and non-GET requests entirely', async () => {
    await install();
    const cross = makeRequest('https://cdn.example.com/lib.js', { destination: 'script' });
    cross.url = 'https://cdn.example.com/lib.js';
    expect(worker.run('fetch', cross).responded).toBe(null);
    expect(worker.run('fetch', makeRequest('/api/sync', { method: 'POST' })).responded).toBe(null);
  });
});
