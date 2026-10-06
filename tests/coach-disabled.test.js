import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
  getDatabase: vi.fn(),
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
  getDatabase: mocks.getDatabase,
}));

describe('coach-share disabled by default', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FORQ_COACH_SHARES_ENABLED;
    vi.resetModules();
  });

  it('refuses to issue, list, view and revoke without the flag', async () => {
    const shares = await import('../src/app/api/coach-shares/route.js');
    const view = await import('../src/app/api/coach/[token]/route.js');
    mocks.requireUser.mockResolvedValue({ id: 'u1' });

    const post = await shares.POST(new Request('https://forq.example/api/coach-shares', {
      method: 'POST',
      headers: { origin: 'https://forq.example', 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Coach', scopes: ['plan'], expiresInDays: 7 }),
    }));
    expect(post.status).toBe(403);

    const get = await shares.GET(new Request('https://forq.example/api/coach-shares', {
      headers: { origin: 'https://forq.example' },
    }));
    expect(get.status).toBe(403);

    const del = await shares.DELETE(new Request('https://forq.example/api/coach-shares?id=507f1f77bcf86cd799439011', {
      method: 'DELETE',
      headers: { origin: 'https://forq.example' },
    }));
    expect(del.status).toBe(403);

    const read = await view.GET(new Request('https://forq.example/api/coach/x'), { params: Promise.resolve({ token: 'x'.repeat(45) }) });
    expect(read.status).toBe(403);
  });
});
