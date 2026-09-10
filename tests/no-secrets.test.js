import { describe, expect, it } from 'vitest';
import { nvidiaKey, activeProvider } from '../src/server/openrouter.js';

/**
 * Release health: no credential ships in source.
 *
 * The bundled NVIDIA key that used to live in openrouter.js failed the CI
 * gitleaks scan and — being public, un-rotatable and spendable by anyone —
 * had to go. This test is the tripwire: a secret-shaped constant in a source
 * file fails fast in unit tests, before CI ever sees it.
 */

const SECRET_SHAPES = [
  { name: 'NVIDIA NIM key', re: /\bnvapi-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenRouter key', re: /\bsk-or-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Upstash REST token', re: /UPSTASH_REDIS_REST_TOKEN\s*=\s*['"][^'"]{8,}['"]/ },
];

const sourceFiles = (import.meta.env?.VITEST_POOL_ID !== undefined)
  ? undefined // computed lazily below; node:fs is fine in vitest node pools
  : undefined;

// Lazily walk the source tree at test time (node pool, no bundling concerns).
const { readdirSync, readFileSync, statSync } = await import('node:fs');
const { join } = await import('node:path');

const SOURCE_DIRS = ['src', 'scripts'];
const EXCLUDE = /node_modules|\.next|dist|playwright-report|test-results|\.freebuff|\.hoplite/;
const FILE_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;

const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (EXCLUDE.test(p)) continue;
    if (entry.isDirectory()) walk(p, out);
    else if (FILE_RE.test(entry.name)) out.push(p);
  }
  return out;
};

describe('no credentials ship in source', () => {
  it('the AI provider comes from the environment, never from a bundled constant', () => {
    // With no environment, there is no provider — and no key to leak.
    const previous = process.env.NVIDIA_API_KEY;
    try {
      delete process.env.NVIDIA_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      expect(nvidiaKey()).toBe('');
      expect(activeProvider()).toBeNull();
    } finally {
      if (previous !== undefined) process.env.NVIDIA_API_KEY = previous;
    }
  });

  it.each(SECRET_SHAPES.map((s) => s.name))('source contains no %s', (name) => {
    const shape = SECRET_SHAPES.find((s) => s.name === name);
    const offenders = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of walk(join(process.cwd(), dir))) {
        const text = readFileSync(file, 'utf8');
        if (shape.re.test(text)) offenders.push(file);
      }
    }
    expect(offenders, `secret-shaped constant found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('openrouter.js never falls back to a hard-coded key', () => {
    const text = readFileSync(join(process.cwd(), 'src', 'server', 'openrouter.js'), 'utf8');
    expect(text).not.toMatch(/nvapi-[A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/BUNDLED_/);
  });

  it('keeps statSync imports honest (guards accidental dead code above)', () => {
    expect(typeof statSync).toBe('function');
    expect(sourceFiles).toBeUndefined();
  });
});
