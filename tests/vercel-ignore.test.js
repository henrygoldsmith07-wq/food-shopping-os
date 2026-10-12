/**
 * The Vercel Ignored Build Step.
 *
 * Both `vercel.json` files point at scripts/vercel-ignore.mjs with
 * `--project <name>`, and the script was missing — so production sat on a
 * build from October while every push looked like it had shipped. Vercel runs
 * the command from the repo root and treats a command that cannot run as
 * neither a skip nor a build, so the deployment simply never progresses.
 *
 * The contract is the inverse of shell intuition, which is the whole reason
 * this file needs its own test:
 *
 *   exit 0  →  ignore this build
 *   exit 1  →  build
 *
 * So every uncertain path must exit 1. A needless build costs a deployment
 * slot; a wrong skip leaves production stale, and stale production is the
 * failure this script exists to prevent.
 *
 * These run against a scratch repository built in the OS temp directory, so
 * the assertions are about the script's real git behaviour rather than about
 * this checkout's history.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NODE = process.execPath;

/**
 * The script's path, resolved from the working directory Vitest runs tests in.
 *
 * Deliberately not `import.meta.url`: Vitest can hand that a non-file scheme,
 * and a repo path containing a space (`henry ai project`) arrives
 * percent-encoded, so slicing or converting the URL is unreliable here. Either
 * mistake makes Node fail to find the script, which exits 1 on every case and
 * reads as "always build" — a passing-looking test that asserts nothing.
 */
const SCRIPT = resolve(process.cwd(), 'scripts', 'vercel-ignore.mjs');

/**
 * Run the ignore script inside `cwd`, returning its exit code.
 *
 * Spawned as an argument array with no shell. Joining the command into a string
 * for `shell: true` looks simpler but breaks on the space in this repo's own
 * path (`henry ai project`) — Node then cannot find the script, every case
 * exits 1, and the suite reads as "always builds" while asserting nothing.
 */
const runIgnore = (cwd, args = [], env = {}) => {
  try {
    execFileSync(NODE, [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...env },
    });
    return 0;
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1;
  }
};

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const commitAll = (cwd, message) => {
  git(cwd, 'add', '-A');
  git(cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=Test', 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
};

/**
 * A two-project repo shaped like this one: an app, plus a marketing site in
 * its own directory that only deploys when it changes.
 */
let repo;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'forq-ignore-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 'Test');
  mkdirSync(join(repo, 'forq-site'), { recursive: true });
  writeFileSync(join(repo, 'app.js'), 'export const app = 1;\n');
  writeFileSync(join(repo, 'forq-site', 'index.html'), '<h1>site</h1>\n');
  commitAll(repo, 'first');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('vercel ignoreCommand', () => {
  it('builds the app when the app changed, and skips the site', () => {
    writeFileSync(join(repo, 'app.js'), 'export const app = 2;\n');
    commitAll(repo, 'app change');

    // exit 1 = build. The app is the thing that moved.
    expect(runIgnore(repo, ['--project', 'food-shopping-os'])).toBe(1);
    // exit 0 = skip. Nothing in the site's own directory moved.
    expect(runIgnore(repo, ['--project', 'forq-site'])).toBe(0);
  });

  it('builds the site when only the site changed, and skips the app', () => {
    writeFileSync(join(repo, 'forq-site', 'index.html'), '<h1>site v2</h1>\n');
    commitAll(repo, 'site change');

    expect(runIgnore(repo, ['--project', 'forq-site'])).toBe(1);
    expect(runIgnore(repo, ['--project', 'food-shopping-os'])).toBe(0);
  });

  it('fails open to a build for an unknown project rather than skipping it', () => {
    writeFileSync(join(repo, 'app.js'), 'export const app = 3;\n');
    commitAll(repo, 'another app change');

    // A new deploy target must never be silently unbuilt.
    expect(runIgnore(repo, ['--project', 'something-new'])).toBe(1);
    // …and the same for a missing argument entirely.
    expect(runIgnore(repo, [])).toBe(1);
  });

  it('builds when there is no previous deployment to compare against', () => {
    // VERCEL_GIT_PREVIOUS_SHA is empty on a branch's first deployment. With no
    // base there is no evidence anything is unchanged.
    expect(runIgnore(repo, ['--project', 'food-shopping-os'], { VERCEL_GIT_PREVIOUS_SHA: '' }))
      .toBe(1);
  });

  it('builds when the previous SHA is not present in this clone', () => {
    // Shallow clones do not carry every commit. A base that cannot be read is
    // not a base, and guessing "unchanged" would leave production stale.
    const missing = '0'.repeat(40);
    expect(runIgnore(repo, ['--project', 'food-shopping-os'], { VERCEL_GIT_PREVIOUS_SHA: missing }))
      .toBe(1);
  });

  it('uses the previous SHA when Vercel supplies one', () => {
    // Re-point the comparison at the very first commit: everything since then
    // changed, so the app must build and the site must build too.
    const first = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    expect(runIgnore(repo, ['--project', 'food-shopping-os'], { VERCEL_GIT_PREVIOUS_SHA: first }))
      .toBe(1);
    expect(runIgnore(repo, ['--project', 'forq-site'], { VERCEL_GIT_PREVIOUS_SHA: first }))
      .toBe(1);
  });

  it('skips the site when the latest commit did not touch it', () => {
    // Drive a site change, then an empty commit on top: from the empty commit's
    // point of view the site is unchanged, so its deployment is skipped while
    // the app - whose pathspec is the whole repo minus the site - still builds.
    writeFileSync(join(repo, 'forq-site', 'index.html'), '<h1>site v3</h1>\n');
    writeFileSync(join(repo, 'app.js'), 'export const app = 4;\n');
    commitAll(repo, 'site and app');
    expect(runIgnore(repo, ['--project', 'forq-site'])).toBe(1);

    git(repo, '-c', 'user.email=t@example.com', '-c', 'user.name=Test',
      'commit', '-q', '--allow-empty', '-m', 'empty');
    expect(runIgnore(repo, ['--project', 'forq-site'])).toBe(0);
    expect(runIgnore(repo, ['--project', 'food-shopping-os'])).toBe(0);
  });
});
