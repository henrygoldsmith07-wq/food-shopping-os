/**
 * The store's preference actions.
 *
 * Each list is a set of known ids — an unknown one is dropped rather than
 * stored, because a preference the filters don't recognise is a rule you think
 * you set and the app has never heard of.
 */

import {
  allergenBy, CUISINES, DEFAULT_UNITS, DEFAULT_WIDGETS, intoleranceBy, religiousBy, skillBy,
  timeBudgetBy, UNIT_CHOICES, WIDGETS,
} from '../data/preferences.js';
import { MODE_IDS } from '../data/modes.js';
import { OPTIONAL_TOOL_IDS } from '../data/optionalTools.js';
import { cleanModes } from './modes.js';
import { youthConsentRecord } from './youth.js';
import { moveBefore } from './utils.js';

const toggleIn = (list = [], id, valid) => {
  if (!valid(id)) return list;
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
};

const unitKeys = Object.fromEntries(UNIT_CHOICES.map((c) => [c.key, c.options.map(([id]) => id)]));

export const preferenceActions = (set) => ({
  /**
   * The under-18 consent answer, recorded rather than assumed. Passing null
   * withdraws it, which puts the question back rather than quietly keeping an
   * old yes on file.
   */
  setYouthConsent: (patch) =>
    set((s) => ({
      youthConsent: patch === null
        ? null
        : { ...youthConsentRecord(s.day), ...(s.youthConsent || {}), ...(patch || {}) },
    })),

  /** An allergy is a hard line: adding one immediately removes recipes. */
  toggleAllergy: (id) => set((s) => ({ allergies: toggleIn(s.allergies, id, (x) => Boolean(allergenBy[x])) })),
  toggleIntolerance: (id) => set((s) => ({ intolerances: toggleIn(s.intolerances, id, (x) => Boolean(intoleranceBy[x])) })),
  toggleReligious: (id) => set((s) => ({ religious: toggleIn(s.religious, id, (x) => Boolean(religiousBy[x])) })),
  toggleCuisine: (name) => set((s) => ({ cuisines: toggleIn(s.cuisines, name, (x) => CUISINES.includes(x)) })),

  setSkill: (id) => set((s) => (skillBy[id] ? { skill: id } : s.skill && {})),
  setTimeBudget: (id) => set((s) => (timeBudgetBy[id] ? { timeBudget: id } : s.timeBudget && {})),

  /** One unit at a time; anything unrecognised leaves the setting alone. */
  setUnit: (key, value) =>
    set((s) => ((unitKeys[key] || []).includes(value)
      ? { units: { ...s.units, [key]: value } }
      : {})),
  resetUnits: () => set({ units: { ...DEFAULT_UNITS } }),

  /** Home layout: which cards, in what order. Null means the default. */
  toggleWidget: (id) =>
    set((s) => {
      const widget = WIDGETS.find((w) => w.id === id);
      if (!widget || widget.fixed) return {}; // the rings are the point of Home
      const current = s.widgets || DEFAULT_WIDGETS;
      return { widgets: current.includes(id) ? current.filter((w) => w !== id) : [...current, id] };
    }),
  moveWidget: (id, by) =>
    set((s) => {
      const current = [...(s.widgets || DEFAULT_WIDGETS)];
      const from = current.indexOf(id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= current.length) return {};
      current.splice(to, 0, current.splice(from, 1)[0]);
      return { widgets: current };
    }),
  moveWidgetTo: (id, beforeId) =>
    set((s) => {
      const current = [...(s.widgets || DEFAULT_WIDGETS)];
      const widgets = moveBefore(current, id, beforeId, (widgetId) => widgetId);
      return widgets === current ? {} : { widgets };
    }),
  resetWidgets: () => set({ widgets: null }),

  /**
   * What you're using Forq for. This is a view setting and nothing more: it
   * changes which modules are on screen, and no record is touched, moved or
   * stopped being counted by it. Clearing it shows everything again.
   */
  toggleMode: (id) => set((s) => ({ modes: cleanModes(toggleIn(s.modes || [], id, (x) => MODE_IDS.includes(x))) })),
  setModes: (list) => set({ modes: cleanModes(list) }),
  clearModes: () => set({ modes: [] }),
  toggleOptionalTool: (id) => set((s) => {
    if (!OPTIONAL_TOOL_IDS.includes(id)) return {};
    const next = (s.enabledTools || []).includes(id) ? (s.enabledTools || []).filter((x) => x !== id) : [...(s.enabledTools || []), id];
    const patch = { enabledTools: next };
    if (id === 'cycle' && !next.includes('cycle')) patch.trackCycle = false;
    if (id === 'cycle' && next.includes('cycle')) patch.trackCycle = true;
    return patch;
  }),
  resetOptionalTools: () => set({ enabledTools: [] }),
});

/* ---------- Advanced: things measured or imported elsewhere ---------- */

/**
 * These all record something that happened outside the app — a lab result, a
 * sensor's export, a fast you started. Each is bounded on the way in, and none
 * of them is ever generated.
 */
export const advancedActions = (set, uid) => ({
  /** One blood panel, as your report printed it. */
  addBloods: ({ date, values, lab, note }) =>
    set((s) => {
      const clean = Object.fromEntries(
        Object.entries(values || {})
          .map(([key, value]) => [key, Number(value)])
          .filter(([, value]) => Number.isFinite(value) && value >= 0),
      );
      if (!Object.keys(clean).length) return {};
      return {
        bloods: [...s.bloods, {
          id: uid('bl'),
          date: date || s.day,
          values: clean,
          lab: String(lab || '').slice(0, 40),
          note: String(note || '').slice(0, 120),
        }].sort((a, b) => a.date.localeCompare(b.date)),
      };
    }),
  removeBloods: (id) => set((s) => ({ bloods: s.bloods.filter((b) => b.id !== id) })),

  /** A CGM export replaces the days it covers rather than doubling them up. */
  importGlucose: (readings = []) =>
    set((s) => {
      if (!readings.length) return {};
      const covered = new Set(readings.map((r) => r.date));
      const kept = s.glucose.filter((r) => !covered.has(r.date));
      return { glucose: [...kept, ...readings].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)) };
    }),
  clearGlucose: () => set({ glucose: [] }),

  /** A fast you're in has to be one you started — the app won't infer it. */
  startFast: (plan, hours) => set({ fast: { startedAt: Date.now(), plan, hours: Number(hours) || null } }),
  endFast: () => set({ fast: null }),
  setFastPlan: (plan) => set({ fastPlan: plan }),
});
