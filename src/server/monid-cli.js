/**
 * Talking to the Monid CLI.
 *
 * Everything here is plumbing: where the CLI is installed, how to spawn it
 * (Node's own executable against the JS entry — the npm shim is a .cmd file,
 * which execFile has refused since the CVE-2024-27980 hardening), how to read
 * its replies and its errors, and where this machine's learned facts live.
 * None of it decides anything about pricing; that is monid-prices.js.
 *
 * Two invariants the whole adapter leans on:
 *   - `runMonid` never throws; failure is a status, like every other rung.
 *   - stdout is kept on failure, because this CLI reports structured errors
 *     as JSON on stdout with exit 1 and an empty stderr — discarding it
 *     discards the only explanation of what went wrong.
 */

import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

/** A CLI call that has not answered within this is treated as dead, not hung. */
export const CLI_TIMEOUT_MS = 45000;

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
 * `execImpl` is injectable so the unit suite runs without a CLI installed.
 */
export const runMonid = async (args, { execImpl = execFile, timeoutMs = CLI_TIMEOUT_MS } = {}) => {
  const entry = monidEntry();
  const command = entry ? process.execPath : 'monid';
  const argv = entry ? [entry, ...args] : args;
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      execImpl(command, argv, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        // Keep stdout on failure too: this CLI reports structured errors as
        // JSON on stdout with exit 1 and an empty stderr, so discarding it
        // would discard the only explanation of what went wrong.
        if (error) reject(Object.assign(error, { stderr: String(stderr || ''), stdout: String(stdout || '') }));
        else resolve({ stdout: String(stdout || '') });
      });
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    const timedOut = error?.killed || error?.signal === 'SIGTERM';
    return {
      ok: false,
      stdout: String(error?.stdout || ''),
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

/**
 * Did the CLI fail because there is no active key? A shape retry cannot fix
 * that, and the pricing layer turns it into an honest "not configured".
 */
export const isAuthFailure = (run) => {
  const body = parseMonidJson(run?.stdout || '');
  const text = `${body?.error?.code || ''} ${body?.error?.message || ''} ${run?.stdout || ''} ${run?.stderr || ''}`;
  return /AUTH_FAILED|no active api key|unauthor/i.test(text);
};

/**
 * The most informative text a failed CLI call left behind.
 *
 * Preference order: the JSON error body on stdout (the CLI's structured
 * errors live there), then stderr, then a plain admission of ignorance.
 * Notes shown to users are built from this, so "Command failed" never
 * outranks "No active API key. Run monid keys add".
 */
export const cliErrorBody = (run) => {
  const body = parseMonidJson(run?.stdout || '');
  return String(body?.error?.message || body?.error?.code || run?.stderr || '').trim() || 'no detail reported';
};

/**
 * Machine-local memory for what this machine's Monid setup has learned:
 * the payload shape the endpoint accepted, and the last balance reading.
 * A JSON file under the home directory (MONID_STATE_FILE overrides) — Redis
 * is the wrong layer for per-machine facts, and losing the file only costs
 * one re-learned shape or one extra balance probe.
 */
const monidStateFile = () => process.env.MONID_STATE_FILE || join(homedir(), '.forq', 'monid-state.json');

export const readMonidState = () => {
  try { return JSON.parse(readFileSync(monidStateFile(), 'utf8')) || {}; } catch { return {}; }
};

export const writeMonidState = (patch) => {
  try {
    mkdirSync(dirname(monidStateFile()), { recursive: true });
    writeFileSync(monidStateFile(), JSON.stringify({ ...readMonidState(), ...patch }, null, 2));
  } catch { /* state is an optimization, never a dependency */ }
};

let persistedStateIgnored = false; // tests opt out of reading any persisted Monid state

/** Test isolation: forget what a live run on this machine learned. */
export const setIgnorePersistedState = (value) => { persistedStateIgnored = value; };

export const ignorePersistedState = () => persistedStateIgnored;
