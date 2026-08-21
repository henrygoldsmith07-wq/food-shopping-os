/**
 * Turning "what I'm here for" into what the app shows.
 *
 * Everything in this file is a *view* over state. Nothing here writes, deletes
 * or migrates anything, which is what lets the app promise that hiding a
 * module keeps every record it holds — the records are never consulted to
 * decide visibility, and visibility is never consulted to decide a total.
 *
 * No modes selected means no filter at all. That is the honest default: a new
 * install has said nothing about what it wants, so it is shown everything.
 */

import { ALWAYS_ON, MODE_IDS, MODULES, PRODUCT_MODES, moduleBy } from '../data/modes.js';

/** Only ids we recognise; an unknown mode is dropped rather than obeyed. */
export const cleanModes = (modes = []) => [...new Set(
  (Array.isArray(modes) ? modes : []).filter((id) => MODE_IDS.includes(id)),
)];

/**
 * Which modules are on. With nothing selected every module is on — the app
 * does not guess an intent from behaviour and quietly hide half of itself.
 */
export const activeModules = (modes = []) => {
  const chosen = cleanModes(modes);
  if (!chosen.length) return new Set(MODULES.map((module) => module.id));
  const needed = chosen.flatMap((id) => PRODUCT_MODES.find((mode) => mode.id === id)?.needs || []);
  return new Set([...ALWAYS_ON, ...needed]);
};

export const moduleOn = (id, modes = []) => activeModules(modes).has(id);

/** The bottom bar, in the app's own order, minus what this intent doesn't use. */
export const visibleTabs = (modes = [], tabs = []) => {
  const on = activeModules(modes);
  const byTab = Object.fromEntries(MODULES.filter((m) => m.tab).map((m) => [m.tab, m.id]));
  // A tab no module claims is not something a mode gets to hide.
  return tabs.filter((tab) => !byTab[tab] || on.has(byTab[tab]));
};

/** Home cards belonging to a hidden module, dropped from the layout you chose. */
export const visibleWidgets = (widgets = [], modes = []) => {
  const on = activeModules(modes);
  const owner = {};
  MODULES.forEach((module) => (module.widgets || []).forEach((id) => { owner[id] = module.id; }));
  return widgets.filter((id) => !owner[id] || on.has(owner[id]));
};

/** How many records a module is holding — the proof that hiding kept them. */
const RECORDS = {
  plan: (s) => [Object.keys(s.plan || {}).length, 'planned day'],
  shop: (s) => [(s.shoppingList || []).length + (s.shops || []).length, 'list item and shop'],
  recipes: (s) => [(s.myRecipes || []).length + (s.favourites || []).length, 'saved recipe'],
  log: (s) => [Object.values(s.log || {}).reduce((n, day) => n + (day?.length || 0), 0), 'diary entry'],
  pantry: (s) => [(s.pantry || []).length, 'pantry item'],
  nutrition: (s) => [Object.keys(s.log || {}).length, 'logged day'],
  waste: (s) => [(s.waste || []).length, 'waste record'],
  household: (s) => [(s.members || []).length + (s.chores || []).length, 'member and task'],
  health: (s) => [(s.measurements || []).length + (s.workouts || []).length, 'measurement and session'],
  progress: (s) => [(s.cooked || []).length, 'cooked meal'],
  reminders: (s) => [(s.reminders || []).length, 'reminder'],
};

/** "12 pantry items" — or nothing at all, when the module never held any. */
export const keptRecords = (state = {}, id) => {
  const read = RECORDS[id];
  if (!read) return '';
  const [count, noun] = read(state);
  if (!count) return '';
  return `${count} ${noun}${count === 1 ? '' : 's'} kept`;
};

/**
 * What the current modes are hiding, and what each hidden module is still
 * holding for you. Shown rather than implied: a person who cannot see their
 * pantry has no way to know it is still there.
 */
export const hiddenModules = (state = {}, modes = state.modes) => {
  const on = activeModules(modes);
  return MODULES
    .filter((module) => !on.has(module.id))
    .map((module) => ({ id: module.id, label: module.label, records: keptRecords(state, module.id) }));
};

/** The modes in a sentence, for a settings row. */
export const modesSummary = (modes = []) => {
  const chosen = cleanModes(modes);
  if (!chosen.length) return 'Everything is shown';
  return chosen.map((id) => PRODUCT_MODES.find((mode) => mode.id === id)?.label).filter(Boolean).join(' · ');
};

/** Whether a module a screen wants to open is currently on. */
export const moduleLabel = (id) => moduleBy[id]?.label || id;
