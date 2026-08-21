import { describe, it, expect } from 'vitest';
import {
  activeModules, cleanModes, hiddenModules, keptRecords, moduleOn, modesSummary,
  visibleTabs, visibleWidgets,
} from '../src/lib/modes.js';
import { MODULES, PRODUCT_MODES } from '../src/data/modes.js';
import { buildGlobalResults } from '../src/lib/global-search.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';
import { DEFAULT_WIDGETS } from '../src/data/preferences.js';

const TABS = ['home', 'plan', 'log', 'shop', 'recipes'];

describe('the five product modes', () => {
  it('offers exactly the five intents, each naming what it uses', () => {
    expect(PRODUCT_MODES.map((mode) => mode.id)).toEqual([
      'plan-shop', 'reduce-waste', 'consistency', 'nutrition', 'household',
    ]);
    const known = new Set(MODULES.map((module) => module.id));
    for (const mode of PRODUCT_MODES) {
      expect(mode.needs.length).toBeGreaterThan(0);
      for (const id of mode.needs) expect(known.has(id)).toBe(true);
    }
  });

  it('shows everything until you choose', () => {
    expect(activeModules([]).size).toBe(MODULES.length);
    expect(visibleTabs([], TABS)).toEqual(TABS);
    expect(visibleWidgets(DEFAULT_WIDGETS, [])).toEqual(DEFAULT_WIDGETS);
    expect(hiddenModules(EMPTY_STATE, [])).toEqual([]);
    expect(modesSummary([])).toBe('Everything is shown');
  });

  it('hides the modules an intent does not use', () => {
    expect(moduleOn('household', ['plan-shop'])).toBe(false);
    expect(moduleOn('log', ['plan-shop'])).toBe(false);
    expect(moduleOn('plan', ['plan-shop'])).toBe(true);
    expect(visibleTabs(['plan-shop'], TABS)).toEqual(['home', 'plan', 'shop', 'recipes']);
    expect(visibleTabs(['nutrition'], TABS)).toEqual(['home', 'log']);
    expect(visibleWidgets(DEFAULT_WIDGETS, ['nutrition'])).not.toContain('pantry');
  });

  it('keeps Home whatever is chosen, so there is always somewhere to be', () => {
    for (const mode of PRODUCT_MODES) {
      expect(visibleTabs([mode.id], TABS)).toContain('home');
      expect(visibleWidgets(DEFAULT_WIDGETS, [mode.id])).toContain('rings');
    }
  });

  it('widens again when you pick more than one', () => {
    const one = activeModules(['nutrition']);
    const two = activeModules(['nutrition', 'plan-shop']);
    for (const id of one) expect(two.has(id)).toBe(true);
    expect(two.size).toBeGreaterThan(one.size);
    expect(modesSummary(['nutrition', 'plan-shop'])).toBe('Track nutrition · Plan and shop');
  });

  it('ignores a mode it has never heard of', () => {
    expect(cleanModes(['plan-shop', 'nonsense', 'plan-shop'])).toEqual(['plan-shop']);
    expect(cleanModes('not a list')).toEqual([]);
    expect(activeModules(['nonsense']).size).toBe(MODULES.length);
  });
});

describe('hiding a module keeps its data', () => {
  const state = {
    ...EMPTY_STATE,
    modes: ['nutrition'],
    pantry: [{ id: 'a', name: 'Rice' }, { id: 'b', name: 'Beans' }],
    waste: [{ id: 'w', cost: 2 }],
    members: [{ id: 'm', name: 'Kit', diets: [] }],
    shoppingList: [{ id: 's', name: 'Milk' }],
    log: { '2026-08-04': [{ id: 'e', kcal: 400 }] },
  };

  it('names what each hidden module is still holding', () => {
    const hidden = hiddenModules(state);
    const pantry = hidden.find((module) => module.id === 'pantry');
    expect(pantry.records).toBe('2 pantry items kept');
    expect(hidden.find((module) => module.id === 'waste').records).toBe('1 waste record kept');
    expect(hidden.find((module) => module.id === 'household').records).toBe('1 member and task kept');
    expect(keptRecords(state, 'shop')).toBe('1 list item and shop kept');
  });

  it('says so plainly when a hidden module never held anything', () => {
    expect(keptRecords(EMPTY_STATE, 'pantry')).toBe('');
    expect(keptRecords(state, 'nonsense')).toBe('');
  });

  it('leaves every record in state, and every total counted', () => {
    const app = deriveApp(state);
    // The module is off…
    expect(app.moduleOn('pantry')).toBe(false);
    expect(app.visibleTabs(TABS)).not.toContain('shop');
    // …and nothing about the data behind it moved.
    expect(state.pantry.length).toBe(2);
    expect(app.pantryValue).toBe(deriveApp({ ...state, modes: [] }).pantryValue);
    expect(app.kcalToday).toBe(deriveApp({ ...state, modes: [] }).kcalToday);
    expect(app.wasted.count).toBe(deriveApp({ ...state, modes: [] }).wasted.count);
  });

  it('puts everything back the moment the mode is cleared', () => {
    const narrowed = deriveApp(state);
    const restored = deriveApp({ ...state, modes: [] });
    expect(narrowed.hiddenModules.length).toBeGreaterThan(0);
    expect(restored.hiddenModules).toEqual([]);
    expect(restored.visibleTabs(TABS)).toEqual(TABS);
    expect(restored.homeWidgets).toEqual(DEFAULT_WIDGETS);
  });
});

describe('search under a mode', () => {
  const app = { ...deriveApp({ ...EMPTY_STATE, modes: ['nutrition'] }), pantry: [{ id: 'p', name: 'Rice' }] };

  it('stops offering a route into a screen that is not on the bar', () => {
    const targets = buildGlobalResults(app, '').map((result) => result.target);
    expect(targets).toContain('log');
    expect(targets).not.toContain('shop');
    expect(targets).not.toContain('pantry');
    expect(buildGlobalResults(app, 'rice').some((r) => r.type === 'pantry')).toBe(false);
  });

  it('offers all of it again with no mode set', () => {
    const open = { ...deriveApp(EMPTY_STATE), pantry: [{ id: 'p', name: 'Rice' }] };
    const targets = buildGlobalResults(open, '').map((result) => result.target);
    expect(targets).toContain('shop');
    expect(targets).toContain('pantry');
    expect(buildGlobalResults(open, 'rice').some((r) => r.type === 'pantry')).toBe(true);
  });
});
