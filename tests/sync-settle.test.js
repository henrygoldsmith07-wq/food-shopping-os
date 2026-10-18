import { describe, expect, it, vi } from 'vitest';
import { settlePush } from '../src/lib/cloud.js';

/**
 * A save that loses the version race must not stop syncing for the session.
 * It used to: every 409 set the sync as not-ready and nothing re-armed it, so
 * later edits silently stayed on the device.
 */
describe('what a finished push means for the sync loop', () => {
  it('carries on after a 409 whose household copy folds in cleanly', () => {
    const adopt = vi.fn(() => ({ conflicts: 0 }));
    const out = settlePush({ kind: 'conflict', remoteState: { a: 1 }, remoteVersion: 7 }, adopt);
    expect(adopt).toHaveBeenCalledWith({ a: 1 }, 7);
    expect(out).toEqual({ status: { kind: 'ready', message: 'Household changes merged with yours.' }, keepSyncing: true });
  });

  it('carries on when there was nothing to fold (the lost-response case)', () => {
    // The previous push committed but its reply was lost: the 409 brings back
    // this device's own copy and the fold finds nothing to adopt.
    const out = settlePush({ kind: 'conflict', remoteState: { a: 1 }, remoteVersion: 3 }, () => null);
    expect(out.keepSyncing).toBe(true);
    expect(out.status.kind).toBe('ready');
  });

  it('keeps syncing while overlapping edits wait for a pick, and says so', () => {
    const out = settlePush({ kind: 'conflict', remoteState: {}, remoteVersion: 2 }, () => ({ conflicts: 2 }));
    expect(out.keepSyncing).toBe(true);
    expect(out.status).toMatchObject({ kind: 'conflict', message: expect.stringMatching(/2 items were changed on two devices/) });
  });

  it('stops on a bare conflict or an error, and not on success', () => {
    const adopt = vi.fn();
    expect(settlePush({ kind: 'conflict' }, adopt).keepSyncing).toBe(false);
    expect(settlePush({ kind: 'error', message: 'down' }, adopt).keepSyncing).toBe(false);
    expect(settlePush({ kind: 'ready', message: 'All changes synced.' }, adopt).keepSyncing).toBe(true);
    expect(adopt).not.toHaveBeenCalled();
  });
});

describe('switching household', () => {
  it('forgets the previous household’s merge base', async () => {
    const { selectCloudHousehold } = await import('../src/lib/cloud.js');
    localStorage.setItem('forq-cloud-meta-v1', JSON.stringify({ householdId: 'old', version: 4 }));
    localStorage.setItem('forq-cloud-base-v2', JSON.stringify({ version: 4, state: {} }));
    selectCloudHousehold('old');
    expect(localStorage.getItem('forq-cloud-base-v2')).not.toBeNull();
    selectCloudHousehold('new');
    expect(localStorage.getItem('forq-cloud-base-v2')).toBeNull();
    expect(JSON.parse(localStorage.getItem('forq-cloud-meta-v1'))).toMatchObject({ householdId: 'new', version: 0 });
  });
});
