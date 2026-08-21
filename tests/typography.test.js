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
