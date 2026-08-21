import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGISTER_INTRO, capabilityBy } from '../src/data/capabilities.js';
import { DATA_BOUNDARY, PRIVACY_COPY, PRIVACY_DISCLOSURE } from '../src/data/privacy.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the real data boundary', () => {
  it('states the default, the sync opt-in and the AI processor plainly', () => {
    expect(DATA_BOUNDARY).toMatch(/local-first by default/i);
    expect(DATA_BOUNDARY).toMatch(/Signing in opts your household into server sync/);
    expect(DATA_BOUNDARY).toMatch(/OpenAI/);
    expect(REGISTER_INTRO).toContain(DATA_BOUNDARY);
  });

  it('does not hide feature-specific uploads behind a global device-only claim', () => {
    expect(PRIVACY_COPY.cgm).toMatch(/household sync/);
    expect(PRIVACY_COPY.photos).toMatch(/thumbnails are included/);
    expect(PRIVACY_COPY.reminders).toMatch(/server can queue reminder jobs/);
    expect(PRIVACY_COPY.recipeImport).toMatch(/does not upload them/);
    expect(PRIVACY_COPY.recipeShare).toMatch(/does not upload the recipe/);
    for (const copy of Object.values(PRIVACY_COPY)) expect(copy).toMatch(/OpenAI/);
  });

  it('describes the server capabilities that actually exist', () => {
    expect(capabilityBy.api.detail).toMatch(/household sync/);
    expect(capabilityBy.api.detail).toMatch(/AI relay/);
    expect(capabilityBy.api.detail).toMatch(/OpenAI/);
    expect(capabilityBy.coach.status).toBe('built');
    expect(capabilityBy.coach.detail).toMatch(/read-only link/);
  });

  it('names what is stored, transmitted and who receives it', () => {
    const disclosure = JSON.stringify(PRIVACY_DISCLOSURE);
    expect(disclosure).toMatch(/Stored on this device/);
    expect(disclosure).toMatch(/Stored on Forq’s servers/);
    expect(disclosure).toMatch(/health data/i);
    expect(disclosure).toMatch(/coach-share scopes/i);
    for (const processor of ['Upstash Redis', 'Vercel Blob', 'OpenAI', 'Google', 'Apple', 'Microsoft', 'Ably']) {
      expect(disclosure).toContain(processor);
    }
  });

  it('keeps the seven audited sites free of the old absolute claims', () => {
    const sites = [
      '../README.md',
      '../src/data/capabilities.js',
      '../src/data/reminders.js',
      '../src/components/AdvancedPanel.jsx',
      '../src/components/HealthPanel.jsx',
      '../src/components/RecipeImport.jsx',
      '../src/components/RecipeTools.jsx',
      '../src/components/ProfileTab.jsx',
    ];
    const banned = /no backend, no account|Forq doesn’t have one|Forq has neither|hasn’t got a server|never leaves your device|there is nowhere else for them to go/i;
    for (const site of sites) expect(read(site), site).not.toMatch(banned);
  });
});
