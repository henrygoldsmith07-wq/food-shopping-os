import { describe, expect, it } from 'vitest';
import { canFreeze, freezeCandidates, freezePatch } from '../src/lib/freeze-rescue.js';
import { freshnessOf } from '../src/lib/kitchen.js';

const day = '2026-10-28';
const row = (o) => ({ id: o.name, cat: 'Meat', ...o });

describe('freeze rescue', () => {
  it('offers only freezable rows going off within two days, soonest first', () => {
    const pantry = [
      row({ name: 'chicken', expiry: '2026-10-30' }),
      row({ name: 'mince', expiry: '2026-10-28' }),
      row({ name: 'beans', cat: 'Tins & jars', expiry: '2026-10-29' }),
      row({ name: 'peas', location: 'Freezer', expiry: '2026-10-29' }),
      row({ name: 'ham', expiry: '2026-11-05' }),
      row({ name: 'old', expiry: '2026-10-20' }),
      row({ name: 'nodate' }),
    ];
    expect(freezeCandidates({ pantry, day }).map((r) => r.item.name)).toEqual(['mince', 'chicken']);
  });
  it('freezing restarts the freezer clock and sets a new expiry', () => {
    const item = row({ name: 'chicken', expiry: '2026-10-29', purchaseDate: '2026-10-20' });
    const patch = freezePatch(item, day);
    expect(patch).toEqual({ location: 'Freezer', frozenAt: day, expiry: '2027-01-26' });
    expect(freshnessOf({ ...item, ...patch }, day).label).toMatch(/Frozen 0 days/);
    expect(canFreeze({ ...item, ...patch })).toBe(false);
  });
});
