import { describe, expect, it } from 'vitest';
import { coachFocus, coachPulse } from '../src/lib/coach-dashboard.js';

const entry = (kcal, protein) => ({
  per100: { kcal, protein },
  grams: 100,
});

describe('shared coaching pulse', () => {
  it('summarises recent logged days without exposing food names', () => {
    const pulse = coachPulse({
      '2026-07-01': [entry(1900, 120)],
      '2026-07-02': [],
      '2026-07-03': [entry(2100, 140)],
    }, { kcal: 2000, protein: 130 });

    expect(pulse.rows).toHaveLength(3);
    expect(pulse.loggedDays).toBe(2);
    expect(pulse.avgKcal).toBe(2000);
    expect(pulse.avgProtein).toBe(130);
    expect(pulse.kcalHitPct).toBe(100);
    expect(pulse.proteinHitPct).toBe(50);
    expect(JSON.stringify(pulse)).not.toContain('food');
  });

  it('keeps only the most recent window and explains when evidence is thin', () => {
    const log = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [
      `2026-07-${String(i + 1).padStart(2, '0')}`, [entry(1800, 70)],
    ]));
    const pulse = coachPulse(log, { kcal: 2000, protein: 130 }, 14);
    expect(pulse.rows).toHaveLength(14);
    expect(coachFocus(pulse)).toMatch(/protein reached target/i);
    expect(coachFocus(coachPulse({ '2026-08-01': [entry(1800, 70)] }, { kcal: 2000, protein: 130 }))).toMatch(/more logged days/i);
  });

  it('fails closed for malformed synced days and an empty window', () => {
    expect(coachPulse({ broken: null }, { kcal: 2000 }, 14).rows[0].entries).toBe(0);
    expect(coachPulse({ today: [entry(1800, 70)] }, {}, 0).rows).toEqual([]);
  });
});
