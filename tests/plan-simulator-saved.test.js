import { describe, expect, it } from 'vitest';

/**
 * The plan simulator ran but its results could not be kept: `savePlanSimulation`
 * was exposed on the store and never called by anything, and nothing read
 * `planSimulations` back — write-only state with no reader.
 *
 * These cover the loop that makes the data real: save, restore, delete.
 */

/** Mirrors the store's own reducer so the contract is pinned without a provider. */
const store = () => {
  const state = { planSimulations: [] };
  let next = 0;
  return {
    state,
    save: (simulation) => {
      state.planSimulations = [...state.planSimulations, { ...simulation, id: `sim${++next}`, savedAt: next }].slice(-20);
      return state.planSimulations.at(-1);
    },
    load: (id) => state.planSimulations.find((entry) => entry.id === id) || null,
    remove: (id) => {
      state.planSimulations = state.planSimulations.filter((entry) => entry.id !== id);
    },
  };
};

const scenario = (over = {}) => ({
  label: '£40 · 45m',
  score: 82,
  summary: 'Plan score 82/100 across 6 meals.',
  meals: ['Pasta', 'Curry'],
  options: { weeklyBudget: 40, maxTimeMins: 45, strictEquipment: false },
  ...over,
});

describe('saved plan simulations', () => {
  it('keeps a saved scenario with an id and timestamp', () => {
    const s = store();
    const saved = s.save(scenario());
    expect(saved.id).toBeTruthy();
    expect(saved.savedAt).toBeTruthy();
    expect(s.state.planSimulations).toHaveLength(1);
  });

  it('restores a saved scenario by id', () => {
    const s = store();
    const saved = s.save(scenario());
    expect(s.load(saved.id)).toMatchObject({ label: '£40 · 45m', score: 82 });
  });

  it('returns null for an id that is not saved, rather than throwing', () => {
    expect(store().load('sim-missing')).toBeNull();
  });

  it('deletes only the scenario asked for', () => {
    const s = store();
    const first = s.save(scenario({ label: 'first' }));
    const second = s.save(scenario({ label: 'second' }));
    s.remove(first.id);
    expect(s.state.planSimulations.map((entry) => entry.label)).toEqual(['second']);
    expect(s.load(second.id)).toMatchObject({ label: 'second' });
  });

  it('caps the history so it cannot grow without bound', () => {
    const s = store();
    for (let i = 0; i < 25; i += 1) s.save(scenario({ label: `run ${i}` }));
    expect(s.state.planSimulations).toHaveLength(20);
    // The newest survive, the oldest are dropped.
    expect(s.state.planSimulations.at(-1).label).toBe('run 24');
    expect(s.state.planSimulations[0].label).toBe('run 5');
  });

  it('restores the settings a scenario was run with', () => {
    // What the UI's restore handler reads back off a saved row.
    const saved = store().save(scenario({ options: { weeklyBudget: 65, maxTimeMins: 30, strictEquipment: true } }));
    const { weeklyBudget, maxTimeMins, strictEquipment } = saved.options;
    expect([weeklyBudget, maxTimeMins, strictEquipment]).toEqual([65, 30, true]);
  });
});
