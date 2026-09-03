import { describe, it, expect, vi } from 'vitest';
import { abortError, raceAbort, racedFetch } from '../src/server/abort-race.js';

const hang = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('raceAbort — abort means return now', () => {
  it('rejects with an AbortError the moment the signal fires, even if the work ignores it', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    await expect(raceAbort(() => hang(5000), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('lets the work win when it settles before the abort', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);
    await expect(raceAbort(() => Promise.resolve('done'), controller.signal))
      .resolves.toBe('done');
  });

  it('rejects immediately when the signal has already fired', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(raceAbort(() => Promise.resolve('nope'), controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('is plain work when there is no signal to race', async () => {
    await expect(raceAbort(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it('stops listening once settled, so late aborts leak nothing', async () => {
    const controller = new AbortController();
    const result = await raceAbort(() => Promise.resolve('ok'), controller.signal);
    expect(result).toBe('ok');
    expect(() => controller.abort()).not.toThrow();
  });
});

describe('racedFetch — one request, one deadline', () => {
  it('cuts loose a transport that ignores its signal once the timeout fires', async () => {
    const started = Date.now();
    await expect(racedFetch(() => hang(5000), 'https://a.test/', {}, { timeoutMs: 50 }))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('passes the composed signal to the transport so a real fetch is cancelled too', async () => {
    const controller = new AbortController();
    let seen = null;
    const fetchImpl = vi.fn(async (url, init) => { seen = init?.signal; return hang(0); });
    await racedFetch(fetchImpl, 'https://a.test/', {}, { signal: controller.signal, timeoutMs: 1000 });
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen.aborted).toBe(false);
  });

  it('resolves with the response when the transport answers in time', async () => {
    const response = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    const out = await racedFetch(() => Promise.resolve(response), 'https://a.test/', {}, { timeoutMs: 1000 });
    expect(out).toBe(response);
  });
});
