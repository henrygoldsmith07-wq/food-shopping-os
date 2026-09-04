// SRS scheduling for flashcards. Pure domain: `now` is passed in so tests and
// renders stay deterministic; nothing here touches storage.

import type { Card, CardDraft } from "./types";

const DAY_MS = 86_400_000;
/** Starting ease for every new card (SM-2 default). */
export const INITIAL_EASE = 2.5;

/** The date key (`YYYY-MM-DD`) for a moment in time. */
export const dayStamp = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Day key `intervalDays` after `now`. */
export const dueAfter = (now: Date, intervalDays: number): string =>
  dayStamp(new Date(now.getTime() + intervalDays * DAY_MS));

/**
 * A brand-new card: due the day it is created, with a clean review history.
 * `reps` and `lapses` start at zero — the graph counts a card as studied only
 * after its first review — and the other SRS fields hold the SM-2 defaults so
 * a first rating has something to move.
 */
export function createCard(input: CardDraft, now: Date = new Date()): Card {
  return {
    ...input,
    reps: 0,
    lapses: 0,
    ease: INITIAL_EASE,
    intervalDays: 0,
    due: dayStamp(now),
    createdAt: now.toISOString(),
    lastReviewedAt: null,
  };
}
