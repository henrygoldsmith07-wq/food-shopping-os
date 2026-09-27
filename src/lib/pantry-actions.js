import { householdPermission } from './household.js';
import { decrementPantryItem } from './kitchen.js';
import { learnHouseholdAlias, consolidatePantry as consolidate, normalisePantryItem } from './pantry-intelligence.js';
import { uid } from './state.js';

const eventFor = (type, state, details = {}) => ({
  id: uid('pe'),
  type,
  date: state.day,
  ...details,
});

const appendEvent = (state, event) => [...(state.pantryEvents || []), event].slice(-100);
const appendConflicts = (state, conflicts = []) => [...(state.pantryConflicts || []), ...conflicts].slice(-100);

export const pantryActions = (set) => ({
  /** Bulk delete, atomic on purpose: one snapshot, one undo reverses all. */
  removePantryItems: (ids) => set((state) => {
    if (!householdPermission(state, 'pantry')) return {};
    const gone = new Set(ids);
    const pantry = state.pantry.filter((entry) => !gone.has(entry.id));
    return pantry.length === state.pantry.length ? {} : { pantry };
  }),

  usePantryItem: (id) => set((state) => {
    if (!householdPermission(state, 'pantry')) return {};
    const item = state.pantry.find((entry) => entry.id === id);
    if (!item) return {};
    const confirmed = { ...item, confidence: 'definite', lastConfirmedAt: state.day, confidenceUpdatedAt: state.day, confirmationSource: 'manual-use' };
    const next = decrementPantryItem(confirmed);
    const event = eventFor('manual_consumption', state, { itemId: id, name: item.name, removed: next.remove });
    return {
      pantry: next.remove
        ? state.pantry.filter((entry) => entry.id !== id)
        : state.pantry.map((entry) => (entry.id === id ? next.item : entry)),
      pantryEvents: appendEvent(state, event),
      lastPantryEvent: event,
    };
  }),
  confirmPantryItem: (id, patch = {}) => set((state) => {
    if (!householdPermission(state, 'pantry')) return {};
    const item = state.pantry.find((entry) => entry.id === id);
    if (!item) return {};
    const next = normalisePantryItem({
      ...item,
      ...patch,
      ...(patch.qty ? { amountConfidence: null } : {}),
      confidence: 'definite',
      lastConfirmedAt: state.day,
      confidenceUpdatedAt: state.day,
      confirmationSource: 'manual',
    }, { learnedAliases: state.aliasMemory || {} });
    const event = eventFor('pantry_confirmation', state, { itemId: id, name: next.name });
    return {
      pantry: state.pantry.map((entry) => (entry.id === id ? next : entry)),
      pantryEvents: appendEvent(state, event),
      lastPantryEvent: event,
    };
  }),
  consolidatePantry: () => set((state) => {
    if (!householdPermission(state, 'pantry')) return {};
    const result = consolidate(state.pantry, { learnedAliases: state.aliasMemory || {}, today: state.day });
    const event = eventFor('pantry_consolidation', state, { merged: result.merged, conflicts: result.conflicts.length });
    return {
      pantry: result.pantry,
      pantryConflicts: appendConflicts(state, result.conflicts),
      pantryEvents: appendEvent(state, event),
      lastPantryEvent: event,
    };
  }),
  resolvePantryConflict: (id, resolution = 'dismiss') => set((state) => {
    if (!householdPermission(state, 'pantry')) return {};
    const conflict = (state.pantryConflicts || []).find((entry) => entry.id === id);
    if (!conflict) return {};
    let pantry = state.pantry;
    if (conflict.mine && conflict.theirs) {
      // Two devices changed one row differently (household-concurrency.js):
      // this device's copy is on the shelf, the household's copy waits here.
      // "Keep separate" shelves both, "Combine" merges what is measurable,
      // "Dismiss" keeps this device's copy — the record keeps both either way.
      const theirsRow = state.pantry.some((item) => item.id === conflict.theirs.id)
        ? { ...conflict.theirs, id: `${conflict.theirs.id}__alt`, conflict: true }
        : { ...conflict.theirs, conflict: true };
      if (resolution === 'keep_separate') {
        pantry = [...state.pantry, theirsRow];
      } else if (resolution === 'merge') {
        const withTheirs = [...state.pantry, theirsRow];
        const ids = new Set([conflict.mine.id, theirsRow.id].filter(Boolean));
        const selected = withTheirs.filter((item) => ids.has(item.id));
        const rest = withTheirs.filter((item) => !ids.has(item.id));
        pantry = [...rest, ...consolidate(selected, {
          learnedAliases: state.aliasMemory || {}, today: state.day, force: true,
        }).pantry];
      }
    } else if (resolution === 'merge' && conflict.itemIds?.length > 1) {
      const selected = state.pantry.filter((item) => conflict.itemIds.includes(item.id));
      const rest = state.pantry.filter((item) => !conflict.itemIds.includes(item.id));
      pantry = [...rest, ...consolidate(selected, {
        learnedAliases: state.aliasMemory || {}, today: state.day, force: true,
      }).pantry];
    }
    const nextConflicts = (state.pantryConflicts || []).map((entry) => (entry.id === id
      ? { ...entry, status: 'resolved', resolution, resolvedAt: state.day }
      : entry));
    const event = eventFor('pantry_conflict_resolution', state, { conflictId: id, resolution });
    return { pantry, pantryConflicts: nextConflicts, pantryEvents: appendEvent(state, event), lastPantryEvent: event };
  }),
  learnPantryAlias: ({ from, to } = {}) => set((state) => {
    if (!householdPermission(state, 'pantry')) return {};
    const aliasMemory = learnHouseholdAlias(state.aliasMemory || {}, from, to);
    if (aliasMemory === state.aliasMemory) return {};
    const result = consolidate(state.pantry, { learnedAliases: aliasMemory, today: state.day });
    const event = eventFor('household_alias_learned', state, { from, to, merged: result.merged });
    return {
      aliasMemory,
      pantry: result.pantry,
      pantryConflicts: appendConflicts(state, result.conflicts),
      pantryEvents: appendEvent(state, event),
      lastPantryEvent: event,
    };
  }),
});
