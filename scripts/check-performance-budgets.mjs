import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(path.join(root, 'scripts', 'performance-budgets.json'), 'utf8'));
const requireBuilds = process.argv.includes('--require-builds');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).replace(/\\/g, '/') : null;
const failures = [];

function bytesIn(target) {
  const stat = statSync(target);
  if (stat.isFile()) return stat.size;
  return readdirSync(target, { withFileTypes: true })
    .reduce((total, entry) => total + bytesIn(path.join(target, entry.name)), 0);
}

const budgets = (config.budgets ?? []).filter((budget) => !only || budget.path.startsWith(only));
if (only && budgets.length === 0) failures.push(`No performance budget matches ${only}`);

for (const budget of budgets) {
  const target = path.join(root, budget.path);
  if (!existsSync(target)) {
    const message = `${budget.name}: build output is missing at ${budget.path}`;
    if (requireBuilds) failures.push(message);
    else console.warn(`SKIP ${message}`);
    continue;
  }
  const actual = bytesIn(target);
  const status = actual <= budget.maxBytes ? 'OK  ' : 'FAIL';
  console.log(`${status} ${budget.name}: ${actual} / ${budget.maxBytes} bytes`);
  if (actual > budget.maxBytes) failures.push(`${budget.name} exceeds its ${budget.maxBytes}-byte budget`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}