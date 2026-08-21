import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return files(path);
  return ['.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
});

const walk = (node, visit, ancestors = []) => {
  if (!node || typeof node !== 'object') return;
  visit(node, ancestors);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, [...ancestors, node]));
    else if (value?.type) walk(value, visit, [...ancestors, node]);
  }
};

const nameOf = (opening) => opening?.name?.name || '';
const attributesOf = (opening) => opening.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
const hasAttribute = (opening, name) => attributesOf(opening).some((attribute) => attribute.name.name === name);
const interactive = (opening) => {
  const name = nameOf(opening);
  return name === 'button'
    || name === 'select'
    || name === 'textarea'
    || (name === 'input' && !hasAttribute(opening, 'type'))
    || (name === 'a' && hasAttribute(opening, 'href'))
    || (name === 'Card' && hasAttribute(opening, 'onClick'));
};

describe('merge-conflict tripwires', () => {
  it('keeps source modules within the 500-line boundary', () => {
    const oversized = files(sourceRoot).flatMap((path) => {
      const count = readFileSync(path, 'utf8').split(/\r?\n/).length;
      return count > 500 ? [`${path}: ${count} lines`] : [];
    });
    expect(oversized).toEqual([]);
  });

  it('has no duplicate JSX attributes or nested interactive controls', () => {
    const violations = [];
    for (const path of files(sourceRoot)) {
      const ast = parse(readFileSync(path, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
      walk(ast, (node, ancestors) => {
        if (node.type !== 'JSXOpeningElement') return;
        const names = attributesOf(node).map((attribute) => attribute.name.name);
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        if (duplicates.length) violations.push(`${path}: duplicate ${[...new Set(duplicates)].join(', ')}`);
        if (!interactive(node)) return;
        const nested = ancestors.some((ancestor) =>
          ancestor.type === 'JSXElement'
          && ancestor.openingElement !== node
          && interactive(ancestor.openingElement));
        if (nested) violations.push(`${path}: nested interactive <${nameOf(node)}>`);
      });
    }
    expect(violations).toEqual([]);
  });

  it('keeps live announcements atomic and avoids nested live regions', () => {
    const violations = [];
    let liveRegions = 0;
    for (const path of files(sourceRoot)) {
      const ast = parse(readFileSync(path, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
      walk(ast, (node, ancestors) => {
        if (node.type !== 'JSXOpeningElement') return;
        const attributes = attributesOf(node);
        const role = attributes.find((attribute) => attribute.name.name === 'role');
        const ariaLive = attributes.find((attribute) => attribute.name.name === 'aria-live');
        const isLive = Boolean(ariaLive)
          || role?.value?.value === 'status'
          || role?.value?.value === 'alert'
          || role?.value?.value === 'log';
        if (!isLive) return;
        liveRegions += 1;
        const nested = ancestors.some((ancestor) => {
          if (ancestor.type !== 'JSXElement' || ancestor.openingElement === node) return false;
          const parentAttributes = attributesOf(ancestor.openingElement);
          return parentAttributes.some((attribute) => attribute.name.name === 'aria-live')
            || parentAttributes.some((attribute) =>
              attribute.name.name === 'role' && ['status', 'alert', 'log'].includes(attribute.value?.value));
        });
        if (nested) violations.push(`${path}: nested live region`);
      });
    }
    expect(violations).toEqual([]);
    expect(liveRegions).toBeLessThanOrEqual(20);
  });

  it('keeps one page-level heading per primary screen', () => {
    const screens = ['HomeTab.jsx', 'PlanTab.jsx', 'LogTab.jsx', 'ShopTab.jsx', 'RecipesTab.jsx'];
    const violations = screens.flatMap((file) => {
      const source = readFileSync(join(sourceRoot, 'components', file), 'utf8');
      const count = (source.match(/<h1\b/g) || []).length;
      return count > 1 ? [`${file}: ${count} h1 elements`] : [];
    });
    expect(violations).toEqual([]);
  });

  it('ships a static launch shell before the client root', () => {
    const page = readFileSync(join(sourceRoot, 'app', 'page.jsx'), 'utf8');
    expect(page.indexOf('<LaunchShell />')).toBeLessThan(page.indexOf('<ClientRoot />'));
  });
});
