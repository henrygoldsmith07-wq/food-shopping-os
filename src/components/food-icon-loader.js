/**
 * The food icon set, loaded after first paint.
 *
 * ~45 drawings and their name rules are a few kilobytes the week screen does
 * not need before it is usable, so they live in their own chunk. Until it
 * lands, a row shows its catalogue glyph (or the plate); then every mounted
 * icon re-renders once with the specific one.
 */

import { useEffect, useSyncExternalStore } from 'react';

let icons = null;
let loading = null;
const listeners = new Set();

/** Load the set (once). Resolves to the module. */
export const loadFoodIcons = () => {
  loading ||= import('./food-icons.jsx').then((module) => {
    icons = module;
    listeners.forEach((listener) => listener());
    return module;
  });
  return loading;
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => icons;

/** The loaded set, or null on first paint; asks for it if nobody has yet. */
export const useFoodIcons = () => {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!current) loadFoodIcons().catch(() => {});
  }, [current]);
  return current;
};
