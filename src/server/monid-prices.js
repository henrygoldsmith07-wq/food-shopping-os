/**
 * Monid as one rung of the price ladder.
 *
 * Monid is a hosted catalogue of scraping endpoints. When it is configured
 * (CLI installed and an API key added with `monid keys add`), a product the
 * app's own shop ladder could not price can still be looked up through it —
 * paid for from the workspace's Monid balance, so it is opt-in, not default.
 *
 * Deliberate shape: one exported async function that returns the same rows
 * the local scraper returns, plus a cheap `monidOnPath()` probe that never
 * shells out. Everything else is plumbing around those two facts:
 *   - `runMonid` never throws; failure is a status, like every other rung.
 *   - rows carry `source: 'monid'` so a price from Monid is never mistaken
 *     for one the app scraped itself.
 *   - `execImpl` is injectable so the unit suite runs without a CLI.
 */

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { isMatch } from './search-terms.js';

/** Cap rows like every other source, so a chatty endpoint cannot flood a list. */
const MAX_ROWS_PER_ENDPOINT = 8;
/** A CLI call that has not answered within this is treated as dead, not hung. */
const CLI_TIMEOUT_MS = 45000;

/**
 * Where npm may have put the global CLI. MONID_CLI_ROOT wins so a deployment
 * can point at its own install; the rest are the usual global prefixes.
 */
const candidateRoots = () => [
  process.env.MONID_CLI_ROOT,
  process.env.APPDATA ? join(process.env.APPDATA, 'npm') : null,
  join(homedir(), '.npm-global'),
  '/usr/local/lib',
  '/usr/lib',
].filter(Boolean);

/** The CLI's JS entry, found without shelling out. Null when absent. */
export const monidEntry = () => {
  for (const root of candidateRoots()) {
    const entry = join(root, 'node_modules', '@monid-ai', 'cli', 'dist', 'index.js');
    if (existsSync(entry)) return entry;
  }
  return null;
};

/**
 * Present and spawnable — a filesystem probe, safe on hot paths. The env
 * switches are for deployments: MONID_DISABLED=true turns Monid off even
 * where the CLI exists; MONID_FORCE_CONFIGURED is for tests with an
 * injected exec.
 */
export const monidOnPath = () => {
  if (process.env.MONID_DISABLED === 'true') return false;
  return Boolean(process.env.MONID_FORCE_CONFIGURED) || Boolean(monidEntry());
};

/**
 * Run `monid` and return its stdout. Never throws — failure is a status.
 *
 * The entry is spawned with Node itself: the npm shim is a .cmd file on
 * Windows, which execFile has refused to spawn since the CVE-2024-27980
 * hardening, and shell:true would reopen the injection surface that
 * hardening exists to close. Handing the JS entry to `process.execPath`
 * works on every platform with no quoting involved. `execImpl` is
 * injectable so the unit suite runs without a CLI installed.
 */
export const runMonid = async (args, { execImpl = execFile, timeoutMs = CLI_TIMEOUT_MS } = {}) => {
  const entry = monidEntry();
  const command = entry ? process.execPath : 'monid';
  const argv = entry ? [entry, ...args] : args;
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      execImpl(command, argv, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stderr: String(stderr || '') }));
        else resolve({ stdout: String(stdout || '') });
      });
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    const timedOut = error?.killed || error?.signal === 'SIGTERM';
    return {
      ok: false,
      stdout: '',
      stderr: String(error?.stderr || error?.message || 'monid failed'),
      status: timedOut ? 'timeout' : 'error',
    };
  }
};

/** First JSON value found in a reply that may be fenced, chatty or prefixed. */
export const parseMonidJson = (text = '') => {
  const raw = String(text).trim();
  if (!raw) return null;
  // Whole-string parse first: some CLI replies are bare arrays, and the
  // object-extraction fallback below would silently collapse one of those
  // to its first element.
  try {
    return JSON.parse(raw);
  } catch {
    // Not pure JSON; fall through to extraction.
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const clampPrice = (value) => {
  const price = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(price) && price > 0 && price <= 1000 ? Math.round(price * 100) / 100 : null;
};

/**
 * Map a Monid endpoint reply to the scraper's row shape.
 *
 * Accepts the two shapes Monid endpoints commonly return — a `products`
 * array, or a bare array — and passes through only what a price row needs.
 * Everything is verified at the boundary: a row without a name and a price
 * is dropped, not carried forward for someone else to trip over.
 */
export const rowsFromMonidReply = (reply, { retailer, query }) => {
  const products = Array.isArray(reply)
    ? reply
    : Array.isArray(reply?.products) ? reply.products : [];
  return products.slice(0, MAX_ROWS_PER_ENDPOINT).map((row) => {
    const name = typeof row?.name === 'string' ? row.name.trim() : String(row?.title || '').trim();
    const price = clampPrice(row?.price);
    if (!name || price === null) return null;
    return {
      name: name.slice(0, 200),
      price,
      currency: typeof row?.currency === 'string' && row.currency ? row.currency : 'GBP',
      url: typeof row?.url === 'string' ? row.url : (typeof row?.productUrl === 'string' ? row.productUrl : null),
      brand: typeof row?.brand === 'string' ? row.brand : null,
      packSize: typeof row?.packSize === 'string' ? row.packSize.slice(0, 40) : null,
      unitPrice: typeof row?.unitPrice === 'string' ? row.unitPrice.slice(0, 40) : null,
      offer: typeof row?.offer === 'string' ? row.offer.slice(0, 120) : null,
      inStock: typeof row?.inStock === 'boolean' ? row.inStock : null,
      method: 'monid',
      confidence: 'medium',
      // Named "Monid" when no shop is attached: the ranking and the basket
      // tables render a shop column, and a paid row with a blank name reads
      // as a glitch rather than as a different kind of source.
      retailerId: retailer?.id || 'monid',
      retailer: retailer?.name || 'Monid',
      query,
      wanted: query,
      source: 'monid',
      sourceLabel: 'Monid marketplace data',
      checkedAt: new Date().toISOString(),
    };
  }).filter(Boolean);
};

/**
 * Price one product through Monid.
 *
 * Returns the same envelope as a per-retailer result in price-scraper.js, so
 * callers can append it without reshaping anything: `{ retailerId, retailer,
 * rows, status, note }`. Statuses mirror the local ladder — `disabled` when
 * Monid is not set up, `error`/`timeout` when the CLI failed, `no-match` when
 * it answered with nothing usable, `ok` when there are rows.
 */
const discoverArgs = (query) => ['discover', '-q', `grocery product price ${query}`, '-l', '3', '-j'];

/**
 * The endpoint a discovery found, or null.
 *
 * The CLI has reported its top hit as `{"results":[...]}` and as a bare
 * array at different times; both are read here. `provider` and `endpoint`
 * are the only fields the `run` call needs, so only those are trusted.
 */
export const endpointFromDiscovery = (stdout) => {
  const discovered = parseMonidJson(String(stdout || ''));
  const first = Array.isArray(discovered)
    ? discovered[0]
    : Array.isArray(discovered?.results) ? discovered.results[0] : null;
  const provider = first?.provider || null;
  const endpoint = first?.endpoint || null;
  return provider && endpoint ? { provider, endpoint } : null;
};

/**
 * The input shapes a Monid endpoint might accept for a multi-item run.
 *
 * The SKILL.md does not pin one payload per endpoint, so the first live run
 * finds the truth empirically: `queries` is sent first, then `items`, then a
 * single `query`. A shape that produces an input-validation error is retried
 * with the next; a shape that answers — even empty — is the endpoint's
 * contract and is memoized for the process, so the ladder runs once per
 * deployment, not once per check.
 */
const BATCH_SHAPES = [
  { name: 'queries', body: (list) => ({ queries: list }) },
  { name: 'items', body: (list) => ({ items: list }) },
  { name: 'query', body: (list) => ({ query: list[0] }) },
];

const looksLikeInputError = (stderr = '') =>
  /input|schema|expected|required|missing|invalid|unknown field|unrecognized|validation/i.test(String(stderr));

let batchShapeName = null; // memoized across calls; null = not yet learned

/**
 * A whole list through Monid, one discover + one run.
 *
 * Per-product lookups cost a paid run each; this costs one discovery for the
 * list (the query that best matches a grocery-pricing endpoint wins) and one
 * run carrying every item. The reply's rows are attributed back to the item
 * they match, and every item is represented in the result — `no-match` where
 * nothing matched it — so a caller never has to wonder whether an item was
 * forgotten. Never throws; failure is one status for the whole batch, which
 * the caller spreads across its items.
 */
export const monidBatchPrices = async (queries = [], {
  execImpl = execFile, timeoutMs = CLI_TIMEOUT_MS,
} = {}) => {
  const wanted = [...new Set(queries.map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (!wanted.length) return { ok: false, status: 'no-match', note: 'Nothing to look up.', byQuery: new Map() };
  if (!monidOnPath()) return { ok: false, status: 'disabled', note: 'Monid is not set up.', byQuery: new Map() };

  // The discovery query is the list's own shape, not one item's: a list of
  // milks should surface a grocery endpoint, and it does not take four
  // separate paid discoveries to learn what one free discovery already says.
  const discoveryQuery = wanted.slice(0, 3).join(', ');
  const run = await runMonid(discoverArgs(discoveryQuery), { execImpl, timeoutMs });
  if (!run.ok) return { ok: false, status: run.status, note: `Monid discovery failed: ${run.stderr.slice(0, 200)}`, byQuery: new Map() };

  const endpoint = endpointFromDiscovery(run.stdout);
  if (!endpoint) return { ok: false, status: 'no-match', note: 'Monid has no matching endpoint for this list.', byQuery: new Map() };

  // Send the memoized shape if a previous run learned one; otherwise walk
  // the ladder. Each rung only runs when the last failure looked like a
  // payload problem — a failure that is not about the input (rate limit,
  // auth, network) is reported as-is rather than retried with new JSON.
  const shapeOrder = batchShapeName
    ? BATCH_SHAPES.filter((shape) => shape.name === batchShapeName)
    : BATCH_SHAPES;
  let runOut = null;
  let usedShape = null;
  for (const shape of shapeOrder) {
    runOut = await runMonid([
      'run', '-p', endpoint.provider, '-e', endpoint.endpoint,
      '-i', JSON.stringify(shape.body(wanted)),
      '-w', '-j',
    ], { execImpl, timeoutMs });
    usedShape = shape.name;
    if (runOut.ok) { batchShapeName = shape.name; break; }
    if (!looksLikeInputError(runOut.stderr)) break;
  }
  if (!runOut.ok) {
    return {
      ok: false, provider: endpoint.provider, endpoint: endpoint.endpoint,
      status: runOut.status, note: `Monid run failed: ${runOut.stderr.slice(0, 200)}`, byQuery: new Map(),
    };
  }
  const payload = parseMonidJson(runOut.stdout);
  const rows = rowsFromMonidReply(payload, { retailer: null, query: '' });

  // Attribute each row to the item it answers, then give every item a verdict.
  // Unmatched rows are dropped from the answer entirely rather than shown
  // against the wrong item; the winning item's name goes on each kept row so
  // downstream provenance can scope it.
  const byQuery = new Map(wanted.map((entry) => [entry, []]));
  for (const row of rows) {
    const matches = wanted.filter((entry) => isMatch(row.name, entry));
    if (matches.length) byQuery.get(matches[0]).push({ ...row, query: matches[0] });
  }
  const kept = [...byQuery.values()].flat();
  return { ok: true, provider: endpoint.provider, endpoint: endpoint.endpoint, rows: kept, byQuery, shape: usedShape, status: 'ok' };
};

/**
 * Fold a batch answer back into the per-item checks it was asked for.
 *
 * Only items the shops left unpriced are touched, and the winner's rows
 * replace nothing but emptiness: scraped rows always outrank paid ones in
 * an item that has both. `best`/`cheapest` are recomputed on fill because
 * they were shaped before the batch answered. Returns a `monidBatch`
 * summary for the response body, and stamps `monid` on every gap item —
 * filled or not — so the provenance panel can show answered as well as
 * missed lookups.
 */
export const fillGapsFromBatch = (checks = [], batch) => {
  const priced = (check) => (check.rows || []).some((row) => row.price > 0);
  const gaps = [...new Set(checks.filter((check) => !priced(check)).map((check) => check.query))];
  if (!gaps.length) return { monidBatch: null, checks };
  if (!batch?.ok) {
    for (const check of checks) {
      if (!priced(check)) check.monid = { status: batch?.status || 'error', provider: null, rows: 0 };
    }
    return { monidBatch: { status: batch?.status || 'error', items: gaps.length }, checks };
  }
  for (const check of checks) {
    if (priced(check)) continue;
    const matched = batch.byQuery.get(check.query) || [];
    if (matched.length) {
      check.rows = matched;
      check.status = 'ok';
      check.note = null;
      check.source = 'monid';
      check.monid = { status: 'ok', provider: batch.provider, rows: matched.length };
      check.cheapest = [...matched].sort((a, b) => a.price - b.price);
      check.best = check.cheapest[0] || null;
    } else {
      check.monid = { status: 'no-match', provider: batch.provider, rows: 0 };
    }
  }
  return { monidBatch: { provider: batch.provider, endpoint: batch.endpoint, items: gaps.length }, checks };
};

export const monidPrices = async (query, {
  execImpl = execFile, retailer = null, timeoutMs = CLI_TIMEOUT_MS,
} = {}) => {
  const wanted = String(query || '').trim();
  const base = {
    retailerId: retailer?.id || 'monid',
    retailer: retailer?.name || 'Monid',
    query: wanted,
    wanted,
    rows: [],
    checkedAt: new Date().toISOString(),
    source: 'monid',
  };
  if (!wanted) return { ...base, status: 'no-match', note: 'Nothing to look up.' };
  if (!monidOnPath()) {
    return {
      ...base,
      status: 'disabled',
      note: 'Monid is not set up on this machine — install the CLI and run `monid keys add`. The local scraper is unchanged.',
    };
  }

  const run = await runMonid(discoverArgs(wanted), { execImpl, timeoutMs });
  if (!run.ok) {
    return { ...base, status: run.status, note: `Monid discovery failed: ${run.stderr.slice(0, 200)}` };
  }
  const found = endpointFromDiscovery(run.stdout);
  if (!found) {
    return { ...base, status: 'no-match', note: 'Monid has no matching endpoint for this product.' };
  }
  const provider = found.provider;
  const endpoint = found.endpoint;

  const args = ['run', '-p', provider, '-e', endpoint, '-i', JSON.stringify({ query: wanted }), '-w', '-j'];
  const runOut = await runMonid(args, { execImpl, timeoutMs });
  if (!runOut.ok) {
    return { ...base, provider, endpoint, status: runOut.status, note: `Monid run failed: ${runOut.stderr.slice(0, 200)}` };
  }
  const payload = parseMonidJson(runOut.stdout);
  const rows = rowsFromMonidReply(payload, { retailer, query: wanted });
  return {
    ...base,
    provider,
    endpoint,
    rows,
    status: rows.length ? 'ok' : 'no-match',
    note: rows.length ? null : 'Monid answered but reported no usable product prices.',
  };
};

/**
 * What is left in the workspace's Monid balance, in the CLI's own terms.
 *
 * Surfaces the cost side of the "we paid for this" label: a price fetched
 * through Monid spent the workspace's money, and the panel that displays the
 * provenance should be able to show what that is costing. Never throws — a
 * failed probe is `ok: false`, which the UI renders as "balance unknown".
 */
export const monidBalance = async ({ execImpl = execFile, timeoutMs = 15000 } = {}) => {
  if (!monidOnPath()) return { ok: false, reason: 'disabled' };
  const run = await runMonid(['balance', '-j'], { execImpl, timeoutMs });
  if (!run.ok) return { ok: false, reason: run.status };
  const parsed = parseMonidJson(run.stdout);
  if (!parsed) return { ok: false, reason: 'error' };
  // The CLI's shape: `balance` is a number of credits. Accept a couple of
  // spellings so a CLI tweak does not silently zero the display.
  const value = typeof parsed.balance === 'number' ? parsed.balance : Number(parsed.balance);
  if (Number.isFinite(value)) return { ok: true, balance: value, currency: parsed.currency || null };
  return { ok: false, reason: 'error' };
};

/**
 * One probe for the status UI: is Monid set up here at all, and if so, what
 * is left of its balance. Folded into one call so a status card makes a
 * single subprocess round-trip instead of three.
 */
export const monidStatus = async ({ execImpl = execFile } = {}) => {
  if (!monidOnPath()) {
    return {
      configured: false,
      balance: null,
      note: 'Monid is not set up — install the CLI and run `monid keys add` to enable paid lookups.',
    };
  }
  const probed = await monidBalance({ execImpl });
  return {
    configured: true,
    balance: probed.ok ? probed.balance : null,
    currency: probed.currency || null,
    note: probed.ok
      ? null
      : 'Balance unavailable — the CLI answered but did not report a number (is an API key configured?).',
  };
};
