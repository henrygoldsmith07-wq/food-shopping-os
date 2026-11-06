/**
 * "Got it out": the ingredients you have gathered for the recipe in front of
 * you, ticked off as you go. Kept for this browser tab only (sessionStorage),
 * so it survives a switch into cook mode and back but not tomorrow's dinner,
 * and it never touches the pantry: gathering is not using.
 */

import { useCallback, useState } from 'react';

const KEY = (recipeId) => `forq:ingredient-ticks:${recipeId}`;

const safe = (run, fallback) => {
  try { return run(); } catch { return fallback; }
};

export const readTicks = (recipeId) => {
  if (!recipeId) return [];
  const raw = safe(() => sessionStorage.getItem(KEY(recipeId)), null);
  const parsed = safe(() => JSON.parse(raw || '[]'), []);
  return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
};

export const writeTicks = (recipeId, names) => {
  if (!recipeId) return;
  safe(() => (names.length
    ? sessionStorage.setItem(KEY(recipeId), JSON.stringify(names))
    : sessionStorage.removeItem(KEY(recipeId))));
};

/** [ticked Set, toggle(name), clear()] for one recipe. */
export const useIngredientTicks = (recipeId) => {
  const [state, setState] = useState(() => ({ id: recipeId, names: readTicks(recipeId) }));
  // A different recipe in the same component starts from its own ticks.
  const names = state.id === recipeId ? state.names : readTicks(recipeId);
  const update = useCallback((next) => {
    writeTicks(recipeId, next);
    setState({ id: recipeId, names: next });
  }, [recipeId]);
  const toggle = useCallback((name) => {
    update(names.includes(name) ? names.filter((n) => n !== name) : [...names, name]);
  }, [names, update]);
  const clear = useCallback(() => update([]), [update]);
  return [new Set(names), toggle, clear];
};
