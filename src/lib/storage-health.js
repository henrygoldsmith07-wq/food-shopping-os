/**
 * Storage health — the honest answer to "how full am I, and what's filling me?"
 *
 * Everything lives in localStorage, so the browser's quota is the ceiling.
 * The app degrades gracefully (quotas fail loud at write time via the store's
 * existing handling), but a user should see the wall coming: usage against
 * quota when the browser can report it, per-key sizes always, and a level
 * that turns into words rather than a surprise QuotaExceededError.
 */

/** Byte size of a localStorage entry via Blob, which measures UTF-16 pairs. */
export function keySize(key) {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  if (raw == null) return 0;
  try {
    return new Blob([raw]).size;
  } catch {
    return raw.length * 2; // UTF-16 fallback when Blob is unavailable
  }
}

/** Sizes for a list of keys, largest first. */
export function keySizes(keys) {
  return keys
    .map((key) => ({ key, bytes: keySize(key) }))
    .filter((entry) => entry.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Usage against the browser quota. Resolves to { supported: false } when the
 * browser (or a test environment) cannot report it — absence of an estimate
 * is a fact, not an error.
 */
export async function storageUsage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
    const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    return {
      supported: true,
      usageBytes,
      quotaBytes,
      pct: usageBytes != null && quotaBytes > 0 ? usageBytes / quotaBytes : null,
    };
  } catch {
    return { supported: false };
  }
}

export function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Words for a fullness level, so the UI can say something instead of a number. */
export function storageLevel(pct) {
  if (pct == null || !Number.isFinite(pct)) return 'unknown';
  if (pct >= 0.9) return 'critical';
  if (pct >= 0.75) return 'warn';
  return 'ok';
}

export const LEVEL_COPY = {
  ok: 'Plenty of room left on this device.',
  warn: 'This browser is getting full. Export a backup while everything still works.',
  critical: 'This browser is nearly out of local storage. Export a backup now.',
  unknown: 'This browser does not report its storage quota.',
};

/** Total of the app's own localStorage keys — the part this device owns. */
export function appStorageTotal(keys) {
  return keySizes(keys).reduce((sum, entry) => sum + entry.bytes, 0);
}