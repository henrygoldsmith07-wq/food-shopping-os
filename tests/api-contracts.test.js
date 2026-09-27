import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parse } from '@babel/parser';

/**
 * API contract consistency: every JSON route shares the same guards instead
 * of route-specific ad-hoc patterns. Sanctioned exceptions are explicit:
 * read-only probes (no auth by design) and the cron route (bearer secret).
 */
const API_ROOT = join(process.cwd(), 'src', 'app', 'api');

const routeFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(p, out);
    else if (entry.name === 'route.js') out.push(p);
  }
  return out;
};

const importsOf = (file) => {
  const text = readFileSync(file, 'utf8');
  try {
    const ast = parse(text, { sourceType: 'module', plugins: ['jsx'] });
    return ast.program.body
      .filter((n) => n.type === 'ImportDeclaration')
      .map((n) => n.source.value);
  } catch {
    // Fallback for routes with syntax the parser rejects (e.g. [...nextauth]
    // in the path is fine, but exotic route code should not fail the guard):
    // a textual scan for the shared-module import is enough here.
    const hits = [];
    const re = /from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text))) hits.push(m[1]);
    return hits;
  }
};

// Routes that intentionally skip requireUser (documented in the file).
const NO_AUTH_ROUTES = new Set([
  'api/auth/[...nextauth]/route.js',
  'api/backend/status/route.js',
  'api/health/route.js',
  'api/readiness/route.js',
  'api/jobs/reminders/route.js', // cron bearer secret, not a session
  'api/coach/[token]/route.js', // token bearer, not a session
]);

// Routes that intentionally skip assertSameOrigin (GET-only probes, SSE
// streams that browsers open without Origin, token/cron bearers).
const NO_ORIGIN_ROUTES = new Set([
  'api/auth/[...nextauth]/route.js',
  'api/backend/status/route.js',
  'api/health/route.js',
  'api/readiness/route.js',
  'api/jobs/reminders/route.js',
  'api/ai/usage/route.js',
  'api/coach/[token]/route.js',
  'api/households/audit/route.js',
  'api/integrations/monid-status/route.js',
  'api/integrations/prices/route.js',
  'api/integrations/products/route.js',
  'api/realtime/stream/route.js',
  'api/realtime/token/route.js',
]);

const rel = (file) => ['api', ...file.slice(API_ROOT.length + 1).split(sep)].join('/');

describe('api contract consistency', () => {
  it('every Forq-owned route funnels errors through handleApiError', () => {
    // next-auth owns its handler: errors are part of the Auth.js contract,
    // not Forq's ApiError envelope. Read-only probes answer fixed JSON and
    // never touch user data, by design (see each probe's header comment).
    const LIB_OWNED = new Set([
      'api/auth/[...nextauth]/route.js',
      'api/health/route.js',
      'api/readiness/route.js',
      'api/backend/status/route.js',
    ]);
    const missing = routeFiles(API_ROOT)
      .filter((f) => !LIB_OWNED.has(rel(f)))
      .filter((f) => !readFileSync(f, 'utf8').includes('handleApiError'));
    expect(missing).toEqual([]);
  });

  it('every session route requires the user', () => {
    const missing = routeFiles(API_ROOT)
      .filter((f) => !NO_AUTH_ROUTES.has(rel(f)))
      .filter((f) => !importsOf(f).some((s) => s.endsWith('/server/api.js')))
      .concat(routeFiles(API_ROOT).filter((f) => !NO_AUTH_ROUTES.has(rel(f))
        && importsOf(f).some((s) => s.endsWith('/server/api.js'))
        && !readFileSync(f, 'utf8').includes('requireUser')));
    expect(missing).toEqual([]);
  });

  it('every mutating route asserts same origin or documents why not', () => {
    const missing = routeFiles(API_ROOT)
      .filter((f) => !NO_ORIGIN_ROUTES.has(rel(f)))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        const mutates = /export async function (POST|PUT|PATCH|DELETE)/.test(text);
        return mutates && !text.includes('assertSameOrigin');
      });
    expect(missing).toEqual([]);
  });

  it('every mutating route is rate-limited', () => {
    const missing = routeFiles(API_ROOT).filter((f) => {
      const text = readFileSync(f, 'utf8');
      if (NO_AUTH_ROUTES.has(rel(f))) return false;
      const mutates = /export async function (POST|PUT|PATCH|DELETE)/.test(text);
      return mutates && !text.includes('rateLimit');
    });
    expect(missing).toEqual([]);
  });

  it('no route reads a raw JSON body without the shared size cap', () => {
    // `request.json()` has no size limit, so one stray call is one unbounded
    // payload. readJsonBody is the only sanctioned way in: it caps at 256 KB
    // and returns the same 400/413 envelope for malformed or oversized JSON.
    // Routes that take multipart uploads (receipts) never parse JSON at all.
    const raw = routeFiles(API_ROOT)
      .filter((f) => readFileSync(f, 'utf8').match(/request\s*\.\s*json\s*\(/));
    expect(raw).toEqual([]);
  });
});
