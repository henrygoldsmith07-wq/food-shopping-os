import { describe, it, expect } from 'vitest';
import { prepChecklist, prepProgress } from '../src/lib/prep-checklist.js';

const CURRY = 'chickpea-curry';

describe('prep checklist', () => {
  const week = ['2026-07-06', '2026-07-07', '2026-07-08'];
  const plan = {
    '2026-07-06': { dinner: CURRY },
    '2026-07-08': { dinner: CURRY },
  };

  it('puts shop first and batches repeated dishes', () => {
    const steps = prepChecklist(plan, week);
    expect(steps[0].kind).toBe('shop');
    expect(steps.some((s) => s.kind === 'batch' && s.label.includes('Chickpea'))).toBe(true);
    expect(steps.some((s) => s.kind === 'leftovers')).toBe(true);
  });

  it('tracks progress', () => {
    const steps = prepChecklist(plan, week);
    const p = prepProgress(steps, [steps[0].id]);
    expect(p.complete).toBe(1);
    expect(p.total).toBe(steps.length);
    expect(p.pct).toBeGreaterThan(0);
  });

  it('returns empty for empty plan', () => {
    expect(prepChecklist({}, week)).toEqual([]);
  });
});
