// SRS scheduling for flashcards — the whole review engine in one module.
//
// Half 1 (`createCard`) seeds a new card: due the day it appears, with SM-2
// defaults and a clean history. Half 2 (`gradeReview`) is the scheduler
// proper: given the card and how the answer went, it returns the next state —
// interval, ease, due date, and the rep/lapse counts the graph reads.
//
// Pure domain: `now` is passed in so tests and renders stay deterministic;
// nothing here touches storage or React.

import type { Card, CardDraft, Id } from "./types";

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

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------
//
// One review is one answer to one card. `gradeReview` is the whole scheduler:
// it takes the card's current state and a rating and returns the next state —
// new interval, ease, due date, and the rep/lapse counts the graph reads.
//
// Ratings, in Anki/SM-2 vocabulary:
//   again — forgotten. The card returns to learning (interval 0, due again on
//           the review day). If the card had been reviewed before, the miss is
//           a lapse: lapses +1 and ease −0.20, floored at MIN_EASE.
//   hard  — correct but effortful. Ease unchanged; interval grows slowly
//           (×1.2), never faster than a good review would.
//   good  — correct as expected. Ease unchanged; interval compounds at ease.
//   easy  — correct with no struggle. Ease +0.15, capped at MAX_EASE; interval
//           grows by an extra ×1.3 on top of a good review.
//
// The day is the smallest unit: a successful review lands `intervalDays` days
// after the review; an "again" lands back on the review day. Intervals round
// to whole days and ease to two decimals, so the schedule is deterministic.
// ---------------------------------------------------------------------------

export type Rating = "again" | "hard" | "good" | "easy";

/** Ease floor — a card never gets easier to forget than this. */
export const MIN_EASE = 1.3;
/** Ease ceiling, so repeated easy reviews cannot run away. */
export const MAX_EASE = 5;
/** Ease lost on a lapse. */
export const EASE_AGAIN_PENALTY = 0.2;
/** Ease gained on an easy review. */
export const EASE_EASY_BONUS = 0.15;
/** Extra interval multiplier an easy review earns over a good one. */
export const EASY_INTERVAL_BONUS = 1.3;
/** Interval multiplier a hard review earns — growth, not ease. */
export const HARD_INTERVAL_FACTOR = 1.2;
/** A first successful review graduates the card to a 1-day interval. */
export const GRADUATE_INTERVAL = 1;
/** An easy first review skips straight to a 2-day interval. */
export const GRADUATE_EASY_INTERVAL = 2;

const roundEase = (ease: number): number => Math.round(ease * 100) / 100;

const clampEase = (ease: number): number => Math.min(MAX_EASE, Math.max(MIN_EASE, ease));

/** The interval a successful review lands on, given where the card is now. */
function successInterval(card: Card, rating: Exclude<Rating, "again">): number {
  const prev = card.intervalDays;
  // Never graduated yet — any success graduates; easy skips a day ahead.
  if (prev <= 0) {
    return rating === "easy" ? GRADUATE_EASY_INTERVAL : GRADUATE_INTERVAL;
  }
  // Grown cards: hard crawls (×1.2), good compounds at ease, easy adds a
  // bonus on top of good. Each keeps a +1 floor so a schedule always moves.
  if (rating === "hard") {
    return Math.max(prev + 1, Math.round(prev * HARD_INTERVAL_FACTOR));
  }
  const good = Math.max(prev + 1, Math.round(prev * card.ease));
  if (rating === "easy") {
    return Math.max(good + 1, Math.round(good * EASY_INTERVAL_BONUS));
  }
  return good;
}

/**
 * Grade one review and return the card's next state. Pure: the input card is
 * left untouched; the caller stores the returned card in its place.
 *
 * `reps` counts every review — the graph treats reps > 0 as "studied". A miss
 * only counts as a `lapse` once the card has been reviewed before: failing a
 * card on first sight is still learning; forgetting one you had already seen
 * is a lapse, and lapses are what shake a concept in the graph.
 */
export function gradeReview(card: Card, rating: Rating, now: Date = new Date()): Card {
  const reviewedAt = now.toISOString();
  const alreadySeen = card.reps > 0;

  if (rating === "again") {
    return {
      ...card,
      reps: card.reps + 1,
      lapses: card.lapses + (alreadySeen ? 1 : 0),
      ease: alreadySeen ? clampEase(roundEase(card.ease - EASE_AGAIN_PENALTY)) : card.ease,
      intervalDays: 0,
      due: dayStamp(now),
      lastReviewedAt: reviewedAt,
    };
  }

  const intervalDays = successInterval(card, rating);
  return {
    ...card,
    reps: card.reps + 1,
    ease: rating === "easy" ? clampEase(roundEase(card.ease + EASE_EASY_BONUS)) : card.ease,
    intervalDays,
    due: dueAfter(now, intervalDays),
    lastReviewedAt: reviewedAt,
  };
}

/**
 * Whether a card is up for review on `now`'s day. Day keys compare
 * lexicographically (YYYY-MM-DD), so a card created today is due immediately
 * and a graduated card becomes due once its interval has elapsed.
 */
export const isDue = (card: Card, now: Date = new Date()): boolean => card.due <= dayStamp(now);

/**
 * The cards up for review on `now`'s day — the review queue. Ordered by due
 * day then id, so a review screen shows the same stable queue every render
 * and the oldest debt surfaces first.
 */
export const dueCards = (cards: Card[], now: Date = new Date()): Card[] =>
  cards
    .filter((card) => isDue(card, now))
    .sort((a, b) =>
      a.due === b.due ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.due < b.due ? -1 : 1,
    );

/**
 * Grade the card with `id` and return the next deck with the graded card in
 * its place. A card that is not in the deck leaves the deck's contents
 * untouched — callers can treat a missing card as a no-op, not a failure.
 */
export function rateCard(cards: Card[], id: Id, rating: Rating, now: Date = new Date()): Card[] {
  return cards.map((card) => (card.id === id ? gradeReview(card, rating, now) : card));
}
