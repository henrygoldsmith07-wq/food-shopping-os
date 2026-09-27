/**
 * Performance budgets.
 *
 * The old ceiling was a single number — all browser assets under 16 MB — which
 * is so far above the truth that nothing can ever fail it. These measure what
 * actually costs a first-time visitor time:
 *
 *   - the app + catalogue chunk, raw and gzipped: the wait before the week
 *     screen is usable
 *   - the largest single chunk, so a screen that can never load first doesn't
 *   - all browser assets, as the coarse backstop for a runaway dependency
 *   - the eagerly shipped catalogue source, the biggest thing in the bundle
 *   - the chunk count, to catch fragments nobody loads
 *
 * Every budget carries its reason in `performance-budgets.json`, so lowering
 * one is a deliberate act rather than a copy of a number.
 *
 *   node scripts/check-performance-budgets.mjs [--require-builds] [--only=<prefix>]
 *
 * Without `--require-builds` a missing build is a warning, so the check can
 * run before `next build`; with it, a missing build fails the build.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(path.join(root, 'scripts', 'performance-budgets.json'), 'utf8'));
const requireBuilds = process.argv.includes('--require-builds');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).replace(/\\/g, '/') : null;
const failures = [];

const bytesIn = (target) => {
  const stat = statSync(target);
  if (stat.isFile()) return stat.size;
  return readdirSync(target, { withFileTypes: true })
    .reduce((total, entry) => total + bytesIn(path.join(target, entry.name)), 0);
};

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/**
 * The chunks that carry the app and its data. Forq is a single client-rooted
 * page, so the honest measure of "what a first-time visitor waits for" is the
 * app chunk plus every chunk of catalogue and recipe data, not a guess at
 * which of the build's chunks the router happens to preload.
 *
 * They are found by strings only the data can contain — a generic food, a
 * signature dish and a generated recipe id. If a rename means none of them are
 * found, the measurement fails loudly rather than quietly passing at zero: a
 * budget nobody can trip is not a budget.
 */
const DATA_MARKERS = ['Wholemeal bread', 'Lemon Chicken Traybake', 'generated-double'];
const dataChunks = () => {
  const staticDir = path.join(root, '.next/static');
  const chunks = walk(staticDir).filter((file) => file.endsWith('.js'));
  if (!chunks.length) return null;
  const found = chunks.filter((file) => {
    const source = readFileSync(file, 'utf8');
    return DATA_MARKERS.some((marker) => source.includes(marker));
  });
  return { files: found, bytes: found.reduce((total, file) => total + statSync(file).size, 0) };
};

const appChunkBytes = () => {
  const found = dataChunks();
  if (!found) return null;
  return { bytes: found.bytes, detail: `${mb(found.bytes)} across ${found.files.length} chunks` };
};

/** What those chunks cost on the wire once gzipped — the number a phone feels. */
const appChunkGzipBytes = () => {
  const found = dataChunks();
  if (!found) return null;
  const bytes = found.files.reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
  return { bytes, detail: `${mb(bytes)} gzipped across ${found.files.length} chunks` };
};

const largestChunkBytes = () => {
  const staticDir = path.join(root, '.next/static');
  const chunks = walk(staticDir).filter((file) => file.endsWith('.js'));
  if (!chunks.length) return null;
  const biggest = chunks.reduce((best, file) => (statSync(file).size > statSync(best).size ? file : best), chunks[0]);
  return { bytes: statSync(biggest).size, detail: path.basename(biggest) };
};

/** Everything under src/data ships to the browser today — that is the point of it. */
const catalogueSourceBytes = () => {
  const dataDir = path.join(root, 'src/data');
  if (!existsSync(dataDir)) return null;
  return { bytes: bytesIn(dataDir), detail: `${readdirSync(dataDir).length} modules` };
};

const chunkCount = () => {
  const staticDir = path.join(root, '.next/static');
  const chunks = walk(staticDir).filter((file) => file.endsWith('.js'));
  if (!chunks.length) return null;
  return { bytes: chunks.length, detail: `${chunks.length} js chunks` };
};

const MEASURES = {
  appChunk: appChunkBytes,
  appChunkGzip: appChunkGzipBytes,
  largestChunk: largestChunkBytes,
  catalogueSource: catalogueSourceBytes,
  chunkCount,
};

const budgets = (config.budgets ?? [])
  .filter((budget) => !only || only === '.' || (budget.path || budget.measure || '').startsWith(only));
if (only && budgets.length === 0) failures.push(`No performance budget matches ${only}`);

for (const budget of budgets) {
  if (budget.measure) {
    const measured = MEASURES[budget.measure]?.();
    if (!measured) {
      if (requireBuilds) failures.push(`${budget.name}: nothing to measure — is the build output there?`);
      else console.warn(`SKIP ${budget.name}: nothing to measure yet`);
      continue;
    }
    const limit = budget.measure === 'chunkCount' ? budget.maxCount : budget.maxBytes;
    const status = measured.bytes <= limit ? 'OK  ' : 'FAIL';
    console.log(`${status} ${budget.name}: ${measured.detail} (limit ${limit})`);
    if (!measured.bytes) {
      failures.push(`${budget.name} measured nothing — the marker strings it looks for have probably been renamed, so this budget is no longer measuring anything`);
    } else if (measured.bytes > limit) {
      failures.push(`${budget.name} is ${measured.bytes}, over its ${limit} budget — ${budget.why || ''}`.trim());
    }
    continue;
  }
  const target = path.join(root, budget.path);
  if (!existsSync(target)) {
    const message = `${budget.name}: build output is missing at ${budget.path}`;
    if (requireBuilds) failures.push(message);
    else console.warn(`SKIP ${message}`);
    continue;
  }
  const actual = bytesIn(target);
  const status = actual <= budget.maxBytes ? 'OK  ' : 'FAIL';
  console.log(`${status} ${budget.name}: ${mb(actual)} / ${mb(budget.maxBytes)}`);
  if (actual > budget.maxBytes) {
    failures.push(`${budget.name} exceeds its ${budget.maxBytes}-byte budget — ${budget.why || ''}`.trim());
  }
}

if (failures.length) {
  console.error(`\n${failures.join('\n')}`);
  process.exit(1);
}
