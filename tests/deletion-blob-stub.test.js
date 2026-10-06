import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
  deleteHouseholdData: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({ del: mocks.del }));
vi.mock('../src/server/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rateLimit: mocks.rateLimit,
  requireUser: mocks.requireUser,
}));
vi.mock('../src/server/households.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireHousehold: mocks.requireHousehold,
  deleteHouseholdData: mocks.deleteHouseholdData,
}));
vi.mock('../src/server/database.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDatabase: mocks.getDatabase,
}));

const { DELETE } = await import('../src/app/api/households/route.js');

const request = () => new Request('https://forq.example/api/households', {
  method: 'DELETE',
  headers: {
    origin: 'https://forq.example',
    'x-forq-household-id': '507f1f77bcf86cd799439011',
  },
});

describe('Blob deletion stub (missing credentials)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 'user-1' });
    mocks.requireHousehold.mockResolvedValue({
      household: { _id: 'household-1', ownerId: 'user-1' },
      membership: { role: 'owner' },
    });
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('fails closed with 503 when receipt blobs remain but no token is configured', async () => {
    const db = {
      collection: vi.fn((name) => (name === 'uploads'
        ? { find: () => ({ toArray: async () => [{ pathname: 'receipts/h1/a.pdf' }] }) }
        : { deleteOne: vi.fn(), updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }), insertOne: vi.fn() })),
    };
    mocks.getDatabase.mockResolvedValue(db);
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/not configured/i) });
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.deleteHouseholdData).not.toHaveBeenCalled();
  });

  it('deletes without a token when no receipt blobs remain', async () => {
    const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const insertOne = vi.fn().mockResolvedValue({ insertedId: 'audit-1' });
    const db = {
      collection: vi.fn((name) => (name === 'uploads'
        ? { find: () => ({ toArray: async () => [] }) }
        : { deleteOne, updateOne, insertOne })),
    };
    mocks.getDatabase.mockResolvedValue(db);
    mocks.deleteHouseholdData.mockResolvedValue({ uploads: 0 });
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
