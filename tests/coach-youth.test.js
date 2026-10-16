import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Under-18 coach-share protection, enforced server-side — not just hidden in
 * the UI. A tampered client asking for the health scope gets a refusal at
 * creation, and links created before this check stop serving health once the
 * household state shows under-18 mode.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
  collections: {},
}));

vi.mock('../src/server/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireUser: mocks.requireUser,
  rateLimit: vi.fn(),
}));
vi.mock('../src/server/households.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireHousehold: mocks.requireHousehold,
}));
vi.mock('../src/server/database.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDatabase: vi.fn(async () => ({
    collection: (name) => mocks.collections[name] || {
      findOne: vi.fn(async () => null),
      insertOne: vi.fn(async () => ({ insertedId: 'mock-id' })),
      updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    },
  })),
}));

const YOUTH_STATE = { body: { age: 15 }, members: [] };
const ADULT_STATE = { body: { age: 30 }, members: [] };
const ADMIN = { role: 'admin', permissions: ['shopping', 'pantry', 'recipes', 'health', 'admin'] };

const post = (body) => new Request('https://forq.example/api/coach-shares', {
  method: 'POST',
  headers: { origin: 'https://forq.example', 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('coach-share under-18 protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.collections)) delete mocks.collections[key];
    process.env.FORQ_COACH_SHARES_ENABLED = 'true';
    vi.resetModules();
    mocks.requireUser.mockResolvedValue({ id: 'u1' });
    mocks.requireHousehold.mockResolvedValue({ household: { _id: 'h1' }, membership: ADMIN });
  });

  it('refuses the health scope for an under-18 household without storing anything', async () => {
    const insertOne = vi.fn(async () => ({ insertedId: 's1' }));
    mocks.collections.householdStates = { findOne: vi.fn(async () => ({ state: YOUTH_STATE })) };
    mocks.collections.coachShares = { insertOne };
    const shares = await import('../src/app/api/coach-shares/route.js');
    const res = await shares.POST(post({ label: 'Coach', scopes: ['diary', 'health'], expiresInDays: 7 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/under-18/i) });
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('still issues diary-only links for an under-18 household', async () => {
    const insertOne = vi.fn(async () => ({ insertedId: 's1' }));
    mocks.collections.householdStates = { findOne: vi.fn(async () => ({ state: YOUTH_STATE })) };
    mocks.collections.coachShares = { insertOne };
    mocks.collections.auditEvents = { insertOne: vi.fn(async () => ({})) };
    const shares = await import('../src/app/api/coach-shares/route.js');
    const res = await shares.POST(post({ label: 'Coach', scopes: ['diary'], expiresInDays: 7 }));
    expect(res.status).toBe(201);
    expect(insertOne).toHaveBeenCalled();
    expect(insertOne.mock.calls[0][0].scopes).toEqual(['diary']);
  });

  it('issues health links for adult households as before', async () => {
    const insertOne = vi.fn(async () => ({ insertedId: 's1' }));
    mocks.collections.householdStates = { findOne: vi.fn(async () => ({ state: ADULT_STATE })) };
    mocks.collections.coachShares = { insertOne };
    mocks.collections.auditEvents = { insertOne: vi.fn(async () => ({})) };
    const shares = await import('../src/app/api/coach-shares/route.js');
    const res = await shares.POST(post({ label: 'Coach', scopes: ['diary', 'health'], expiresInDays: 7 }));
    expect(res.status).toBe(201);
  });

  it('strips health from old links once the household is under-18', async () => {
    const share = {
      _id: 's1', householdId: 'h1', label: 'Coach', scopes: ['diary', 'health'],
      revokedAt: null, expiresAt: new Date(Date.now() + 86400000), viewCount: 0,
    };
    mocks.collections.coachShares = { findOne: vi.fn(async () => share), updateOne: vi.fn(async () => ({})) };
    mocks.collections.households = { findOne: vi.fn(async () => ({ name: 'H' })) };
    mocks.collections.householdStates = { findOne: vi.fn(async () => ({ state: YOUTH_STATE, version: 3 })) };
    mocks.collections.auditEvents = { insertOne: vi.fn(async () => ({})) };
    const server = await import('../src/server/coach-shares.js');
    const viewed = await server.readCoachShare('t'.repeat(45));
    expect(viewed.scopes).toEqual(['diary']);
    expect(viewed.data.health).toBeUndefined();
  });

  it('keeps serving health on old links for adult households', async () => {
    const share = {
      _id: 's1', householdId: 'h1', label: 'Coach', scopes: ['diary', 'health'],
      revokedAt: null, expiresAt: new Date(Date.now() + 86400000), viewCount: 0,
    };
    mocks.collections.coachShares = { findOne: vi.fn(async () => share), updateOne: vi.fn(async () => ({})) };
    mocks.collections.households = { findOne: vi.fn(async () => ({ name: 'H' })) };
    mocks.collections.householdStates = {
      findOne: vi.fn(async () => ({ state: { ...ADULT_STATE, body: { weightKg: 70 } }, version: 3 })),
    };
    mocks.collections.auditEvents = { insertOne: vi.fn(async () => ({})) };
    const server = await import('../src/server/coach-shares.js');
    const viewed = await server.readCoachShare('t'.repeat(45));
    expect(viewed.scopes).toEqual(['diary', 'health']);
    expect(viewed.data.health.body).toEqual({ weightKg: 70 });
  });
});
