import { getDatabase } from '../src/server/database.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as initial from './migrations/001-initial-backend.mjs';
import * as analyticsIdempotency from './migrations/002-analytics-idempotency.mjs';

export const migrations = [initial, analyticsIdempotency];

export function validateMigrations(list) {
  const ids = new Set();
  for (const migration of list) {
    if (!migration?.id || typeof migration.id !== 'string') throw new Error('Every migration needs a string id.');
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    if (typeof migration.up !== 'function') throw new Error(`${migration.id} is missing up().`);
    if (typeof migration.down !== 'function') throw new Error(`${migration.id} is missing down().`);
    ids.add(migration.id);
  }
  return list;
}

export async function applyMigrations(db, list = migrations, now = () => new Date()) {
  validateMigrations(list);
  const migrationCollection = db.collection('migrations');
  const applied = new Set((await migrationCollection.find({}, { projection: { _id: 1 } }).toArray())
    .map((migration) => migration._id));
  const appliedNow = [];

  for (const migration of list) {
    if (applied.has(migration.id)) continue;
    await migration.up(db);
    await migrationCollection.insertOne({ _id: migration.id, appliedAt: now() });
    applied.add(migration.id);
    appliedNow.push(migration.id);
  }
  return appliedNow;
}

async function main() {
  const db = await getDatabase();
  const applied = await applyMigrations(db);
  for (const id of applied) console.log(`Applied ${id}`);
  console.log('Database migrations are current.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
