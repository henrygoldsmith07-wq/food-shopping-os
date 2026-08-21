import { describe, it, expect } from 'vitest';
import {
  CORE_LOOP,
  OPTIONAL_TOOLS,
  OPTIONAL_TOOL_IDS,
  DEFAULT_ENABLED_TOOLS,
  ALL_ENABLED_TOOLS,
  isToolEnabled,
  normaliseEnabledTools,
  ADVANCED_VIEW_TOOL,
  ANALYTICS_VIEW_TOOL,
} from '../src/data/optionalTools.js';
import { applyProductMode } from '../src/data/productModes.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';
import { preferenceActions } from '../src/lib/preference-actions.js';

describe('progressive disclosure / optional tools', () => {
  it('defines the core plan–list–shop–pantry–cook loop', () => {
    expect(CORE_LOOP.map((s) => s.id)).toEqual(['plan', 'list', 'shop', 'pantry', 'cook']);
  });

  it('lists secondary tools that new users should not see by default', () => {
    for (const id of [
      'exercise', 'cycle', 'bloods', 'fasting', 'carbon', 'receipt', 'reports', 'coach', 'assistant',
    ]) {
      expect(OPTIONAL_TOOL_IDS).toContain(id);
    }
    expect(DEFAULT_ENABLED_TOOLS).toEqual([]);
    expect(OPTIONAL_TOOLS.length).toBe(OPTIONAL_TOOL_IDS.length);
  });

  it('starts empty for focused product modes and full for Everything', () => {
    expect(applyProductMode('meal_planning').enabledTools).toEqual([]);
    expect(applyProductMode('nutrition').enabledTools).toEqual([]);
    expect(applyProductMode('everything').enabledTools).toEqual([...ALL_ENABLED_TOOLS]);
  });

  it('does not overwrite enabledTools when already set on the profile', () => {
    const applied = applyProductMode('meal_planning', { enabledTools: ['receipt'] });
    expect(applied.enabledTools).toEqual(['receipt']);
  });

  it('gates unknown tools as always available and known tools by the list', () => {
    expect(isToolEnabled([], 'not-a-tool')).toBe(true);
    expect(isToolEnabled([], 'exercise')).toBe(false);
    expect(isToolEnabled(['exercise'], 'exercise')).toBe(true);
    expect(normaliseEnabledTools(['exercise', 'nope', 'carbon'])).toEqual(['exercise', 'carbon']);
  });

  it('maps advanced and analytics views to optional tools', () => {
    expect(ADVANCED_VIEW_TOOL.planet).toBe('carbon');
    expect(ADVANCED_VIEW_TOOL.fasting).toBe('fasting');
    expect(ADVANCED_VIEW_TOOL.results).toBe('bloods');
    expect(ANALYTICS_VIEW_TOOL.impact).toBe('carbon');
    expect(ANALYTICS_VIEW_TOOL.reports).toBe('reports');
  });

  it('deriveApp exposes hasTool against enabledTools', () => {
    const off = deriveApp({ ...EMPTY_STATE, enabledTools: [] });
    expect(off.hasTool('receipt')).toBe(false);
    expect(off.hasTool('exercise')).toBe(false);
    const on = deriveApp({ ...EMPTY_STATE, enabledTools: ['receipt', 'coach'] });
    expect(on.hasTool('receipt')).toBe(true);
    expect(on.hasTool('coach')).toBe(true);
    expect(on.enabledTools).toEqual(['receipt', 'coach']);
  });

  it('preference actions toggle tools and clear cycle tracking when cycle is removed', () => {
    let state = { enabledTools: [], trackCycle: false };
    const set = (fn) => {
      const patch = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...patch };
    };
    const actions = preferenceActions(set);
    actions.toggleOptionalTool('exercise');
    expect(state.enabledTools).toContain('exercise');
    actions.toggleOptionalTool('cycle');
    expect(state.enabledTools).toContain('cycle');
    expect(state.trackCycle).toBe(true);
    actions.toggleOptionalTool('cycle');
    expect(state.enabledTools).not.toContain('cycle');
    expect(state.trackCycle).toBe(false);
    actions.resetOptionalTools();
    expect(state.enabledTools).toEqual([]);
  });

  it('EMPTY_STATE starts with no optional tools', () => {
    expect(EMPTY_STATE.enabledTools).toEqual([]);
  });
});
