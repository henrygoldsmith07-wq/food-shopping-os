import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  __resetBatchShapeForTests, __setKnownBalanceForTests, cliErrorBody,
  endpointFromDiscovery, fillGapsFromBatch, monidBalance, monidBatchPrices,
  monidPrices, monidOnPath, monidStatus, parseMonidJson, rowsFromMonidReply, runMonid,
} from '../src/server/monid-prices.js';

// Hermetic Monid tests: the CLI is force-enabled for this file only, and all
// persistent state lands in a throwaway temp file — never the developer's
// real ~/.forq, never the real CLI. tests/setup.js disables Monid globally;
// this file turns it back on and restores that before exiting.
const stateDir = mkdtempSync(join(tmpdir(), 'forq-monid-'));
const stateFile = join(stateDir, 'monid-state.json');
process.env.MONID_DISABLED = '';
process.env.MONID_STATE_FILE = stateFile;
afterAll(() => {
  delete process.env.MONID_FORCE_CONFIGURED;
  process.env.MONID_DISABLED = 'true';
  rmSync(stateDir, { recursive: true, force: true });
});

const execOk = (stdout) => (cmd, args, opts, cb) => cb(null, stdout, '');
const execFail = (message, extra = {}) => (cmd, args, opts, cb) => {
  const error = Object.assign(new Error(message), extra);
  cb(error, '', message);
};

describe('parseMonidJson', () => {
  it('parses plain JSON, fenced JSON, and chatty output', () => {
    expect(parseMonidJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseMonidJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseMonidJson('Here you go:\n{"a":1}\nDone.')).toEqual({ a: 1 });
    expect(parseMonidJson('no json here')).toBe(null);
    expect(parseMonidJson('')).toBe(null);
  });
});

describe('monidOnPath', () => {
  const original = process.env.MONID_DISABLED;
  afterEach(() => { if (original === undefined) delete process.env.MONID_DISABLED; else process.env.MONID_DISABLED = original; });

  it('respects the kill switch without shelling out', () => {
    process.env.MONID_DISABLED = 'true';
    expect(monidOnPath()).toBe(false);
    delete process.env.MONID_DISABLED;
    // On any dev machine PATH exists, so the sync probe finds *something*;
    // the assertion is about the switch, not about monid being installed.
    expect(typeof monidOnPath()).toBe('boolean');
  });
});

describe('rowsFromMonidReply', () => {
  const retailer = { id: 'tesco', name: 'Tesco' };

  it('maps products arrays and bare arrays to scraper row shape', () => {
    const reply = { products: [{ name: 'Baked beans 4x200g', price: '£1.25', url: 'https://x/y', offer: 'Clubcard' }] };
    const rows = rowsFromMonidReply(reply, { retailer, query: 'baked beans' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Baked beans 4x200g', price: 1.25, currency: 'GBP',
      source: 'monid', method: 'monid', retailerId: 'tesco', retailer: 'Tesco',
    });
    const bare = rowsFromMonidReply([{ name: 'Milk 2 pints', price: 1.1, title: 'ignored' }], { retailer, query: 'milk' });
    expect(bare[0].name).toBe('Milk 2 pints');
    expect(bare[0].price).toBe(1.1);
  });

  it('drops rows without a name or a plausible price, and caps the list', () => {
    const junk = { products: [{ name: '', price: 1 }, { name: 'X', price: 0 }, { name: 'Y', price: 9999 }, { name: 'Z', price: 2 }] };
    expect(rowsFromMonidReply(junk, { retailer, query: 'q' })).toHaveLength(1);
    const flood = { products: Array.from({ length: 30 }, (_, i) => ({ name: `p${i}`, price: 1 })) };
    expect(rowsFromMonidReply(flood, { retailer, query: 'q' })).toHaveLength(8);
  });
});

describe('runMonid', () => {
  it('treats CLI failure and timeout as statuses, never throws', async () => {
    const failed = await runMonid(['--version'], { execImpl: execFail('not found', { killed: true, signal: 'SIGTERM' }) });
    expect(failed).toMatchObject({ ok: false, status: 'timeout' });
    const errored = await runMonid(['--version'], { execImpl: execFail('boom') });
    expect(errored).toMatchObject({ ok: false, status: 'error' });
  });
});

describe('monidPrices', () => {
  beforeEach(() => { process.env.MONID_DISABLED = 'true'; });
  afterEach(() => { delete process.env.MONID_DISABLED; });

  it('is disabled without the CLI and says so instead of failing silently', async () => {
    const result = await monidPrices('baked beans', { execImpl: execOk('{}') });
    expect(result.status).toBe('disabled');
    expect(result.rows).toEqual([]);
    expect(result.note).toMatch(/monid keys add/i);
  });

  it('discovers an endpoint, runs it, and maps the reply', async () => {
    process.env.MONID_DISABLED = 'true'; // keep the probe quiet; exec drives everything
    // monidOnPath is consulted first; MONID_FORCE_CONFIGURED lets the test through.
    process.env.MONID_DISABLED = '';
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const calls = [];
    const exec = (cmd, args, opts, cb) => {
      calls.push(args.join(' '));
      // argv[0] is the CLI entry path once resolved; match on the subcommand.
      if (args.includes('discover')) cb(null, JSON.stringify({ results: [{ provider: 'apify', endpoint: '/grocery/scraper' }] }), '');
      else cb(null, JSON.stringify({ products: [{ name: 'Heinz beans', price: 0.95 }] }), '');
    };
    const result = await monidPrices('baked beans', { execImpl: exec });
    expect(calls[0]).toContain('discover');
    expect(result.status).toBe('ok');
    expect(result.provider).toBe('apify');
    expect(result.rows[0]).toMatchObject({ name: 'Heinz beans', price: 0.95, source: 'monid' });
    delete process.env.MONID_FORCE_CONFIGURED;
  });

  it('reports no-match when discovery finds nothing', async () => {
    delete process.env.MONID_DISABLED;
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const result = await monidPrices('xyzzy', { execImpl: execOk('{"results":[]}') });
    expect(result.status).toBe('no-match');
    delete process.env.MONID_FORCE_CONFIGURED;
  });
});

describe('monidBalance and monidStatus', () => {
  afterEach(() => {
    delete process.env.MONID_DISABLED;
    delete process.env.MONID_FORCE_CONFIGURED;
  });

  it('reads the balance when the CLI reports one', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const probed = await monidBalance({ execImpl: execOk('{"balance": 42}') });
    expect(probed).toEqual({ ok: true, balance: 42, currency: null });
  });

  it('is disabled without the CLI, and the status says so in words', async () => {
    process.env.MONID_DISABLED = 'true';
    expect(await monidBalance({ execImpl: execOk('{}') })).toEqual({ ok: false, reason: 'disabled' });
    const status = await monidStatus({ execImpl: execOk('{}') });
    expect(status.configured).toBe(false);
    expect(status.note).toMatch(/monid keys add/i);
  });

  it('reports a missing key as not configured — not as an unknown balance', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const status = await monidStatus({
      execImpl: (cmd, args, opts, cb) =>
        cb(new Error('exit 1'), '{"error":{"code":"AUTH_FAILED","message":"No active API key. Run \"monid keys add\" to configure one."}}', ''),
    });
    expect(status.configured).toBe(false);
    expect(status.note).toMatch(/keys add/i);
  });

  it('reports an unknown balance, never a zero, when the CLI cannot answer', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const status = await monidStatus({ execImpl: execFail('no key') });
    expect(status).toMatchObject({ configured: true, balance: null });
    expect(status.note).toMatch(/API key/i);
  });
});

describe('cliErrorBody', () => {
  it('prefers the CLI\'s JSON error body over stderr, and never returns nothing', () => {
    expect(cliErrorBody({ stdout: '{"error":{"code":"AUTH_FAILED","message":"No active API key."}}', stderr: 'Command failed' }))
      .toBe('No active API key.');
    expect(cliErrorBody({ stdout: '', stderr: 'ECONNRESET' })).toBe('ECONNRESET');
    expect(cliErrorBody({ stdout: '', stderr: '' })).toBe('no detail reported');
  });
});

describe('endpointFromDiscovery', () => {
  it('reads both CLI reply shapes and rejects empty results', () => {
    expect(endpointFromDiscovery('{"results":[{"provider":"apify","endpoint":"/g/s"}]}'))
      .toEqual({ provider: 'apify', endpoint: '/g/s' });
    expect(endpointFromDiscovery('[{"provider":"p","endpoint":"/e"}]'))
      .toEqual({ provider: 'p', endpoint: '/e' });
    expect(endpointFromDiscovery('{"results":[]}')).toBe(null);
    expect(endpointFromDiscovery('')).toBe(null);
  });
});

describe('monidBatchPrices', () => {
  afterEach(() => {
    delete process.env.MONID_DISABLED;
    delete process.env.MONID_FORCE_CONFIGURED;
  });

  it('prices a whole list with one discover and one run, attributed per item', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const calls = [];
    const exec = (cmd, args, opts, cb) => {
      calls.push(args[0] === process.execPath ? args[1] : args[0]);
      if (args.includes('discover')) cb(null, '{"results":[{"provider":"apify","endpoint":"/g/s"}]}', '');
      else cb(null, JSON.stringify({ products: [
        { name: 'Heinz baked beans 415g', price: 0.95 },
        { name: 'Semi-skimmed milk 2 pints', price: 1.19 },
        { name: 'DVD player', price: 49.99 },
      ] }), '');
    };
    const batch = await monidBatchPrices(['baked beans', 'semi-skimmed milk', 'eggs'], { execImpl: exec });
    expect(batch.ok).toBe(true);
    expect(batch.byQuery.get('baked beans')).toHaveLength(1);
    expect(batch.byQuery.get('semi-skimmed milk')).toHaveLength(1);
    expect(batch.byQuery.get('eggs')).toEqual([]); // asked, answered, nothing matched
    expect(batch.rows.some((row) => row.name === 'DVD player')).toBe(false); // unmatched dropped
    expect(batch.byQuery.get('baked beans')[0].query).toBe('baked beans');
  });

  it('fails as one status for the whole batch when the CLI fails', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const batch = await monidBatchPrices(['eggs'], { execImpl: execFail('boom') });
    expect(batch.ok).toBe(false);
    expect(batch.status).toBe('error');
    expect(batch.byQuery.size).toBe(0);
  });

  it('is disabled without the CLI', async () => {
    process.env.MONID_DISABLED = 'true';
    const batch = await monidBatchPrices(['eggs'], { execImpl: execOk('{}') });
    expect(batch).toMatchObject({ ok: false, status: 'disabled' });
  });

  it('reports a missing key as disabled with the fix, not a generic error', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __resetBatchShapeForTests();
    const batch = await monidBatchPrices(['eggs'], {
      execImpl: (cmd, args, opts, cb) =>
        cb(new Error('exit 1'), '{"error":{"code":"AUTH_FAILED","message":"No active API key."}}', ''),
    });
    expect(batch).toMatchObject({ ok: false, status: 'disabled' });
    expect(batch.note).toMatch(/keys add/);
  });

  it('retries the next payload shape when the endpoint rejects the input', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __resetBatchShapeForTests();
    const runs = [];
    const exec = (cmd, args, opts, cb) => {
      if (args.includes('discover')) {
        cb(null, '{"results":[{"provider":"apify","endpoint":"/g/s"}]}', '');
      } else {
        runs.push(JSON.parse(args[args.indexOf('-i') + 1]));
        if (runs.length === 1) cb(new Error('run failed'), '', 'Error: input validation failed: missing field `items`');
        else cb(null, JSON.stringify({ products: [{ name: 'eggs x6', price: 1.35 }] }), '');
      }
    };
    const batch = await monidBatchPrices(['eggs'], { execImpl: exec });
    expect(batch.ok).toBe(true);
    expect(runs.map((r) => Object.keys(r)[0])).toEqual(['queries', 'items']);
    expect(batch.shape).toBe('items');
  });

  it('does not re-send different JSON when the failure is not about the payload', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __resetBatchShapeForTests();
    let runs = 0;
    const exec = (cmd, args, opts, cb) => {
      if (args.includes('discover')) cb(null, '{"results":[{"provider":"apify","endpoint":"/g/s"}]}', '');
      else { runs += 1; cb(new Error('run failed'), '', 'Error: 401 unauthorized: bad API key'); }
    };
    const batch = await monidBatchPrices(['eggs'], { execImpl: exec });
    // A 401 is an auth failure, not a payload problem: reported as-is (one
    // run, no shape retry) and mapped to the honest "no working key" state.
    expect(batch).toMatchObject({ ok: false, status: 'disabled' });
    expect(batch.note).toMatch(/keys add/);
    expect(runs).toBe(1);
  });

  it('persists the learned shape so a cold start skips the ladder', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    rmSync(stateFile, { force: true }); // start from a genuinely cold state
    __resetBatchShapeForTests({ allowPersisted: true });
    let runs = 0;
    const exec = (cmd, args, opts, cb) => {
      if (args.includes('discover')) cb(null, '{"results":[{"provider":"apify","endpoint":"/g/s"}]}', '');
      else {
        runs += 1;
        if (runs === 1) cb(new Error('run failed'), '', 'Error: input invalid: unknown field `queries`');
        else cb(null, JSON.stringify({ products: [{ name: 'eggs x6', price: 1.35 }] }), '');
      }
    };
    const first = await monidBatchPrices(['eggs'], { execImpl: exec });
    expect(first.shape).toBe('items');
    // The winner was written to the state file...
    const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
    expect(saved.batchShape).toBe('items');
    // ...and a fresh module instance reads it back instead of re-walking.
    vi.resetModules();
    const fresh = await import('../src/server/monid-prices.js');
    fresh.__resetBatchShapeForTests({ allowPersisted: true });
    const second = await fresh.monidBatchPrices(['eggs'], { execImpl: exec });
    expect(second).toMatchObject({ ok: true, shape: 'items' });
    expect(runs).toBe(3); // learned once; the cold start went straight to `items`
  });

  it('remembers the working shape for the rest of the process', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __resetBatchShapeForTests();
    let runs = 0;
    const exec = (cmd, args, opts, cb) => {
      if (args.includes('discover')) cb(null, '{"results":[{"provider":"apify","endpoint":"/g/s"}]}', '');
      else {
        runs += 1;
        if (runs === 1) cb(new Error('run failed'), '', 'Error: input invalid: unknown field `queries`');
        else cb(null, JSON.stringify({ products: [{ name: 'eggs x6', price: 1.35 }] }), '');
      }
    };
    const first = await monidBatchPrices(['eggs'], { execImpl: exec });
    expect(first.shape).toBe('items');
    // Second call goes straight to the learned shape — no repeat of the 400.
    const second = await monidBatchPrices(['eggs'], { execImpl: exec });
    expect(second).toMatchObject({ ok: true, shape: 'items' });
    expect(runs).toBe(3); // runs only: (1 failed + 1 clean) in the first call, 1 clean in the second
  });
});

describe('low-balance auto-disable', () => {
  afterEach(() => {
    delete process.env.MONID_FORCE_CONFIGURED;
    delete process.env.MONID_MIN_BALANCE;
    __setKnownBalanceForTests(null);
    __resetBatchShapeForTests();
  });

  const discoverExec = (runsLeft = Infinity) => {
    let runs = 0;
    return (cmd, args, opts, cb) => {
      if (args.includes('discover')) cb(null, '{"results":[{"provider":"apify","endpoint":"/g/s"}]}', '');
      else {
        runs += 1;
        if (runs <= runsLeft) cb(null, JSON.stringify({ products: [{ name: 'eggs x6', price: 1.35 }] }), '');
        else cb(new Error('run failed'), '', 'Error: 402 payment required');
      }
    };
  };

  it('pauses the paid rung, with the fix in words, when credits run out', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __setKnownBalanceForTests(0);
    const batch = await monidBatchPrices(['eggs'], { execImpl: discoverExec() });
    expect(batch).toMatchObject({ ok: false, status: 'disabled' });
    expect(batch.note).toMatch(/paused.*top up/i);
    expect(batch.note).toMatch(/balance read re-enables/i);
  });

  it('does not pause on an unknown balance', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    const batch = await monidBatchPrices(['eggs'], { execImpl: discoverExec(1) });
    expect(batch.ok).toBe(true); // never read a balance — no pause
  });

  it('re-enables once a balance read sees credits again', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __setKnownBalanceForTests(0);
    const paused = await monidBatchPrices(['eggs'], { execImpl: execOk('{}') });
    expect(paused.status).toBe('disabled');
    __setKnownBalanceForTests(5);
    const live = await monidBatchPrices(['eggs'], { execImpl: discoverExec(1) });
    expect(live.ok).toBe(true);
  });

  it('respects MONID_MIN_BALANCE=0 as a switch for the check itself', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    process.env.MONID_MIN_BALANCE = '0';
    __setKnownBalanceForTests(0);
    const batch = await monidBatchPrices(['eggs'], { execImpl: discoverExec(1) });
    expect(batch.ok).toBe(true);
  });

  it('shows the paused state and balance in the status card', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __setKnownBalanceForTests(0);
    const status = await monidStatus({ execImpl: execOk('{"balance": 0}') });
    expect(status).toMatchObject({ configured: true, balance: 0, paused: true });
    expect(status.note).toMatch(/paused/i);
  });

  it('always reports paused: false when the rung is active', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __setKnownBalanceForTests(9);
    const status = await monidStatus({ execImpl: execOk('{"balance": 9}') });
    expect(status.paused).toBe(false);
  });

  it('does not pause single-item lookups either', async () => {
    process.env.MONID_FORCE_CONFIGURED = 'true';
    __setKnownBalanceForTests(0);
    const result = await monidPrices('eggs', { execImpl: execOk('{"results":[]}') });
    expect(result).toMatchObject({ status: 'disabled' });
    expect(result.note).toMatch(/paused/i);
  });
});

describe('fillGapsFromBatch', () => {
  const shopHit = (query) => ({
    query, status: 'ok', rows: [{ name: `${query} tin`, price: 0.9, source: 'scraped' }],
    cheapest: [{ name: `${query} tin`, price: 0.9 }], best: { name: `${query} tin`, price: 0.9 },
  });
  const gap = (query) => ({ query, status: 'no-match', rows: [], note: 'no matching price' });
  const batchOk = {
    ok: true, provider: 'apify', endpoint: '/g/s',
    byQuery: new Map([
      ['eggs', [{ name: 'Free range eggs x6', price: 1.35, source: 'monid', query: 'eggs' }]],
      ['oat milk', []],
    ]),
  };

  it('fills only unpriced items, recomputing best and cheapest', () => {
    const checks = [shopHit('baked beans'), gap('eggs'), gap('oat milk')];
    const { monidBatch, checks: filled } = fillGapsFromBatch(checks, batchOk);
    expect(monidBatch).toEqual({ provider: 'apify', endpoint: '/g/s', items: 2 });
    expect(filled[0].source).toBeUndefined(); // scraped item untouched
    expect(filled[1]).toMatchObject({ status: 'ok', source: 'monid' });
    expect(filled[1].best.price).toBe(1.35);
    expect(filled[1].monid).toEqual({ status: 'ok', provider: 'apify', rows: 1 });
    expect(filled[2].status).toBe('no-match'); // asked, nothing matched
    expect(filled[2].monid).toEqual({ status: 'no-match', provider: 'apify', rows: 0 });
  });

  it('stamps the failure status on every gap when the batch fails', () => {
    const checks = [shopHit('baked beans'), gap('eggs')];
    const { monidBatch, checks: filled } = fillGapsFromBatch(checks, { ok: false, status: 'timeout' });
    expect(monidBatch).toEqual({ status: 'timeout', items: 1, paused: false });
    expect(filled[1].monid).toEqual({ status: 'timeout', provider: null, rows: 0, paused: false });
    expect(filled[1].rows).toEqual([]); // nothing fabricated
  });

  it('returns a null summary when there are no gaps to fill', () => {
    const checks = [shopHit('baked beans')];
    expect(fillGapsFromBatch(checks, batchOk).monidBatch).toBe(null);
  });
});
