import { FROZEN_DAYS } from './kitchen.js';
import { addDays } from './kitchen-dates.js';
import { daysUntil } from './kitchen.js';

/**
 * Freezer rescue: food going off within `within` days that the category
 * can honestly be frozen. Already-frozen rows, categories never frozen
 * (tins & jars) and rows with no recorded date are never offered.
 */
export const canFreeze = (item) => Boolean(item) && item.location !== 'Freezer'
  && Number.isFinite(FROZEN_DAYS[item.cat] ?? 90) && FROZEN_DAYS[item.cat] !== null;

export const freezeCandidates = ({ pantry = [], day = '', within = 2 } = {}) => {
  if (!day) return [];
  return (Array.isArray(pantry) ? pantry : [])
    .filter((p) => p?.expiry && canFreeze(p))
    .map((p) => ({ item: p, daysLeft: daysUntil(p.expiry, day) }))
    .filter((r) => Number.isFinite(r.daysLeft) && r.daysLeft >= 0 && r.daysLeft <= within)
    .sort((a, b) => a.daysLeft - b.daysLeft || String(a.item.name).localeCompare(String(b.item.name)));
};

/** The row after freezing: freezer clock starts today, quality window by category. */
export const freezePatch = (item, day) => {
  const limit = FROZEN_DAYS[item?.cat] ?? 90;
  return { location: 'Freezer', frozenAt: day, expiry: addDays(day, limit) };
};
