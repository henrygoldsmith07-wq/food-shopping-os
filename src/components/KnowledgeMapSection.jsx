import { useMemo } from 'react';
import { useApp } from '../lib/store.jsx';
import { buildDeckGraph } from '../domain/deck-graph';
import { KnowledgeMap } from './KnowledgeMap';
import { Section } from './ui.jsx';

/**
 * The deck, as a map. One subject ("Your kitchen"), one unit of the topic ids
 * the deck actually carries, every number real from the cards — and the
 * curriculum levels (spec statements, questions, mistakes, exam outlook)
 * honestly empty until content that can evidence them exists.
 *
 * `onReviewTopic` hands a topic's review to the queue: the map can see a
 * topic is covered or shaky, but only the queue can act on what is due.
 */
export default function KnowledgeMapSection({ onReviewTopic }) {
  const app = useApp();
  const cards = Array.isArray(app.cards) ? app.cards : [];
  const graph = useMemo(() => buildDeckGraph(cards), [cards]);
  // The action's count is the queue's count, not the map's studied-only
  // figure: a fresh card is due the day it appears, so it needs reviewing too.
  const dueCounts = useMemo(() => {
    const counts = {};
    for (const card of app.reviewDueCards()) {
      counts[card.topicId] = (counts[card.topicId] || 0) + 1;
    }
    return counts;
  }, [app.cards]);
  if (!cards.length) return null;
  return (
    <Section title="Kitchen knowledge map" className="rise rise-3">
      <KnowledgeMap graph={graph} dueCounts={dueCounts} onReviewTopic={onReviewTopic} />
    </Section>
  );
}
