import { getDatabase } from '../src/server/database.js';

const db = await getDatabase();
await db.command({ ping: 1 });
const migrations = await db.collection('migrations').find({}).sort({ appliedAt: 1 }).toArray();
console.log(JSON.stringify({ database: db.databaseName, connected: true, migrations: migrations.map((item) => item._id) }, null, 2));
