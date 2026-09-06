import { describe, expect, it } from 'vitest';
import { buildDeckGraph, deckMasteryRows } from '../src/domain/deck-graph';
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
    expect(shopping?.flashcards.due).toBe(1);
    expect(cooking?.mastery).toBeNull();
    expect(graph.totals.dueCards).toBe(1);
    expect(graph.totals.studiedCards).toBe(2);
  });
});
