import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The intro site was built while Forq still lived inside the Ruflo monorepo,
 * so it shipped links to a "Le Studio family" hub that is not deployed, a
 * canonical URL for a Vercel project that does not exist, and "Open Forq" CTAs
 * into the old monorepo copy — which is 11 days staler than this repo. Every
 * one of those was a dead or wrong link on the page a visitor lands on.
 *
 * These assert the page only points at destinations that exist, so the same
 * regression cannot come back silently.
 */

const SITE = 'forq-site/index.html';
const html = readFileSync(SITE, 'utf8');

/** Hosts this repo must never link to again, with why. */
const RETIRED = [
  ['Claude-Code', 'the old monorepo this app was moved out of; its copy is stale'],
  ['le-studio-site', 'the "Le Studio family" hub is not deployed — it returns 404'],
  ['apps/food-shopping-os', 'the monorepo path; this repo is the app'],
  ['apps/forq-site', 'the site ships from forq-site/, not apps/forq-site'],
  ['apps/le-studio-site', 'that directory does not exist in this repo'],
  ['forq-site-henrygoldsmith07-9188s-projects', 'the site is not deployed at this host'],
];

const urls = [...new Set([...html.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]))];

describe('the intro site points only at destinations that exist', () => {
  it('never links to the retired monorepo, family hub or dead host', () => {
    for (const [token, why] of RETIRED) {
      expect(html, `"${token}" should not appear — ${why}`).not.toContain(token);
    }
  });

  it('names the current repository, not the monorepo', () => {
    expect(html).toContain('github.com/henrygoldsmith07-wq/food-shopping-os');
  });

  it('sends every "Open Forq" call to action to the app, not the repo', () => {
    const ctas = [...html.matchAll(/<a class="cta"[^>]*href="([^"]+)"[^>]*>\s*Open Forq/g)].map((m) => m[1]);
    expect(ctas.length).toBeGreaterThan(0);
    for (const href of ctas) {
      expect(href, 'the product CTA must reach the product').toMatch(/^https?:\/\//);
      expect(href).not.toContain('github.com');
    }
  });

  it('keeps its canonical URL absolute and its preview images relative', () => {
    // A relative canonical is not valid, but an absolute image URL to an
    // undeployed host breaks every shared preview.
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toMatch(/^https:\/\//);
    for (const image of [...html.matchAll(/property="og:image" content="([^"]+)"/g)].map((m) => m[1])) {
      expect(image.startsWith('./'), `og:image ${image} should resolve at its own host`).toBe(true);
    }
  });

  it('declares Forq as its own site, not a family hub', () => {
    expect(html).toContain('content="Forq"');
  });

  it('parses as balanced markup with valid structured data', () => {
    const opens = (html.match(/<a[\s>]/g) || []).length;
    const closes = (html.match(/<\/a>/g) || []).length;
    expect(opens).toBe(closes);

    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(jsonLd, 'structured data must be present').not.toBeNull();
    expect(() => JSON.parse(jsonLd[1])).not.toThrow();
    expect(urls.every((url) => url.startsWith('http'))).toBe(true);
  });
});
