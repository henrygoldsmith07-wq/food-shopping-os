import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCloudRetryLoop } from '../src/lib/cloud-retry.js';

function setup(results) {
  const listeners = {};
  globalThis.window = {
    addEventListener: (n, f) => { listeners[n] = f; },
    removeEventListener: (n) => { delete listeners[n]; },
    dispatchEvent: vi.fn(),
  };
  const queue = [...results];
  const retryQueuedCloud = vi.fn(async () => queue.shift());
  const args = {
    cloudInitialising: { current: false },
    cloudMeta: { current: { version: 1 } },
    cloudReady: { current: false },
    retryQueuedCloud,
    setCloudStatus: vi.fn(),
    liveConnection: { current: false },
  };
  return { listeners, args, retryQueuedCloud };
}

describe('startCloudRetryLoop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); delete globalThis.window; });

  it('backs off 30s, 60s, 120s after failures and resets after success', async () => {
    const fail = { status: { kind: 'error' } };
    const ok = { status: { kind: 'ready' } };
    const { args, retryQueuedCloud } = setup([fail, fail, ok, fail]);
    const stop = startCloudRetryLoop(args);
    await vi.advanceTimersByTimeAsync(29999);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59999);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120000);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(3);
    expect(args.cloudReady.current).toBe(true);
    await vi.advanceTimersByTimeAsync(30000); // reset to 30s after success
    expect(retryQueuedCloud).toHaveBeenCalledTimes(4);
    stop();
  });

  it('retries immediately when the browser comes online, and stops on cleanup', async () => {
    const { args, retryQueuedCloud, listeners } = setup([{ status: { kind: 'ready' } }]);
    const stop = startCloudRetryLoop(args);
    listeners.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.online).toBeUndefined();
    await vi.advanceTimersByTimeAsync(600000);
    expect(retryQueuedCloud).toHaveBeenCalledTimes(1);
  });

  it('asks for a cloud refresh instead of retrying when there is no cloud meta', async () => {
    const { args, retryQueuedCloud } = setup([]);
    args.cloudMeta.current = null;
    const stop = startCloudRetryLoop(args);
    await vi.advanceTimersByTimeAsync(30000);
    expect(retryQueuedCloud).not.toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalled();
    stop();
  });
});
