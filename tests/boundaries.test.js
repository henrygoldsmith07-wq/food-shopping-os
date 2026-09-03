import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

/**
 * Dependency boundaries, enforced statically.
 *
 * The client bundle must never pull in server code, and the server must
 * never reach into client-owned modules. Both directions are clean today;
 * these rules exist so they stay that way — a leak is usually invisible at
 * runtime (it compiles, it even works, until it ships a database token to
 * the browser) and only a tripwire like this catches it at review time.
 */

const sourceRoot = join(process.cwd(), 'src');
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return files(path);
  return ['.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
});

/** Every relative import specifier in a module, via a real parse. */
const importsOf = (file) => {
  const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  return ast.program.body
    .filter((node) => node.type === 'ImportDeclaration')
    .map((node) => node.source.value)
    .filter((specifier) => specifier.startsWith('.'));
};

/** Resolve a relative specifier from its file, trying the usual extensions. */
const resolve = (file, specifier) => {
  const base = join(file, '..', specifier);
  const candidates = [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js'), join(base, 'index.jsx')];
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
};

const slash = (path) => path.split(sep).join('/');
const under = (file, root) => slash(file).startsWith(slash(root));

// Client side of the boundary: components, pure logic, and the app shell
// (pages, layout, root) — but never the api subtree, which is server code.
const CLIENT_ROOTS = [join(sourceRoot, 'components'), join(sourceRoot, 'lib')];
const SERVER_ROOTS = [join(sourceRoot, 'server'), join(sourceRoot, 'app', 'api')];
// The one sanctioned seam: pure logic shared across the boundary.
const SHARED_ROOT = join(sourceRoot, 'shared');
const appShell = () => files(join(sourceRoot, 'app'))
  .filter((file) => !slash(file).includes('/api/'));
// App-shell files without 'use client' are server components (pages that
// render on the server and may read server code); only client components
// are bound by the client-side of the rule.
const isClientComponent = (file) => readFileSync(file, 'utf8').includes("'use client'");

describe('dependency boundaries', () => {
  it('keeps server code out of the client bundle', () => {
    const leaks = [];
    const clientFiles = [...CLIENT_ROOTS.flatMap(files), ...appShell().filter(isClientComponent)];
    for (const file of clientFiles) {
      for (const specifier of importsOf(file)) {
        const target = resolve(file, specifier);
        if (target && SERVER_ROOTS.some((root) => under(target, root))) {
          leaks.push(`${slash(file)} → ${slash(target)}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('allows shared logic to cross either way and keeps it out of both client and server roots', () => {
    const sharedFiles = files(SHARED_ROOT);
    expect(sharedFiles.length).toBeGreaterThan(0);
    for (const file of sharedFiles) {
      for (const specifier of importsOf(file)) {
        const target = resolve(file, specifier);
        // Shared code must stay pure: it may not reach into client or server roots.
        if (target && [...CLIENT_ROOTS, ...SERVER_ROOTS].some((root) => under(target, root))) {
          throw new Error(`shared module ${slash(file)} imports ${slash(target)}`);
        }
      }
    }
  });

  it('keeps client code out of the server', () => {
    const leaks = [];
    for (const root of SERVER_ROOTS) {
      for (const file of files(root)) {
        for (const specifier of importsOf(file)) {
          const target = resolve(file, specifier);
          if (target && CLIENT_ROOTS.some((clientRoot) => under(target, clientRoot))) {
            leaks.push(`${slash(file)} → ${slash(target)}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('scans both sides of the boundary', () => {
    const clientCount = [...CLIENT_ROOTS.flatMap(files), ...appShell().filter(isClientComponent)].length;
    const serverCount = SERVER_ROOTS.reduce((count, root) => count + files(root).length, 0);
    expect(clientCount).toBeGreaterThan(100);
    expect(serverCount).toBeGreaterThan(20);
  });
});