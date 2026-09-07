import { describe, expect, it } from 'vitest';
import { buildDeckGraph, deckMasteryRows, deckMistakeRows } from '../src/domain/deck-graph';
import { classifyTopic } from '../src/domain/topic-status';
import type { Card } from '../src/domain/types';

/**
 * Mastery is read from the deck's scheduling state, not invented: retention
 * is the share of studied cards not due, confidence normalises the reviewed
 * cards' mean ease, and a topic stays "Not started" until its first review —
 * a schedule that has never graded a card cannot claim a band.
 */
const NOW = new Date('2026-08-20T12:00:00Z');
const TODAY = '2026-08-20';

const card = (id: string, topicId: string, over: Partial<Card>): Card => ({
  id,
  userId: 'local',
  subjectId: 'kitchen',
  topicId,
  front: `${id} front`,
  back: `${id} back`,
  origin: 'auto',
  reps: 0,
  lapses: 0,
  ease: 2.5,
  intervalDays: 0,
  due: TODAY,
  createdAt: '2026-08-01T00:00:00Z',
  lastReviewedAt: null,
  ...over,
});

describe('deckMasteryRows — bands read from the schedule', () => {
  it('returns no row until a topic has its first review', () => {
    expect(deckMasteryRows([card('s1', 'shopping', {}), card('s2', 'shopping', {})], NOW)).toEqual([]);
  });

  it('holds a mature not-due card as retained and rates confidence from ease', () => {
    const rows = deckMasteryRows([
      // Reviewed five times, ease at the 2.5 ceiling, next review tomorrow.
      card('c1', 'cooking', { reps: 5, ease: 2.5, intervalDays: 21, due: '2026-08-21', lastReviewedAt: '2026-08-19T10:00:00Z' }),
    ], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      topicId: 'cooking',
      cardsTotal: 1,
      cardsDue: 0,
      attempts: 5,
      retention: 1,
      confidence: 1,
      lastStudiedAt: '2026-08-19T10:00:00Z',
    });
    // 70% retention + 30% confidence, all the way up.
    expect(rows[0].mastery).toBe(1);
    expect(rows[0].weak).toBe(false);
    expect(classifyTopic(rows[0]).status).toBe('covered');
  });

  it('a due card drags retention down and reads as needs-work', () => {
    const rows = deckMasteryRows([
      card('a', 'shopping', { reps: 5, ease: 2.5, intervalDays: 21, due: '2026-08-25' }),
      card('b', 'shopping', { reps: 3, ease: 2.0, intervalDays: 2, due: TODAY }),
    ], NOW);
    expect(rows).toHaveLength(1);
    // Half the studied cards are due now — retention 0.5; ease mean 2.25
    // sits 0.79 of the way from the 1.3 floor to the 2.5 ceiling.
    expect(rows[0].retention).toBeCloseTo(0.5, 3);
    expect(rows[0].confidence).toBeCloseTo(0.7917, 3);
    expect(rows[0].mastery).toBeCloseTo(0.5875, 3);
    expect(rows[0]).toMatchObject({ cardsDue: 1, attempts: 8, weak: true });
    // 0.59 sits in the in-progress band — due reviews pull it toward shaky.
    expect(classifyTopic(rows[0]).status).toBe('in-progress');
  });

  it('a card that keeps failing reads weaker than one that merely came due', () => {
    // Both are not-due (full retention), so retention cannot separate them.
    // The on-schedule card has never lapsed; the other has lapsed 3 times in
    // 5 reviews — its next review is in the future, but the failure history
    // must still drag it under the clean card.
    const onSchedule = deckMasteryRows([
      card('a', 'shopping', { reps: 4, ease: 2.5, intervalDays: 21, due: '2026-08-25', lapses: 0 }),
    ], NOW)[0];
    const lapseProne = deckMasteryRows([
      card('b', 'shopping', { reps: 5, ease: 2.5, intervalDays: 21, due: '2026-08-25', lapses: 3 }),
    ], NOW)[0];
    expect(onSchedule.mastery).toBe(1);
    expect(onSchedule).toMatchObject({ lapses: 0, lapseDrag: 1 });
    // The lapsed card's drag (1 − 3/5 = 0.4) drops it to 40% mastery.
    expect(lapseProne.mastery).toBeCloseTo(0.4, 3);
    expect(lapseProne).toMatchObject({ lapses: 3, lapseDrag: 0.4 });
    expect(lapseProne.mastery).toBeLessThan(onSchedule.mastery);
    expect(lapseProne.weak).toBe(true);
    expect(classifyTopic(lapseProne).status).toBe('in-progress');
  });

  it('heavier lapse rates drag the band further than lighter ones', () => {
    const mild = deckMasteryRows([
      // One lapse in ten reviews: a blip on a long-mature card.
      card('a', 'shopping', { reps: 10, ease: 2.5, intervalDays: 21, due: '2026-08-25', lapses: 1 }),
    ], NOW)[0];
    const severe = deckMasteryRows([
      // Two lapses in three reviews: the card is failing most of the time.
      card('b', 'shopping', { reps: 3, ease: 2.5, intervalDays: 21, due: '2026-08-25', lapses: 2 }),
    ], NOW)[0];
    expect(mild.lapseDrag).toBeCloseTo(2 / 3, 3); // 1 − 1/3
    expect(severe.lapseDrag).toBeCloseTo(0.5, 3); // 1 − 2/4
    expect(severe.mastery).toBeLessThan(mild.mastery);
    expect(mild.mastery).toBeCloseTo(2 / 3, 3);
    expect(severe.mastery).toBeCloseTo(0.5, 3);
    // A single blip on a mature card stays covered; failing most of the
    // reviews drops the topic under the covered line.
    expect(mild.weak).toBe(false);
    expect(severe.weak).toBe(true);
    expect(classifyTopic(severe).status).toBe('in-progress');
  });

  it('feeds the graph so the mastery node is real and totals add up', () => {
    const graph = buildDeckGraph([
      card('a', 'shopping', { reps: 5, ease: 2.5, intervalDays: 21, due: '2026-08-25' }),
      card('b', 'shopping', { reps: 3, ease: 2.0, intervalDays: 2, due: TODAY }),
      card('c', 'cooking', {}),
    ], NOW);
    const shopping = graph.units[0].topics.find((t) => t.topicId === 'shopping');
    const cooking = graph.units[0].topics.find((t) => t.topicId === 'cooking');
    // The mastered topic carries a band; the untouched one stays honest.
    expect(shopping?.mastery).not.toBeNull();
    expect(shopping?.mastery?.attempts).toBe(8);
    // The retention split rides with the node: 2 studied, 1 of them due.
    expect(shopping?.mastery?.studied).toBe(2);
    expect(shopping?.mastery?.cardsDue).toBe(1);
    expect(shopping?.flashcards.due).toBe(1);
    expect(cooking?.mastery).toBeNull();
    expect(graph.totals.dueCards).toBe(1);
    expect(graph.totals.studiedCards).toBe(2);
  });
});

describe('deckMistakeRows — the mistake level reads the review schedule', () => {
  it('a card whose last review was Again is one open mistake', () => {
    const rows = deckMistakeRows([
      card('a', 'shopping', { reps: 3, lapses: 2, ease: 1.7, lastRating: 'again', lastReviewedAt: '2026-08-19T10:00:00Z' }),
      // A clean card has no mistake to show.
      card('b', 'shopping', { reps: 4, ease: 2.5, lastRating: 'good' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'card-lapse:a',
      topicId: 'shopping',
      category: 'card-lapse',
      resolved: false,
    });
  });

  it('a lapsed card recovered by a successful review reads resolved, not open', () => {
    const rows = deckMistakeRows([
      card('a', 'shopping', { reps: 5, lapses: 1, ease: 2.0, lastRating: 'good', lastReviewedAt: '2026-08-19T10:00:00Z' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ resolved: true });
    expect(rows[0].description).toMatch(/reviewed successfully/);
  });

  it('a lapsed card from the pre-stamp scheduler stays silent — no outcome to read', () => {
    // lapses > 0 but no lastRating: the card predates the outcome stamp, so
    // the map must not guess whether its last review failed or recovered.
    expect(deckMistakeRows([card('a', 'shopping', { reps: 5, lapses: 2, ease: 1.7 })])).toEqual([]);
    expect(deckMistakeRows([card('a', 'shopping', {})])).toEqual([]);
  });

  it('feeds the graph: open and resolved mistakes land per topic and in totals', () => {
    const graph = buildDeckGraph([
      // Open: last review was Again.
      card('a', 'shopping', { reps: 3, lapses: 2, ease: 1.7, lastRating: 'again', lastReviewedAt: '2026-08-19T10:00:00Z' }),
      // Resolved: lapsed, then recovered.
      card('b', 'shopping', { reps: 5, lapses: 1, ease: 2.0, lastRating: 'good', lastReviewedAt: '2026-08-19T11:00:00Z' }),
      // Clean: no mistake.
      card('c', 'cooking', { reps: 4, ease: 2.5, lastRating: 'good' }),
    ], NOW);
    const shopping = graph.units[0].topics.find((t) => t.topicId === 'shopping');
    const cooking = graph.units[0].topics.find((t) => t.topicId === 'cooking');
    expect(shopping?.mistakes).toMatchObject({ total: 2, unresolved: 1, marksLost: 0 });
    expect(cooking?.mistakes).toMatchObject({ total: 0, unresolved: 0 });
    expect(graph.totals.unresolvedMistakes).toBe(1);
  });
});
