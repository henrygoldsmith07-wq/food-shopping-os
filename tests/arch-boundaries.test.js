import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Forq food-loop boundary: the legacy Revise / Daily Debate code (SRS
 * flashcards, exam outlook, knowledge/deck graphs, argument graphs) was
 * removed completely — it now must not come back in any form: no src/legacy
 * directory, no bridge module, no orphaned UI components, no imports.
 *
 * Forq is a food-shopping OS: Plan → Shop → Eat. If someone needs
 * Revise/Debate again, it belongs in its own app, not wired back in here.
 */

const root = process.cwd();
const src = join(root, 'src');

const allFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) allFiles(p, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
};

const importsOf = (file) => {
  const srcText = readFileSync(file, 'utf8');
  const specs = [];
  const re = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(srcText))) specs.push(m[1] || m[2] || m[3]);
  return specs.filter((s) => s && s.startsWith('.'));
};

const slash = (p) => p.split(sep).join('/');

const REMOVED_PATHS = [
  'src/legacy',
  'src/lib/review-actions.js',
  'src/components/ReviewQueueCard.jsx',
  'src/components/KnowledgeMap.tsx',
  'src/components/KnowledgeMapSection.jsx',
  'src/components/NewCardSection.jsx',
  'src/components/SkipReasonsCard.jsx',
  'src/components/SkipReasonReflection.jsx',
  'src/components/WeekAheadForecast.jsx',
  'src/components/AddCardForm.jsx',
  'src/components/KitchenForgetConfirm.jsx',
  'src/components/KitchenRefreshPreview.jsx',
  'src/components/KitchenSeedStrip.jsx',
  'src/components/TopicStatusTag.jsx',
];

const REMOVED_TERMS = /argGraph|demoDebate|DemoDebate|revise-domain|kitchenSeed|kitchenCardsForgotten|kitchenKeptFronts|kitchenBootRefresh|reviewDueReasonGroups|reviewDueCards|gradeReview|deck-graph|knowledge-graph|skip-profile|topic-labels|topic-status|card-gen\b|src\/legacy|\/legacy\/|review-actions/;

// New food-loop core must stay clean.
const CORE = [
  'src/lib/household-model.js',
  'src/lib/event-ledger.js',
  'src/lib/week-recovery.js',
  'src/lib/meal-decision.js',
  'src/lib/autopilot.js',
  'src/lib/eval-metrics.js',
  'src/lib/store-slices.js',
  'src/lib/store-commands.js',
  'src/lib/derive.js',
  'src/lib/store-api.js',
  'src/components/HomeTab.jsx',
  'src/components/LearnTab.jsx',
  'src/app/demo/page.jsx',
];

describe('forq food-loop boundaries', () => {
  it('the removed legacy files and directories stay gone', () => {
    for (const rel of REMOVED_PATHS) {
      expect(existsSync(join(root, rel)), `${rel} has crept back`).toBe(false);
    }
  });

  it('keeps src/domain/ gone too (nothing silently re-imports it)', () => {
    let exists = false;
    try { statSync(join(src, 'domain')); exists = true; } catch { exists = false; }
    expect(exists).toBe(false);
  });

  it('keeps debate demo out of the food demo route', () => {
    const page = readFileSync(join(src, 'app', 'demo', 'page.jsx'), 'utf8');
    expect(page).not.toMatch(/DemoDebate|demoDebate|argGraph/i);
    expect(page).toMatch(/Plan.*Shop.*Eat|example week/i);
  });

  it('no source file references the removed legacy surface by name', () => {
    const hits = [];
    for (const file of allFiles(src)) {
      const text = readFileSync(file, 'utf8');
      if (REMOVED_TERMS.test(text)) hits.push(slash(file));
    }
    expect(hits).toEqual([]);
  });

  it('no source file imports anything that no longer exists', () => {
    const resolveTarget = (file, spec) => {
      const base = join(dirname(file), spec);
      const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, join(base, 'index.js')];
      for (const c of candidates) {
        try { if (statSync(c).isFile()) return c; } catch { /* try next */ }
      }
      return null;
    };
    const dangling = [];
    for (const file of allFiles(src)) {
      for (const spec of importsOf(file)) {
        const target = resolveTarget(file, spec);
        if (target === null) dangling.push(`${slash(file)} → ${spec}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('new food-loop core never mentions the removed legacy surface', () => {
    for (const rel of CORE) {
      const text = readFileSync(join(root, rel), 'utf8');
      expect(text, rel).not.toMatch(/argGraph|demoDebate|DemoDebate|revise-domain|src\/legacy|\/legacy\/|review-actions/);
    }
  });

  it('the SRS state keys left the store (skip reflections stay for the planner)', () => {
    const text = readFileSync(join(src, 'lib', 'state.js'), 'utf8');
    for (const key of ['cards:', 'kitchenCardsForgotten:', 'kitchenKeptFronts:', 'kitchenBootRefresh:']) {
      expect(text, key).not.toMatch(new RegExp(key));
    }
    expect(text).toMatch(/skipReasonProfile:/); // planner reads confirmed reasons
  });
});
