import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  put: vi.fn(),
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({ del: mocks.del, put: mocks.put }));
vi.mock('../src/server/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rateLimit: mocks.rateLimit,
  requireUser: mocks.requireUser,
}));
vi.mock('../src/server/households.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireHousehold: mocks.requireHousehold,
}));
vi.mock('../src/server/database.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDatabase: mocks.getDatabase,
}));

const { POST } = await import('../src/app/api/uploads/receipt/route.js');

// The route only reads headers, the URL, and formData() — and undici's
// multipart parser rejects jsdom Files, so hand it a request-shaped object.
const receiptRequest = (file) => ({
  url: 'https://forq.example/api/uploads/receipt',
  headers: new Headers({
    origin: 'https://forq.example',
    'x-forq-household-id': 'h-1',
    'content-length': String(file.size || 0),
  }),
  formData: async () => new Map([['file', file]]),
});

describe('POST /api/uploads/receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 'user-1', name: 'Ada' });
    mocks.requireHousehold.mockResolvedValue({
      household: { _id: 'h-1' },
      membership: { role: 'owner' },
    });
    mocks.put.mockResolvedValue({ url: 'https://blob.example/x', pathname: 'receipts/h-1/p.pdf' });
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-token';
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('audits a private receipt upload against the household', async () => {
    const householdFindOne = vi.fn().mockResolvedValue({ _id: 'h-1' });
    const uploadInsertOne = vi.fn().mockResolvedValue({ insertedId: 'u-1' });
    const auditInsertOne = vi.fn().mockResolvedValue({ insertedId: 'audit-1' });
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name) => {
        if (name === 'households') return { findOne: householdFindOne };
        if (name === 'uploads') return { insertOne: uploadInsertOne };
        return { insertOne: auditInsertOne };
      }),
    });

    const response = await POST(receiptRequest(new File(['%PDF-1.7'], 'rec.pdf', { type: 'application/pdf' })));

    expect(response.status).toBe(202);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^receipts\/h-1\//),
      expect.any(File),
      { access: 'private', addRandomSuffix: false },
    );
    expect(uploadInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      householdId: 'h-1', userId: 'user-1', kind: 'receipt', status: 'queued',
    }));
    expect(auditInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      householdId: 'h-1',
      actorId: 'user-1',
      action: 'receipt.uploaded',
      resource: 'u-1',
    }));
  });

  it('rejects a disallowed content type without storing a blob or an audit row', async () => {
    const auditInsertOne = vi.fn();
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name) => (name === 'auditEvents' ? { insertOne: auditInsertOne } : { findOne: vi.fn() })),
    });

    const response = await POST(receiptRequest(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })));

    expect(response.status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(auditInsertOne).not.toHaveBeenCalled();
  });
});
