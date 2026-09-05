import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import AddCardForm from './AddCardForm.jsx';
import { Section } from './ui.jsx';

/**
 * The Learn tab's standing creation surface: a card form that is always
 * visible above the review queue, so adding a card never hides behind a
 * queue state. Saving routes through the store's addCard exactly like the
 * queue's own form does — a new card is due the day it appears, so the queue
 * below picks it up immediately.
 *
 * When the deck is empty the section steps aside: the review queue's empty
 * state already opens a form there, and two stacked forms would be noise.
 */
export default function NewCardSection({ now = new Date() }) {
  const app = useApp();
  const deck = Array.isArray(app.cards) ? app.cards : [];
  const [saved, setSaved] = useState(0);

  if (!deck.length) return null;

  const save = (front, back, topic) => {
    app.addCard({
      userId: 'local',
      subjectId: 'manual',
      topicId: topic.trim() || 'general',
      front: front.trim(),
      back: back.trim(),
      origin: 'handmade',
    }, now);
    setSaved((n) => n + 1); // remounts the form, clearing its fields
  };

  return (
    <Section title="New card" className="rise rise-3">
      <div className="space-y-2">
        <p className="text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          A new card is due the day you add it — the queue below picks it up right away.
        </p>
        <AddCardForm key={saved} onSave={save} heading={false} />
        {saved > 0 && (
          <p className="text-[0.6875rem] font-extrabold" style={{ color: 'var(--good)' }}>
            Card saved — it is in the queue below.
          </p>
        )}
      </div>
    </Section>
  );
}