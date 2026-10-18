import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Email sign-up proves nothing about the address, so whoever registers
 * someone else's Gmail first must not lock its owner out of Google sign-in,
 * nor gain access to their account. A verified Google sign-in parks the
 * unverified password account on another address; nothing is linked.
 */

const users = vi.hoisted(() => new Map());

vi.mock('../src/server/database.js', () => ({
  databaseConfigured: true,
  getDatabase: async () => ({
    incrementWindow: async () => 1,
    collection: () => ({
      findOne: async ({ email, _id }) => [...users.values()].find((u) => (email ? u.email === email : u._id === _id)) || null,
      updateOne: async ({ _id }, { $set }) => { Object.assign(users.get(_id), $set); },
    }),
  }),
}));

const { authOptions } = await import('../src/server/auth.js');
const { hashPassword } = await import('../src/server/passwords.js');
const signIn = (email, emailVerified = true) => authOptions.callbacks.signIn({
  account: { provider: 'google' },
  profile: { email, email_verified: emailVerified },
});
const passwordProvider = () => authOptions.providers.find((p) => (p.options?.id || p.id) === 'password');

describe('a verified Google sign-in claims its address', () => {
  beforeEach(() => users.clear());

  it('parks an unverified password account that holds the address', async () => {
    users.set('u1', { _id: 'u1', email: 'owner@gmail.com', passwordHash: await hashPassword('squatter pass') });
    expect(await signIn('owner@gmail.com')).toBe(true);
    expect(users.get('u1').email).toBe('parked:owner@gmail.com');
  });

  it('leaves Google-made accounts, and unverified Google emails, alone', async () => {
    users.set('u2', { _id: 'u2', email: 'g@gmail.com', name: 'G' });
    await signIn('g@gmail.com');
    expect(users.get('u2').email).toBe('g@gmail.com');

    users.set('u3', { _id: 'u3', email: 'x@example.com', passwordHash: 'scrypt$aa$bb' });
    await signIn('x@example.com', false);
    expect(users.get('u3').email).toBe('x@example.com');
  });

  it('still lets the parked account sign in with its password', async () => {
    users.set('u4', { _id: 'u4', email: 'parked:p@gmail.com', passwordHash: await hashPassword('right password') });
    const authorize = passwordProvider().options.authorize;
    expect(await authorize({ email: 'p@gmail.com', password: 'right password' })).toMatchObject({ id: 'u4' });
    expect(await authorize({ email: 'p@gmail.com', password: 'wrong password' })).toBeNull();
  });
});
