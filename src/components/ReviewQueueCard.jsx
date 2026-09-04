import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Card, Pill, Section } from './ui.jsx';
import { dayStamp } from '../domain/scheduling';

/** The four ratings, in the order the scheduler's ease curve expects. */
const RATINGS = [
  { id: 'again', label: 'Again', hint: 'forgot it', tone: 'var(--danger)' },
  { id: 'hard', label: 'Hard', hint: 'effortful', tone: 'var(--warn)' },
  { id: 'good', label: 'Good', hint: 'knew it', tone: 'var(--good)' },
  { id: 'easy', label: 'Easy', hint: 'too easy', tone: 'var(--accent)' },
];

/**
 * The SRS review queue on the Learn tab. Shows the soonest-due card, flips it
 * to reveal the answer, and grades it through the store's reviewCard — which
 * persists the scheduler's next state. A card rated Again stays in the queue
 * (it is due again today, the relearning step); any other rating advances it
 * out. `now` is injectable so tests and renders stay deterministic.
 */
export default function ReviewQueueCard({ now = new Date() }) {
  const app = useApp();
  const deck = Array.isArray(app.cards) ? app.cards : [];
  const queue = useMemo(() => app.reviewDueCards(now), [app.cards, now]);
  const [flipped, setFlipped] = useState(false);
  const current = queue[0] ?? null;

  const rate = (rating) => {
    if (!current) return;
    app.reviewCard(current.id, rating, now);
    setFlipped(false);
  };

  const nextDue = useMemo(() => {
    const today = dayStamp(now);
    const later = deck.filter((c) => c.due > today).sort((a, b) => (a.due < b.due ? -1 : 1));
    return later[0]?.due ?? null;
  }, [deck, now]);

  return (
    <Section title="Flashcard review" className="rise rise-3">
      <Card className="!p-4">
        {!deck.length ? (
          <>
            <p className="text-[0.9375rem] font-extrabold">No cards yet</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              Add a card from a question or topic you want to keep. A new card is due the day it appears, so the queue starts the moment your deck does.
            </p>
          </>
        ) : !current ? (
          <>
            <p className="text-[0.9375rem] font-extrabold">Nothing due today</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {nextDue
                ? `The next card matures on ${nextDue}. Come back then — or add another card to review sooner.`
                : 'Every card in your deck has been reviewed. Add more to keep the queue going.'}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                Due now
              </p>
              <Pill tone="muted">{queue.length} to review</Pill>
            </div>

            <div className="mt-3 rounded-2xl border px-4 py-5 text-center" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
              <p className="text-[1.0625rem] font-extrabold leading-snug">{current.front}</p>
              <p className="mt-1.5 text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                {flipped ? 'Answer' : 'Question'}
              </p>
            </div>

            {flipped ? (
              <>
                <p className="mt-3 rounded-2xl px-4 py-3 text-[0.9375rem] font-bold leading-relaxed" style={{ background: 'color-mix(in srgb, var(--good) 8%, transparent)' }}>
                  {current.back}
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {RATINGS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-label={`Rate ${r.label} — ${r.hint}`}
                      onClick={() => rate(r.id)}
                      className="press rounded-xl border px-2 py-2.5 text-center"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <span className="block text-[0.8125rem] font-extrabold" style={{ color: r.tone }}>{r.label}</span>
                      <span className="mt-0.5 block text-[0.5625rem] font-semibold" style={{ color: 'var(--faint)' }}>{r.hint}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                aria-label="Reveal answer"
                onClick={() => setFlipped(true)}
                className="press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[0.84375rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                <Eye size={15} /> Reveal answer
              </button>
            )}
          </>
        )}
      </Card>
    </Section>
  );
}