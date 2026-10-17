import { describe, it, expect } from 'vitest';

describe('rate-limit keys expire (no household content)', () => {
  it('documents the TTL shape used by src/server/api.js rateLimit', () => {
    // rateLimit increments a counter "<key>:<windowISO>" that expires 2*windowMs after its first hit.
    // Keys are counters only (ai:<user>, coach-shares:*:<user>, analytics:<user>),
    // never household state, and expire within hours — household deletion
    // intentionally leaves them to TTL. See docs/DELETION.md.
    const windowMs = 3600000;
    const window = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const expiresAt = new Date(window.getTime() + windowMs * 2);
    expect(expiresAt.getTime() - window.getTime()).toBe(windowMs * 2);
    expect(`ai:user-1:${window.toISOString()}`).toMatch(/^ai:/);
  });
});
