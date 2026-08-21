import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

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

describe('DELETE /api/households', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 'user-1' });
  });

  it('rejects a cross-origin deletion before checking the account', async () => {
    const response = await DELETE(new Request('https://forq.example/api/households', {
      method: 'DELETE',
      headers: { origin: 'https://attacker.example' },
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it('refuses deletion by anyone except the owner', async () => {
    mocks.requireHousehold.mockResolvedValue({
      household: { _id: 'household-1', ownerId: 'user-2' },
      membership: { role: 'adult' },
    });

    const response = await DELETE(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Only the household owner can delete its server data.' });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('deletes private receipt blobs before every household database record', async () => {
    const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const toArray = vi.fn().mockResolvedValue([{ pathname: 'receipts/household-1/file.pdf' }]);
    const db = {
      collection: vi.fn((name) => (name === 'uploads'
        ? { find: () => ({ toArray }) }
        : { deleteOne, updateOne })),
    };
    mocks.requireHousehold.mockResolvedValue({
      household: { _id: 'household-1', ownerId: 'user-1' },
      membership: { role: 'owner' },
    });
    mocks.getDatabase.mockResolvedValue(db);
    mocks.deleteHouseholdData.mockResolvedValue({ uploads: 1, householdStates: 1 });
    const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-token';

    try {
      const response = await DELETE(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ deleted: true, householdId: 'household-1' });
      expect(mocks.del).toHaveBeenCalledWith(
        ['receipts/household-1/file.pdf'],
        { token: 'blob-token' },
      );
      expect(updateOne).toHaveBeenCalledWith(
        { _id: 'household-1', ownerId: 'user-1', deletingAt: { $exists: false } },
        expect.objectContaining({ $set: { deletingAt: expect.any(Date) } }),
      );
      expect(mocks.deleteHouseholdData).toHaveBeenCalledWith(db, 'household-1');
      expect(deleteOne).toHaveBeenCalledWith({ _id: 'household-1', ownerId: 'user-1' });
      expect(mocks.del.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.deleteHouseholdData.mock.invocationCallOrder[0],
      );
    } finally {
      if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    }
  });
});
