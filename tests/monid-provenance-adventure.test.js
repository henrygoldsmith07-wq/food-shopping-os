import { describe, it, expect } from 'vitest';
import { splitMonidRows, monidLabel, monidTone } from '../src/lib/monid-provenance.js';
import { adventureMissions, adventureSummary } from '../src/lib/adventure.js';

describe('splitMonidRows', () => {
  it('returns an empty shape for missing or non-array input', () => {
    for (const input of [undefined, null, 'x', {}]) {
      const r = splitMonidRows(input);
      expect(r.monid).toBeNull();
      expect(r.rows).toEqual([]);
      expect(r.status).toBeNull();
      expect(r.named('milk')).toEqual([]);
    }
  });
  it('finds the monid result by source or flag and drops junk rows', () => {
    const r = splitMonidRows([
      { source: 'shop' },
      { source: 'monid', status: 'ok', provider: 'p', note: 'n', rows: [{ query: 'milk' }, null, 'x', { query: 'eggs' }] },
    ]);
    expect(r.status).toBe('ok');
    expect(r.provider).toBe('p');
    expect(r.note).toBe('n');
    expect(r.rows).toHaveLength(2);
    expect(r.named('milk')).toEqual([{ query: 'milk' }]);
    expect(r.named()).toHaveLength(2);
    expect(splitMonidRows([{ monid: true, status: 'no-match' }]).status).toBe('no-match');
  });
  it('exports a label that says it is not read from a shop page', () => {
    expect(monidLabel).toMatch(/not read from a shop page/);
    expect(monidTone).toBe('accent');
  });
});

describe('adventureMissions', () => {
  const day = '2026-10-21';
  const byId = (s) => Object.fromEntries(adventureMissions(s).map((m) => [m.id, m]));
  it('starts with only the waste-free mission complete', () => {
    const m = byId({ day });
    expect(m['waste-free'].complete).toBe(true);
    expect(m['cook-three'].progress).toBe(0);
    expect(adventureSummary({ day }).completed).toBe(1);
  });
  it('counts only the last seven days and caps progress at target', () => {
    const cooked = ['2026-10-21', '2026-10-20', '2026-10-15', '2026-10-14', '2026-10-13', '2026-10-21'].map((date) => ({ date }));
    const m = byId({ day, cooked });
    expect(m['cook-three'].progress).toBe(3);
    expect(m['cook-three'].complete).toBe(true);
  });
  it('recent waste fails waste-free; old waste does not', () => {
    expect(byId({ day, waste: [{ date: '2026-10-20' }] })['waste-free'].complete).toBe(false);
    expect(byId({ day, waste: [{ date: '2026-09-01' }] })['waste-free'].complete).toBe(true);
  });
  it('counts distinct planned meals and pantry use', () => {
    const plan = { a: { l: 'x', d: 'y' }, b: { l: 'x', d: null } };
    const m = byId({ day, plan, cooked: [{ date: day, pantryUsed: 2 }] });
    expect(m['plan-five'].progress).toBe(2);
    expect(m['use-pantry'].complete).toBe(true);
  });
  it('xpAvailable excludes claimed missions', () => {
    const s = adventureSummary({ day, adventureCompleted: { 'waste-free': true }, shops: [{ date: day }] });
    expect(s.xpAvailable).toBe(50);
  });
});
