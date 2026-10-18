import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Email verification and password reset, end to end through the routes with
 * an in-memory database and a stand-in for Resend that records what was sent.
 */
const state = vi.hoisted(() => ({ collections: new Map(), sent: [], nextId: 1 }));

vi.mock('../src/server/database.js', () => {
  const coll = (name) => {
    if (!state.collections.has(name)) state.collections.set(name, []);
    const rows = state.collections.get(name);
    const match = (filter) => (row) => Object.entries(filter).every(([k, v]) => row[k] === v);
    return {
      findOne: async (filter) => rows.find(match(filter)) || null,
      insertOne: async (doc) => { const row = { _id: `id${state.nextId++}`, ...doc }; rows.push(row); return { insertedId: row._id }; },
      updateOne: async (filter, { $set }) => { const row = rows.find(match(filter)); if (row) Object.assign(row, $set); },
      deleteOne: async (filter) => { const i = rows.findIndex(match(filter)); if (i >= 0) rows.splice(i, 1); },
    };
  };
  return { databaseConfigured: true, getDatabase: async () => ({ collection: coll, incrementWindow: async () => 1 }) };
});

const ORIGIN = 'https://forq.example';
const req = (path, method, body) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { origin: ORIGIN, host: 'forq.example', 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const linkIn = (message) => new URL(/https:\/\/\S+/.exec(message.text)[0]);

beforeEach(() => {
  state.collections.clear();
  state.sent.length = 0;
  process.env.AUTH_SECRET = 'test-secret';
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'Forq <hello@forq.example>';
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (String(url).startsWith('https://api.resend.com')) {
      state.sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
});

const { POST: register } = await import('../src/app/api/account/register/route.js');
const { GET: verify, POST: resend } = await import('../src/app/api/account/verify/route.js');
const { POST: requestReset, PUT: completeReset } = await import('../src/app/api/account/password-reset/route.js');
const { authOptions } = await import('../src/server/auth.js');
const authorize = (email, password) => authOptions.providers
  .find((p) => (p.options?.id || p.id) === 'password').options.authorize({ email, password }, { headers: {} });

describe('email verification', () => {
  it('sends a confirmation link on sign-up, and the password signs in only after it is used', async () => {
    const created = await register(req('/api/account/register', 'POST', { email: 'Sam@Example.com', password: 'a good password' }));
    expect(await created.json()).toMatchObject({ verify: true, sent: true });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]).toMatchObject({ to: ['sam@example.com'], from: 'Forq <hello@forq.example>' });

    await expect(authorize('sam@example.com', 'a good password')).rejects.toThrow('unverified');

    const url = linkIn(state.sent[0]);
    expect(url.pathname).toBe('/api/account/verify');
    const landed = await verify(new Request(url.href.replace(/^https:\/\/[^/]+/, ORIGIN), { headers: { host: 'forq.example' } }));
    expect(landed.status).toBe(303);
    expect(landed.headers.get('location')).toBe(`${ORIGIN}/?verified=1`);
    expect(await authorize('sam@example.com', 'a good password')).toMatchObject({ email: 'sam@example.com' });

    // A link works once.
    const again = await verify(new Request(url.href.replace(/^https:\/\/[^/]+/, ORIGIN), { headers: { host: 'forq.example' } }));
    expect(again.headers.get('location')).toBe(`${ORIGIN}/?verified=0`);
  });

  it('resends only for an unverified password account, and answers the same either way', async () => {
    await register(req('/api/account/register', 'POST', { email: 'kim@example.com', password: 'a good password' }));
    state.sent.length = 0;
    expect((await resend(req('/api/account/verify', 'POST', { email: 'kim@example.com' }))).status).toBe(200);
    expect(state.sent).toHaveLength(1);
    expect((await resend(req('/api/account/verify', 'POST', { email: 'nobody@example.com' }))).status).toBe(200);
    expect(state.sent).toHaveLength(1);
  });

  it('without email set up, sign-up signs straight in as before', async () => {
    delete process.env.RESEND_API_KEY;
    const created = await register(req('/api/account/register', 'POST', { email: 'lee@example.com', password: 'a good password' }));
    expect(await created.json()).toEqual({ ok: true });
    expect(state.sent).toHaveLength(0);
    expect(await authorize('lee@example.com', 'a good password')).toMatchObject({ email: 'lee@example.com' });
  });
});

describe('password reset', () => {
  it('emails a one-hour link, sets the new password once, and never reveals who has an account', async () => {
    await register(req('/api/account/register', 'POST', { email: 'ana@example.com', password: 'old password!' }));
    state.sent.length = 0;

    expect((await requestReset(req('/api/account/password-reset', 'POST', { email: 'ghost@example.com' }))).status).toBe(200);
    expect(state.sent).toHaveLength(0);

    expect((await requestReset(req('/api/account/password-reset', 'POST', { email: 'ana@example.com' }))).status).toBe(200);
    const url = linkIn(state.sent[0]);
    expect(url.pathname).toBe('/reset-password');
    const token = url.searchParams.get('token');

    const done = await completeReset(req('/api/account/password-reset', 'PUT', { email: 'ana@example.com', token, password: 'brand new pass' }));
    expect(done.status).toBe(200);
    // Reading the email proved the address, so the new password signs in.
    expect(await authorize('ana@example.com', 'brand new pass')).toMatchObject({ email: 'ana@example.com' });
    expect(await authorize('ana@example.com', 'old password!')).toBeNull();

    const reused = await completeReset(req('/api/account/password-reset', 'PUT', { email: 'ana@example.com', token, password: 'another pass!' }));
    expect(reused.status).toBe(400);
  });

  it('refuses a made-up token', async () => {
    await register(req('/api/account/register', 'POST', { email: 'jo@example.com', password: 'a good password' }));
    const res = await completeReset(req('/api/account/password-reset', 'PUT', { email: 'jo@example.com', token: 'x'.repeat(43), password: 'brand new pass' }));
    expect(res.status).toBe(400);
  });
});
