import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Forq food-loop boundary: Revise / Daily Debate code is quarantined under
 * src/legacy/** and must not leak back into Plan → Shop → Eat.
 *
 * Quarantined: exam, flashcard/SRS, debate, argument-graph, grade prediction.
 * The single sanctioned bridge is src/lib/review-actions.js (existing deck
 * support) plus the legacy UI components themselves.
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

const resolveTarget = (file, spec) => {
  const base = join(dirname(file), spec);
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, join(base, 'index.js')];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch { /* try next */ }
  }
  return null;
};

const slash = (p) => p.split(sep).join('/');
const isLegacy = (p) => slash(p).includes('/src/legacy/');
const isBridge = (p) => {
  const s = slash(p);
  return s.endsWith('/src/lib/review-actions.js')
    || s.includes('/src/legacy/')
    || s.includes('/src/components/ReviewQueueCard.jsx')
    || s.includes('/src/components/KnowledgeMap')
    || s.includes('/src/components/NewCardSection.jsx')
    || s.includes('/src/components/SkipReasonsCard.jsx')
    || s.includes('/src/components/SkipReasonReflection.jsx')
    || s.includes('/src/components/WeekAheadForecast.jsx')
    || s.includes('/src/components/AddCardForm.jsx')
    || s.includes('/src/components/KitchenForgetConfirm.jsx')
    || s.includes('/src/components/KitchenRefreshPreview.jsx')
    || s.includes('/src/components/TopicStatusTag.jsx');
};

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
  it('keeps src/domain/ gone (moved to src/legacy/revise-domain/)', () => {
    let exists = false;
    try { statSync(join(src, 'domain')); exists = true; } catch { exists = false; }
    expect(exists).toBe(false);
  });

  it('keeps debate demo out of the food demo route', () => {
    const page = readFileSync(join(src, 'app', 'demo', 'page.jsx'), 'utf8');
    expect(page).not.toMatch(/DemoDebate|demoDebate|argGraph/i);
    expect(page).toMatch(/Plan.*Shop.*Eat|example week/i);
  });

  it('WeekAheadForecast no longer imports the SRS domain', () => {
    const file = join(src, 'components', 'WeekAheadForecast.jsx');
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/from\s+['"]\.\.\/domain\//);
    expect(text).toMatch(/kitchen-dates/);
  });

  it('new food-loop core never imports legacy revise/debate code', () => {
    const leaks = [];
    for (const rel of CORE) {
      const file = join(root, rel);
      let targets = [];
      try { targets = importsOf(file); } catch { continue; }
      for (const spec of targets) {
        if (/legacy|domain\/|argGraph|demoDebate|DemoDebate/.test(spec)) {
          leaks.push(`${rel} → ${spec}`);
          continue;
        }
        const target = resolveTarget(file, spec);
        if (target && isLegacy(target) && !isBridge(file)) {
          leaks.push(`${rel} → ${slash(target)}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('no food-loop file outside the bridge imports the SRS domain', () => {
    const leaks = [];
    for (const file of allFiles(src)) {
      if (isLegacy(file) || isBridge(file)) continue;
      if (slash(file).includes('/src/app/api/') || slash(file).includes('/src/server/')) continue;
      for (const spec of importsOf(file)) {
        if (spec.includes('../domain/') || spec.includes('/domain/') || spec.includes('argGraph') || spec.includes('demoDebate') || spec.includes('DemoDebate')) {
          leaks.push(`${slash(file)} → ${spec}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
