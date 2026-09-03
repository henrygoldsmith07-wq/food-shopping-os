import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appStorageTotal, formatBytes, keySize, keySizes, LEVEL_COPY, storageLevel, storageUsage,
} from '../src/lib/storage-health.js';
import { hasQueuedCloud, lastSyncedAt, queuedSince } from '../src/lib/cloud.js';
import { timeAgo } from '../src/lib/utils.js';

describe('storage health', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('measures per-key sizes and ranks them largest first', () => {
    localStorage.setItem('forq-state-v2', JSON.stringify({ log: 'x'.repeat(2000) }));
    localStorage.setItem('forq-cloud-meta-v1', JSON.stringify({ deviceId: 'y'.repeat(50) }));
    const sizes = keySizes(['forq-state-v2', 'forq-cloud-meta-v1', 'absent-key']);
    expect(sizes[0].key).toBe('forq-state-v2');
    expect(sizes[0].bytes).toBeGreaterThan(sizes[1].bytes);
    expect(sizes.some((entry) => entry.key === 'absent-key')).toBe(false); // zero-byte keys are omitted
    expect(keySize('absent-key')).toBe(0);
  });

  it('totals the app keys and formats bytes legibly', () => {
    localStorage.setItem('forq-state-v2', 'a'.repeat(1024));
    localStorage.setItem('forq-cloud-meta-v1', 'b'.repeat(2048));
    const total = appStorageTotal(['forq-state-v2', 'forq-cloud-meta-v1']);
    expect(total).toBe(3072);
    expect(formatBytes(total)).toBe('3 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(null)).toBe('—');
  });

  it('turns fullness into words, escalating at the right thresholds', () => {
    expect(storageLevel(0.3)).toBe('ok');
    expect(storageLevel(0.8)).toBe('warn');
    expect(storageLevel(0.95)).toBe('critical');
    expect(storageLevel(null)).toBe('unknown');
    expect(LEVEL_COPY.critical).toMatch(/Export a backup now/);
    expect(LEVEL_COPY.warn).toMatch(/getting full/);
  });

  it('reports unsupported gracefully when the browser cannot estimate', async () => {
    const result = await storageUsage();
    // jsdom has no navigator.storage, which is exactly the honest fallback.
    expect(result.supported).toBe(false);
  });
});

describe('sync diagnostics timestamps', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('lastSyncedAt reads the timestamp stored on a successful sync', () => {
    expect(lastSyncedAt()).toBeNull();
    const at = 1750000000000;
    localStorage.setItem('forq-cloud-meta-v1', JSON.stringify({ version: 3, syncedAt: at }));
    expect(lastSyncedAt()).toBe(at);
  });

  it('queuedSince and hasQueuedCloud read the persisted offline queue', () => {
    expect(hasQueuedCloud()).toBe(false);
    localStorage.setItem('forq-cloud-queue-v1', JSON.stringify({
      state: { onboarded: true }, meta: { version: 1 }, queuedAt: 1750000000000,
    }));
    expect(hasQueuedCloud()).toBe(true);
    expect(queuedSince()).toBe(1750000000000);
  });

  it('timeAgo speaks in units that shrink over time', () => {
    const now = Date.now();
    expect(timeAgo(now)).toBe('just now');
    expect(timeAgo(now - 5 * 60 * 1000)).toBe('5 min ago');
    expect(timeAgo(now - 2 * 60 * 60 * 1000)).toBe('2 hrs ago');
    expect(timeAgo(now - 3 * 24 * 60 * 60 * 1000)).toBe('3 days ago');
  });
});