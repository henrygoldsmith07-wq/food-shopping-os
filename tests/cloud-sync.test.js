import { describe, expect, it } from 'vitest';
import { canExportSync, canRefreshSync, syncCopy } from '../src/components/CloudSyncRow.jsx';

describe('household sync status copy', () => {
  it('keeps local-only and signed-out states honest', () => {
    expect(syncCopy('disabled')).toBe('Local-only mode');
    expect(syncCopy('signed-out')).toBe('Sign in to sync');
    expect(canRefreshSync('disabled')).toBe(false);
    expect(canRefreshSync('signed-out')).toBe(false);
  });

  it('offers refresh for live, ready and recoverable states', () => {
        expect(syncCopy('checking')).toBe('Checking household sync');
        expect(syncCopy('live')).toBe('Live household sync');
        expect(syncCopy('offline')).toBe('Offline — changes stay on this device');
        expect(syncCopy('conflict')).toBe('Sync conflict — local changes kept');
        expect(canRefreshSync('live')).toBe(true);
        expect(canRefreshSync('error')).toBe(true);
        expect(canRefreshSync('offline')).toBe(true);
        expect(canRefreshSync('conflict')).toBe(false);
        expect(canExportSync('conflict')).toBe(true);
        expect(canExportSync('ready')).toBe(false);
  });
});
