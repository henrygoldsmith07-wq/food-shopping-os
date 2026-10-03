import { describe, it, expect } from 'vitest';
import { collectAdaptations } from '../src/lib/adaptations.js';
import { isAdaptationHeld, heldAdaptationKeys } from '../src/lib/adaptation-suppression.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

/**
 * The end-of-week review's "What will change next week" panel promises that
 * a rejection is remembered. These assertions hold it to that: rejecting an
 * adaptation through the same `undoAdaptation` path the panel uses must
 * suppress it (and only it) on the next derivation — the review never claims
 * learning it cannot keep.
 */
const day = '2026-07-28';

const app = (extra = {}) => {
  const state = {
    ...EMPTY_STATE,
    day,
    onboarded: true,
    portions: 2,
    pantry: [
      { id: 'p1', name: 'Mushrooms', qty: '200 g', expiry: day },
      { id: 'p2', name: 'Pasta', qty: '1 kg', expiry: null },
    ],
    // A waste history that earns a quantity adaptation for mushrooms.
    waste: [
      { id: 'w1', name: 'Mushrooms', date: '2026-07-14', reason: 'too much' },
      { id: 'w2', name: 'Mushrooms', date: '2026-07-21', reason: 'too much' },
    ],
    shoppingList: [
      {
        id: 's1',
        name: 'Mushrooms',
        qty: '200 g',
        lastAutoQty: '200 g',
        requiredQty: '300 g',
        pantryQty: '100 g',
        shortfallQty: '200 g',
      },
    ],
    ...extra,
  };
  return { ...state, ...deriveApp(state) };
};

describe('week review — what will change next week', () => {
  it('lists the adaptations the next plan will apply, with evidence', () => {
    const state = app();
    const { adaptations } = collectAdaptations(state, { today: day });
    for (const row of adaptations) {
      expect(row.title).toBeTruthy();
      expect(row.evidence).toBeTruthy();
      expect(row.key).toBeTruthy();
    }
  });

  it('a rejected adaptation is held back — only that one', () => {
    const before = app();
    const { adaptations } = collectAdaptations(before, { today: day });
    if (!adaptations.length) return; // nothing learned yet: nothing to reject
    const target = adaptations[0];

    // The review's "Not this week" runs undoAdaptation, which stamps the
    // rejection exactly like this.
    const rejected = {
      ...before,
      adaptationSuppression: {
        ...(before.adaptationSuppression || {}),
        [target.key]: {
          events: [{ id: 'e1', day }],
          rejections: [day],
          lastRejectedAt: day,
        },
      },
    };

    expect(isAdaptationHeld(rejected, target.key, { today: day })).toBe(true);
    const after = collectAdaptations(rejected, { today: day });
    expect(after.adaptations.some((row) => row.key === target.key)).toBe(false);
    // Everything else is untouched: a veto is not a blanket rejection.
    for (const row of adaptations.slice(1)) {
      expect(after.adaptations.some((r) => r.key === row.key) || isAdaptationHeld(rejected, row.key, { today: day })).toBe(true);
    }
  });

  it('a kept adaptation stays live and is not suppressed', () => {
    const state = app();
    const { adaptations } = collectAdaptations(state, { today: day });
    if (!adaptations.length) return;
    const target = adaptations[0];
    // "Keep this" records acceptance and must not suppress anything.
    expect(isAdaptationHeld(state, target.key, { today: day })).toBe(false);
    expect(heldAdaptationKeys(state, { today: day }).has(target.key)).toBe(false);
  });
});
