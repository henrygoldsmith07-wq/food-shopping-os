import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { hashPassword, normaliseEmail, validEmail, validPassword, verifyPassword } from '../src/server/passwords.js';

const mocks = vi.hoisted(() => ({ users: new Map(), rateLimit: vi.fn() }));

vi.mock('../src/server/database.js', () => ({
  databaseConfigured: true,
  getDatabase: async () => ({
    collection: () => ({
      findOne: async ({ email }) => mocks.users.get(email) || null,
      insertOne: async (doc) => {
        if (mocks.users.has(doc.email)) throw Object.assign(new Error('dup'), { code: 11000 });
        mocks.users.set(doc.email, { ...doc, _id: `u${mocks.users.size + 1}` });
        return { insertedId: `u${mocks.users.size}` };
      },
    }),
  }),
}));
vi.mock('../src/server/api.js', async (importOriginal) => ({ ...(await importOriginal()), rateLimit: mocks.rateLimit }));

const { POST } = await import('../src/app/api/account/register/route.js');
const OnboardingAccount = (await import('../src/components/AccountSignIn.jsx')).default;

const register = (body, origin = 'https://forq.example') => POST(new Request('https://forq.example/api/account/register', {
  method: 'POST',
  headers: { origin, host: 'forq.example', 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

describe('passwords', () => {
  it('hashes with a salt and verifies only the right password', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong horse', a)).toBe(false);
    expect(await verifyPassword('correct horse', undefined)).toBe(false);
  });

  it('normalises and validates input', () => {
    expect(normaliseEmail('  Sam@Example.COM ')).toBe('sam@example.com');
    expect(validEmail('sam@example.com')).toBe(true);
    expect(validEmail('sam@example')).toBe(false);
    expect(validPassword('short')).toBe(false);
    expect(validPassword('long enough')).toBe(true);
  });
});

describe('POST /api/account/register', () => {
  beforeEach(() => {
    mocks.users.clear();
    process.env.AUTH_SECRET = 'test-secret';
  });

  it('creates one account per email, storing only a hash', async () => {
    const created = await register({ email: 'Sam@Example.com', password: 'a good password' });
    expect(created.status).toBe(201);
    const stored = mocks.users.get('sam@example.com');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(stored)).not.toContain('a good password');

    const again = await register({ email: 'sam@example.com', password: 'another password' });
    expect(again.status).toBe(409);
  });

  it('refuses bad input and cross-site requests', async () => {
    expect((await register({ email: 'nope', password: 'a good password' })).status).toBe(400);
    expect((await register({ email: 'sam@example.com', password: 'short' })).status).toBe(400);
    expect((await register({ email: 'sam@example.com', password: 'a good password' }, 'https://evil.example')).status).toBe(403);
  });
});

describe('the onboarding account card', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('offers Google and email when the server has accounts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      enabled: true, authenticated: false, providers: { google: true, password: true },
    }))));
    render(<OnboardingAccount />);
    expect(await screen.findByText('Continue with Google')).toBeDefined();
    expect(screen.getByText('Sign in with email')).toBeDefined();
    expect(screen.getByText('Create an account')).toBeDefined();
  });

  it('stays out of the way on a device-only server', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ enabled: false, providers: {} })));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<OnboardingAccount />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
