import { describe, expect, it } from 'vitest';
import { applyMigrations, validateMigrations } from '../scripts/migrate.mjs';

function fakeDatabase(existing = []) {
  const applied = [...existing];
  const operations = [];
  return {
    operations,
    collection(name) {
      if (name === 'migrations') {
        return {
          find: () => ({ toArray: async () => applied.map((_id) => ({ _id })) }),
          insertOne: async (record) => applied.push(record._id),
        };
      }
      return { mark: async (id) => operations.push(id) };
    },
  };
}

const migration = (id, action) => ({
  id,
  up: async (db) => db.collection('work').mark(action),
  down: async () => {},
});

describe('migration runner', () => {
  it('rejects duplicate or incomplete migration definitions before touching the database', () => {
    expect(() => validateMigrations([migration('001', 'a'), migration('001', 'b')])).toThrow('Duplicate migration id');
    expect(() => validateMigrations([{ id: '002', up: async () => {} }])).toThrow('missing down');
  });

  it('applies pending migrations in order and records only successful migrations', async () => {
    const db = fakeDatabase(['001']);
    const applied = await applyMigrations(db, [migration('001', 'ignored'), migration('002', 'second')], () => new Date('2026-08-18T10:00:00.000Z'));
    expect(applied).toEqual(['002']);
    expect(db.operations).toEqual(['second']);
  });

  it('does not record a migration when its up step fails', async () => {
    const db = fakeDatabase();
    const failing = {
      id: '003',
      up: async () => { throw new Error('DDL failed'); },
      down: async () => {},
    };
    await expect(applyMigrations(db, [failing])).rejects.toThrow('DDL failed');
    expect(await db.collection('migrations').find().toArray()).toEqual([]);
  });
});
