import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');

const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.css', '.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
  });

describe('scalable typography', () => {
  it('keeps type in relative units so browser and OS text settings can resize it', () => {
    const offenders = [];
    for (const path of sourceFiles(sourceRoot)) {
      const source = readFileSync(path, 'utf8');
      if (/text-\[[0-9.]+px\]/.test(source)
        || /font-size:\s*[0-9.]+px/.test(source)
        || /fontSize:\s*[0-9.]+(?:\s|[},])/.test(source)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every form control at the iOS no-zoom size', () => {
    const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{\s*font-size:\s*1rem\s*!important;\s*\}/);
  });

  it('supports increased contrast and forced system colours', () => {
    const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(/--bg:\s*Canvas;/);
    expect(css).toMatch(/--ink:\s*CanvasText;/);
    expect(css).toMatch(/--accent:\s*Highlight;/);
    expect(css).toMatch(/forced-color-adjust:\s*none;/);
  });
});

/**
 * WCAG AA contrast over the documented token pairs in both themes.
 * Values are read from the token definitions themselves (the shared ramp in
 * le-studio.css plus the aliases, mono accent and `*-deep` mixes in index.css)
 * so the test moves with the theme instead of restating a set of hex values.
 * Only `var()` aliases and the srgb `color-mix()` used by `*-deep` need
 * resolving; every leaf token is a plain hex colour.
 */
describe('token colour contrast', () => {
  const readTokens = (file) => readFileSync(join(sourceRoot, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]+;/g, '');

  // Collect `--name: value;` per rule block, grouped by the three kinds of
  // block we care about. Media queries / high-contrast blocks are ignored.
  const declarations = (source) => {
    const out = { light: {}, dark: {}, monoAccent: {} };
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let block;
    while ((block = rule.exec(source))) {
      const selector = block[1].trim().replace(/\s+/g, ' ');
      const target = selector === '.dark, :root[data-theme="dark"]' ? out.dark
        : selector === ':root[data-accent="mono"]' ? out.monoAccent
          : selector === ':root' ? out.light : null;
      if (!target) continue;
      const declaration = /--([\w-]+)\s*:\s*([^;]+);/g;
      let token;
      while ((token = declaration.exec(block[2]))) target[token[1]] = token[2].trim();
    }
    return out;
  };

  const studio = declarations(readTokens('le-studio.css'));
  const app = declarations(readTokens('index.css'));
  const light = { ...studio.light, ...app.light, ...app.monoAccent };
  const dark = { ...light, ...studio.dark, ...app.dark };

  const toRgb = (value) => {
    const hex = value.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };

  const resolve = (tokens, name, seen = new Set()) => {
    if (seen.has(name)) throw new Error(`Cyclic token: --${name}`);
    seen.add(name);
    const value = tokens[name];
    if (!value) throw new Error(`Unknown token: --${name}`);
    const ref = value.match(/^var\(\s*--([\w-]+)\s*\)$/);
    if (ref) return resolve(tokens, ref[1], seen);
    const mix = value.match(/^color-mix\(\s*in srgb,\s*var\(--([\w-]+)\)\s+([\d.]+)%,\s*var\(--([\w-]+)\)\s*\)$/);
    if (mix) {
      const first = resolve(tokens, mix[1], seen);
      const second = resolve(tokens, mix[3], seen);
      const weight = Number(mix[2]) / 100;
      return first.map((channel, i) => Math.round(channel * weight + second[i] * (1 - weight)));
    }
    return toRgb(value);
  };

  const luminance = (channels) => channels
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

  const contrast = (text, surface) => {
    const [lighter, darker] = [luminance(text), luminance(surface)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // Text token first, surface token second. `muted`/`card-2` are aliases of
  // `ink-2`/`surface-2`; `on-accent`/`accent` are the default (mono) pair.
  const pairs = [
    ['ink', 'surface'],
    ['muted', 'surface'],
    ['warn-deep', 'card-2'],
    ['on-accent', 'accent'],
  ];

  for (const [theme, tokens] of [['light', light], ['dark', dark]]) {
    for (const [text, surface] of pairs) {
      it(`${theme}: --${text} on --${surface} clears WCAG AA (>= 4.5:1)`, () => {
        expect(contrast(resolve(tokens, text), resolve(tokens, surface))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
