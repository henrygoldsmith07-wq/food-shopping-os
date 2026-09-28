/**
 * Community-observed prices for the current list.
 *
 * This is a data-fetching concern, not a rendering one: it decides *when* to
 * ask (never offline, never while already busy, never for an empty list), how
 * to say no, and what it last learned. It used to be six pieces of state and a
 * try/catch inside the shopping screen's coordinator, which meant the screen
 * owned a network policy it had no other reason to care about.
 *
 * The screen asks for `check()` when the person asks for a price check, and
 * reads `byKey` / `meta` / `error` when it renders. Nothing here touches the
 * shopping list itself.
 */

import { useCallback, useState } from 'react';
import { clearObservedPriceCache, fetchObservedForList } from './observed-prices.js';

const messageFor = (error) => {
  if (error?.status === 401) return 'Sign in to check community observations.';
  if (error?.status === 429) return 'Too many checks — try again in a few minutes.';
  return error?.message || 'Community observations unavailable.';
};

export const useObservedPrices = ({ items, offlineMode, isOnline }) => {
  const [byKey, setByKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // What the numbers on screen are, and when they were true. Never dropped: a
  // price without a timestamp reads as a fact rather than an observation.
  const [meta, setMeta] = useState(null);

  const check = useCallback(async () => {
    if (!items.length || busy || offlineMode || !isOnline) return;
    setBusy(true);
    setError('');
    try {
      const result = await fetchObservedForList(items);
      setByKey(result.byKey);
      setMeta({ checkedAt: result.checkedAt, fromCache: result.fromCache, fetched: result.fetched });
    } catch (fetchError) {
      setError(messageFor(fetchError));
    } finally {
      setBusy(false);
    }
  }, [items, busy, offlineMode, isOnline]);

  const refresh = useCallback(async () => {
    clearObservedPriceCache();
    setByKey(null);
    setMeta(null);
    await check();
  }, [check]);

  return { byKey, busy, error, meta, check, refresh };
};
