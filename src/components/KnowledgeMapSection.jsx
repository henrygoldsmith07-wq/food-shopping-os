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
 */
export default function KnowledgeMapSection() {
  const app = useApp();
  const cards = Array.isArray(app.cards) ? app.cards : [];
  const graph = useMemo(() => buildDeckGraph(cards), [cards]);
  if (!cards.length) return null;
  return (
    <Section title="Kitchen knowledge map" className="rise rise-3">
      <KnowledgeMap graph={graph} />
    </Section>
  );
}
