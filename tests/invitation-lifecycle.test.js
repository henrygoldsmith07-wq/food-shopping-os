import { describe, expect, it } from 'vitest';
import { canAcceptInvitation } from '../src/app/api/households/invitations/route.js';

const invite = { householdId: 'h1', createdBy: 'admin-1', acceptedAt: null, revokedAt: null };
const admin = { role: 'admin', permissions: ['shopping', 'recipes'] };

describe('invitation lifecycle', () => {
  it('accepts a live invite from a current admin', () => {
    expect(canAcceptInvitation(invite, admin)).toBe(true);
    expect(canAcceptInvitation(invite, { role: 'owner' })).toBe(true);
  });

  it('rejects a revoked or already accepted invite', () => {
    expect(canAcceptInvitation({ ...invite, revokedAt: new Date() }, admin)).toBe(false);
    expect(canAcceptInvitation({ ...invite, acceptedAt: new Date() }, admin)).toBe(false);
  });

  it('rejects a link whose inviter was removed or demoted', () => {
    expect(canAcceptInvitation(invite, null)).toBe(false);
    expect(canAcceptInvitation(invite, { role: 'member', permissions: ['shopping'] })).toBe(false);
  });
});
