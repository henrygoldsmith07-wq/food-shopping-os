/**
 * The boot path must not drag the reference data in with it.
 *
 * The app shell hydrates state before it has rendered a single screen, and
 * hydration rolls the day over — which captures silent misses. That capture
 * used to live in `plan-outcome.js`, which renders through the ~2,200-row
 * recipe book, so opening the app pulled the book in. It now lives in
 * `missed-meals.js`, a module that imports nothing and works on the plan
 * object alone. This test is the tripwire: it fails the moment someone adds
 * a convenience import of the reference data to a module on the boot path
 * again.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

/** Walk the static import graph from a module, following relative specifiers. */
const staticImports = (file, seen = new Set()) => {
  const absolute = resolve(file);
  if (seen.has(absolute)) return new Set();
  seen.add(absolute);
  const graph = new Set([absolute]);
  let text;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch {
    return graph;
  }
  // Static imports and re-exports only. A dynamic `import()` is a deliberate
  // lazy load and is exactly what this architecture is for.
  const re = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const base = join(dirname(absolute), match[1]);
    for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}.ts`]) {
      if (graph.has(candidate)) break;
      try {
        readFileSync(candidate, 'utf8');
        for (const reached of staticImports(candidate, seen)) graph.add(reached);
        graph.add(candidate);
        break;
      } catch { /* try the next extension */ }
    }
  }
  return graph;
};

/** Repo-relative, with forward slashes, so assertions read the same on any OS. */
const relative = (file) => file.replace(`${root}\\`, '').replace(`${root}/`, '').split('\\').join('/');

describe('the boot path', () => {
  const boot = staticImports(join(root, 'src/lib/state-versions.js'));
  const hydrates = staticImports(join(root, 'src/lib/persistence-boot.js'));

  it('reads the schema version without pulling in the state shape or any data', () => {
    const fromVersion = [...boot].map(relative);
    expect(fromVersion).not.toContain('src/lib/state.js');
    expect(fromVersion.some((file) => file.startsWith('src/data/'))).toBe(false);
  });

  it('hydrates a saved install without the food catalogue or the recipe book', () => {
    const fromHydration = [...hydrates].map(relative);
    // These two are the whole weight of the reference data. Neither belongs in
    // a module that decides where saved state comes from.
    expect(fromHydration).not.toContain('src/data/foods.js');
    expect(fromHydration).not.toContain('src/data/recipes.js');
    // Nor through a longer path.
    expect(fromHydration.some((file) => /data\/(foods|recipes)\.js$/.test(file))).toBe(false);
  });

  it('keeps the catalogue lookups in one module, off the boot path', () => {
    // The helpers that do need the book live in food-lookup.js, and the store
    // re-exports them so no call site had to change.
    const lookup = [...staticImports(join(root, 'src/lib/food-lookup.js'))].map(relative);
    expect(lookup).toContain('src/data/foods.js');
    // …and nothing on the boot path reaches it.
    expect([...boot, ...hydrates].map(relative)).not.toContain('src/lib/food-lookup.js');
  });
});
