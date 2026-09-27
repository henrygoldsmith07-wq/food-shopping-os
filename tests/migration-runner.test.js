import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
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

describe('repository hygiene — migrations and submodules', () => {
  const root = process.cwd();
  it('has no nested migration directory', () => {
    expect(existsSync(join(root, 'scripts', 'migrations', 'migrations'))).toBe(false);
  });
  it('has no duplicated migration file names anywhere under scripts/migrations', () => {
    const seen = new Map();
    const dups = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) { walk(p); continue; }
        if (!entry.name.endsWith('.mjs')) continue;
        if (seen.has(entry.name)) dups.push(`${entry.name}: ${seen.get(entry.name)} vs ${p}`);
        else seen.set(entry.name, p);
      }
    };
    walk(join(root, 'scripts', 'migrations'));
    expect(dups).toEqual([]);
  });
  it('keeps tracked gitlinks backed by a .gitmodules entry', () => {
    // A gitlink (mode 160000) with no .gitmodules entry is an accidental
    // submodule: an empty directory for everyone who clones. The stale
    // `arise` entry (no .gitmodules, empty dir, zero code references) was
    // removed; this guards the invariant generally rather than one path.
    let staged = '';
    try { staged = execSync('git ls-files --stage', { cwd: root, encoding: 'utf8', timeout: 15000 }); } catch { staged = ''; }
    const gitlinks = staged.split('\n').filter((line) => line.startsWith('160000'));
    if (!gitlinks.length) return;
    expect(existsSync(join(root, '.gitmodules'))).toBe(true);
    const gitmodules = readFileSync(join(root, '.gitmodules'), 'utf8');
    for (const line of gitlinks) {
      const path = line.split('\t')[1];
      expect(gitmodules, `gitlink ${path} has no .gitmodules mapping`).toContain(path);
    }
  });
});

