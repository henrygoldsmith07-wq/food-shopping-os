/**
 * The screen registry is the navigation model, and this is what holds it to
 * the shape the product actually has: five permanent destinations, a handful
 * of contextual ones, one name each, and no screen that only some parts of the
 * app know about.
 */

import { describe, expect, it } from 'vitest';
import {
  BAR_TABS, MODULE_FOR_SCREEN, SCREENS, barIdsFor, labelFor, orderBarFor,
  screenById, titleFor,
} from '../src/lib/screens.js';
import { ALL_TABS, CONTEXTUAL_TABS, tabsForMode } from '../src/data/productModes.js';
import { MODULES } from '../src/data/modes.js';

describe('the screen registry', () => {
  it('is the five-tab hierarchy: Week, List, Plan, Cook, Recipes', () => {
    expect(BAR_TABS.map((screen) => screen.label)).toEqual(['Week', 'List', 'Plan', 'Cook', 'Recipes']);
    // The core loop, in the order it runs.
    expect(BAR_TABS.map((screen) => screen.id)).toEqual(['home', 'shop', 'plan', 'cook', 'recipes']);
  });

  it('keeps Log and Learn contextual rather than permanent tabs', () => {
    const contextual = SCREENS.filter((screen) => !screen.bar).map((screen) => screen.id);
    expect(contextual).toContain('log');
    expect(contextual).toContain('learn');
    // They are real screens, not deleted ones: each still has a title, a hint
    // and a glyph, and can still be navigated to.
    for (const id of contextual) {
      expect(titleFor(id)).toBeTruthy();
      expect(screenById[id].hint).toBeTruthy();
      expect(screenById[id].Icon).toBeTruthy();
    }
  });

  it('gives every screen one id, one label and one title', () => {
    const ids = SCREENS.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = SCREENS.map((screen) => screen.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const screen of SCREENS) {
      expect(screenById[screen.id]).toBe(screen);
      expect(labelFor(screen.id)).toBe(screen.label);
      expect(titleFor(screen.id)).toBe(screen.title);
    }
  });

  it('falls back to the id rather than rendering nothing for an unknown screen', () => {
    expect(labelFor('nope')).toBe('nope');
    expect(titleFor('nope')).toBe('nope');
  });

  it('maps every screen to a product module that exists', () => {
    const moduleIds = new Set(MODULES.map((module) => module.id));
    for (const screen of SCREENS) {
      const owner = MODULE_FOR_SCREEN[screen.id];
      expect(owner, `${screen.id} has no owning module`).toBeTruthy();
      expect(moduleIds.has(owner), `${screen.id} is owned by unknown module ${owner}`).toBe(true);
    }
  });

  it('never widens the bar, whatever a mode asks for', () => {
    // Even naming every contextual screen, the hierarchy stays five wide.
    const everything = orderBarFor([...ALL_TABS, ...CONTEXTUAL_TABS]);
    expect(everything).toHaveLength(BAR_TABS.length);
    expect(new Set(everything.map((s) => s.id)).size).toBe(BAR_TABS.length);
  });

  it('ignores a mode naming a screen that does not exist', () => {
    // A typo in a mode must not invent a destination.
    const tabs = barIdsFor(['home', 'not-a-screen']);
    expect(tabs).toHaveLength(BAR_TABS.length);
    expect(tabs.every((id) => screenById[id])).toBe(true);
  });

  it('leads with the week for every product mode', () => {
    for (const mode of ['meal_planning', 'shopping_budget', 'nutrition', 'household', 'everything']) {
      expect(tabsForMode(mode)[0], mode).toBe('home');
    }
  });
});
