/**
 * Does the Monid rung actually work against the real endpoint?
 *
 * The unit suite proves the adapter's logic against a fake exec. That is a
 * different claim from "the real grocery endpoint accepts our JSON and
 * returns prices", and only a live call can settle it.
 *
 * This runs the shipped code — the same discovery, the same shape ladder,
 * the same attribution — for exactly one test item, and reports:
 *
 *   - whether the CLI and an API key are configured
 *   - which endpoint Monid discovered for a grocery-shaped query
 *   - WHICH PAYLOAD SHAPE the endpoint accepted (queries / items / query)
 *   - the rows that came back, attributed to the item
 *   - the credit balance, so you know what one probe cost
 *
 * Run this once after `monid keys add -k <key> -l main`. Whatever shape the
 * endpoint really wants, the ladder finds it on this first run and the
 * adapter remembers it for the process lifetime — so this probe is also the
 * cheapest way to teach a fresh deployment the right payload.
 *
 *   npm run check:monid
 *   npm run check:monid -- --item "oat milk 1l" --json
 *
 * Exit code 0 only if the batch answered ok.
 */

import { monidBatchPrices, monidBalance, monidOnPath, monidStatus } from '../src/server/monid-prices.js';

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const item = arg('item', 'baked beans');
const line = (char = '-') => console.log(char.repeat(78));

const status = await monidStatus();
const balance = status.configured ? await monidBalance() : { ok: false, reason: 'disabled' };

if (flag('json')) {
  const batch = monidOnPath() && status.configured ? await monidBatchPrices([item]) : null;
  console.log(JSON.stringify({ item, status, balance, batch }, null, 2));
  process.exit(batch?.ok ? 0 : 1);
}

console.log(`\nMonid reality check — one batch lookup for "${item}"`);
line('=');

if (!monidOnPath()) {
  console.log('CLI:      not found on PATH');
  console.log('Fix:      npm install -g @monid-ai/cli@latest, then rerun.');
  process.exit(1);
}
console.log('CLI:      found');

if (!status.configured) {
  console.log(`API key:  missing — ${status.note || 'run `monid keys add -k <key> -l main`'}`);
  process.exit(1);
}
console.log('API key:  configured');
console.log(`Balance:  ${balance.ok ? `${balance.balance} credits${balance.currency ? ` (${balance.currency})` : ''}` : 'unknown — the CLI would not report it'}`);
line();

const batch = await monidBatchPrices([item]);

if (!batch.ok) {
  console.log(`Batch:    FAILED (${batch.status})`);
  if (batch.note) console.log(`Note:     ${batch.note}`);
  console.log('\nThe stderr above is the endpoint telling us what it wanted.');
  console.log('If it names a field it expected, that is the shape to teach the ladder.');
  process.exit(1);
}

console.log(`Endpoint: ${batch.provider} ${batch.endpoint}`);
console.log(`Shape:    the endpoint accepted "${batch.shape}" as the payload key`);
console.log(`Rows:     ${batch.rows.length} attributed to "${item}"`);
for (const row of batch.rows.slice(0, 10)) {
  console.log(`  - ${(row.name || 'unnamed').slice(0, 58).padEnd(58)} ${row.price != null ? `£${row.price}` : 'no price'}  [${row.source}]`);
}
if (batch.rows.length > 10) console.log(`  … and ${batch.rows.length - 10} more`);
if (!batch.rows.length) {
  console.log('  (the endpoint answered, but nothing matched this item —');
  console.log('   the shape is proven, the catalogue just lacks this product)');
}
line();

const after = await monidBalance();
if (after.ok && balance.ok) {
  console.log(`Probe cost: ${Math.max(0, balance.balance - after.balance)} credit(s); ${after.balance} left.`);
}
process.exit(0);
