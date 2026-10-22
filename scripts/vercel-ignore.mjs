#!/usr/bin/env node
/**
 * Vercel's Ignored Build Step, for the two projects that live in this repo.
 *
 *   food-shopping-os  the Next.js app — everything except the marketing site
 *   forq-site         the static marketing page — only its own directory
 *
 * Both `vercel.json` files point here with `--project <name>`, and this file
 * was missing, which is why production stopped deploying. Vercel runs the
 * ignoreCommand from the repo root; a command that cannot run at all is not a
 * skip and not a build, so the deployment simply never progresses.
 *
 * Vercel's contract, which is the inverse of the usual shell intuition:
 *
 *   exit 0  →  ignore this build
 *   exit 1  →  build
 *
 * So every uncertain path here exits 1. A build that turns out to be
 * unnecessary costs a deployment slot; a skip that was wrong leaves
 * production stale, and stale production is the failure this script exists to
 * prevent. When in doubt, build.
 *
 * The comparison base is VERCEL_GIT_PREVIOUS_SHA — the last successful
 * deployment for this project and branch. It is empty on a branch's first
 * deployment, and shallow clones may not contain it, so both cases fall back
 * to building rather than guessing that nothing changed.
 */

import { execFileSync } from 'node:child_process';

const BUILD = 1;
const SKIP = 0;

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

/**
 * True when anything under any of `paths` differs between base and HEAD.
 *
 * Each path is diffed on its own rather than through a magic pathspec like
 * `:(exclude)forq-site`. Magic pathspecs are shell-sensitive: spawned without
 * a shell they can reach git as literal filenames, which reports "changed" for
 * every commit and turns this script into a permanent build — the opposite
 * failure of the one it replaced, and quieter to notice.
 *
 * `--quiet` exits 1 when there IS a difference, the inverse of a boolean test,
 * so the exit status is read directly and the output is discarded.
 */
const changed = (base, paths) => {
  for (const path of paths) {
    try {
      execFileSync('git', ['diff', '--quiet', base, 'HEAD', '--', path], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      // Either a real difference (exit 1) or git could not run (exit 128+).
      // Both mean "build": a path git cannot compare is a path we cannot
      // claim is unchanged.
      return true;
    }
  }
  return false;
};

/**
 * Every tracked path the app owns: the whole repo, minus the marketing site's
 * own directory. Built from `git ls-files` rather than a pathspec expression so
 * it is platform-independent. Returns null when the repo cannot be enumerated,
 * and the caller treats that as "build".
 */
const appOwnedPaths = () => {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).split('\0').filter(Boolean);
  } catch {
    return null;
  }
  const owned = tracked.filter((file) => file !== 'forq-site' && !file.startsWith('forq-site/'));
  return owned.length ? owned : null;
};

/**
 * The project name, as passed by vercel.json's `--project <name>`.
 *
 * Both forms are accepted because the two configs in this repo are hand
 * maintained and the flag is easy to drop when someone edits one of them.
 * Anything unrecognised fails open to a build, never to a skip.
 */
const flagIndex = process.argv.indexOf('--project');
const project = flagIndex === -1 ? process.argv[2] : process.argv[flagIndex + 1];

if (project !== 'food-shopping-os' && project !== 'forq-site') {
  // An unrecognised project must never silently skip: that is how a new
  // deploy target ends up permanently unbuilt.
  console.error(`vercel-ignore: unknown project ${JSON.stringify(project)} — building.`);
  process.exit(BUILD);
}

// Without a git history there is nothing to compare, so there is no evidence
// anything is unchanged. Build.
if (!git('rev-parse', '--git-dir')) {
  console.error('vercel-ignore: not a git repository — building.');
  process.exit(BUILD);
}

const head = git('rev-parse', 'HEAD');
if (!head) {
  console.error('vercel-ignore: no HEAD — building.');
  process.exit(BUILD);
}

/** True when `ref` names a commit that exists in this clone. */
const hasCommit = (ref) => {
  try {
    // `cat-file -e` prints nothing and exits 0 when the object exists, so the
    // exit status is the only signal — its output must not be read as truth.
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
};

const base = process.env.VERCEL_GIT_PREVIOUS_SHA || git('rev-parse', 'HEAD^');
if (!base || !hasCommit(base)) {
  // First deployment on this branch, or a shallow clone that does not carry
  // the base commit. Building is the only honest answer.
  console.log(`vercel-ignore: ${project}: no comparable previous deployment — building.`);
  process.exit(BUILD);
}

// The same commit as the last deployment is a deliberate redeploy — almost
// always to pick up changed environment variables, which no diff can see.
// Skipping it would make "Redeploy" a no-op, so it always builds.
if (base === head) {
  console.log(`vercel-ignore: ${project}: redeploy of ${head.slice(0, 8)} — building.`);
  process.exit(BUILD);
}

// The app owns every tracked file except the marketing site's own directory;
// the marketing site owns only itself. `appOwnedPaths` returns null when the
// repo cannot be enumerated, and an unknown scope is a reason to build.
const paths = project === 'forq-site' ? ['forq-site'] : appOwnedPaths();
if (!paths || changed(base, paths)) {
  console.log(`vercel-ignore: ${project}: changes detected — building.`);
  process.exit(BUILD);
}

console.log(`vercel-ignore: ${project}: nothing relevant changed since ${base.slice(0, 8)} — skipping.`);
process.exit(SKIP);
