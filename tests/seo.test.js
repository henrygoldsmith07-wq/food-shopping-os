import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import robots from '../src/app/robots.js';
import sitemap from '../src/app/sitemap.js';
import { metadata as homeMeta } from '../src/app/page.jsx';
import { metadata as demoMeta } from '../src/app/demo/page.jsx';
import { metadata as resetMeta } from '../src/app/reset-password/page.jsx';
import { metadata as coachMeta } from '../src/app/coach/[token]/page.jsx';
import { metadata as rootMeta } from '../src/app/layout.jsx';
import { SITE_URL } from '../src/lib/site-url.js';

describe('search and AI crawler access', () => {
  it('lets search and AI-answer crawlers in, keeps the API out, and points at the sitemap', () => {
    const { rules, sitemap: map } = robots();
    const named = rules.find((rule) => Array.isArray(rule.userAgent));
    expect(named.userAgent).toEqual(expect.arrayContaining(['Googlebot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']));
    for (const rule of rules) {
      expect(rule.allow).toBe('/');
      expect(rule.disallow).toEqual(['/api/']);
    }
    expect(map).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it('lists only public pages in the sitemap', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([`${SITE_URL}/`, `${SITE_URL}/demo`]);
  });

  it('gives each public page its own canonical, title and description', () => {
    expect(homeMeta.alternates.canonical).toBe('/');
    expect(demoMeta.alternates.canonical).toBe('/demo');
    expect(demoMeta.title).not.toBe(rootMeta.title);
    expect(demoMeta.description).not.toBe(rootMeta.description);
    expect(rootMeta.robots).toEqual({ index: true, follow: true });
  });

  it('keeps private token pages out of the index', () => {
    expect(resetMeta.robots).toEqual({ index: false, follow: false });
    expect(coachMeta.robots).toEqual({ index: false, follow: false });
  });

  it('serves one h1 per public page', () => {
    const read = (file) => readFileSync(join(process.cwd(), file), 'utf8');
    for (const file of ['src/app/page.jsx', 'src/app/demo/page.jsx']) {
      const source = read(file);
      expect((source.match(/<h1\b/g) || []).length, file).toBe(1);
    }
    // The onboarding step title renders inside the home page, so it is an h2.
    const onboarding = read('src/components/Onboarding.jsx');
    expect(onboarding.match(/<h1\b/g)).toBeNull();
  });
});
