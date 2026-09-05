import { useMemo, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import AddCardForm from './AddCardForm.jsx';
import { Card, Pill, Section } from './ui.jsx';
import { dayStamp, dueTopicGroups, forecastDueCounts } from '../domain/scheduling';
import { topicLabel } from '../domain/topic-labels';

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
 *
 * A card is created right here, through the store's addCard: an empty deck
 * shows the form straight away (the queue starts the moment the first card is
 * saved), and a deck with cards can add another from the review header.
 */
export default function ReviewQueueCard({ now = new Date() }) {
  const app = useApp();
  const deck = Array.isArray(app.cards) ? app.cards : [];
  const allQueue = useMemo(() => app.reviewDueCards(now), [app.cards, now]);
  // One topic at a time: the due queue grouped by topic, biggest debt first.
  // Focusing filters the session to that topic — the bar shows every topic's
  // count either way, so the rest of the debt stays visible and honest.
  const topicGroups = useMemo(() => dueTopicGroups(deck, now), [deck, now]);
  const [focusedTopic, setFocusedTopic] = useState(null);
  // What a refresh would change, shown before it is applied — stale answers
  // as old → new plus any new questions — so the tap confirms rather than
  // surprises.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPlan, setPreviewPlan] = useState(null);
  const queue = useMemo(
    () => (focusedTopic ? allQueue.filter((c) => c.topicId === focusedTopic) : allQueue),
    [allQueue, focusedTopic],
  );
  const [flipped, setFlipped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');
  const current = queue[0] ?? null;
  const empty = !deck.length;
  const focusable = topicGroups.length > 1;

  const rate = (rating) => {
    if (!current) return;
    app.reviewCard(current.id, rating, now);
    setFlipped(false);
    setEditingTopic(false);
    // A focused topic's last card just left the queue — fall back to All so
    // the session continues into the next topic instead of hitting a wall.
    if (focusedTopic && queue.length <= 1) setFocusedTopic(null);
  };

  const openRefreshPreview = () => {
    setPreviewPlan(app.kitchenSeedPreview(now));
    setPreviewOpen(true);
  };

  const startRetag = () => {
    setTopicDraft(current.topicId && current.topicId !== 'general' ? current.topicId : '');
    setEditingTopic(true);
    setFlipped(false);
  };

  const saveTopic = () => {
    app.retagCard(current.id, topicDraft);
    setEditingTopic(false);
    setFlipped(false);
  };

  const save = (front, back, topic) => {
    app.addCard({
      userId: 'local',
      subjectId: 'manual',
      topicId: topic.trim() || 'general',
      front: front.trim(),
      back: back.trim(),
      origin: 'handmade',
    }, now);
    setAdding(false);
    setFlipped(false);
  };

  const pickTopic = (topicId) => {
    setFocusedTopic((prev) => (prev === topicId ? null : topicId));
    setFlipped(false);
  };

  const nextDue = useMemo(() => {
    const today = dayStamp(now);
    const later = deck.filter((c) => c.due > today).sort((a, b) => (a.due < b.due ? -1 : 1));
    return later[0]?.due ?? null;
  }, [deck, now]);
  // The week ahead: cards landing on each of the next 7 days, so a user can
  // see the workload coming instead of meeting it one morning at a time.
  const forecast = useMemo(() => forecastDueCounts(deck, now, 7), [deck, now]);
  const peak = Math.max(...forecast.map((d) => d.count), 1);
  // Questions your own activity would seed — count only, so the empty state
  // can offer the deck honestly (and hide it when there is nothing to build).
  const seedable = useMemo(() => app.kitchenSeedCount(now), [app, app.cards, now]);
  // The forget opt-out: how many kitchen cards would go, and whether the user
  // is mid-confirmation. Only origin:'auto' cards ever leave.
  const autoCount = useMemo(() => deck.filter((c) => c.origin === 'auto').length, [deck]);
  const [confirmingForget, setConfirmingForget] = useState(false);
  const forgotten = Boolean(app.kitchenCardsForgotten);
  const confirmForget = confirmingForget && autoCount > 0 && (
    <div className="mb-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
      <p className="text-[0.78125rem] font-bold">
        Remove {autoCount} kitchen card{autoCount === 1 ? '' : 's'}? Your own cards stay.
      </p>
      <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Undo works right after — and kitchen cards can be brought back any time.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          aria-label="Confirm removing kitchen cards"
          onClick={() => {
            app.forgetKitchenCards();
            setConfirmingForget(false);
            setFocusedTopic(null);
            setFlipped(false);
            setEditingTopic(false);
          }}
          className="press rounded-xl border px-3 py-2 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          Remove
        </button>
        <button
          type="button"
          aria-label="Keep kitchen cards"
          onClick={() => setConfirmingForget(false)}
          className="press text-[0.78125rem] font-bold"
          style={{ color: 'var(--faint)' }}
        >
          Keep
        </button>
      </div>
    </div>
  );

  return (
    <Section title="Flashcard review" className="rise rise-3">
      <Card className="!p-4">
        {!empty && !adding && (
          <div className="mb-3" aria-label="Week-ahead forecast">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Coming up
            </p>
            <div className="mt-1.5 flex items-end justify-between gap-1">
              {forecast.map((day) => {
                const isToday = day.date === dayStamp(now);
                return (
                  <div
                    key={day.date}
                    aria-label={`${day.count} cards due on ${day.date}`}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-md"
                      style={{
                        height: day.count > 0 ? `${6 + (day.count / peak) * 18}px` : '2px',
                        background: day.count > 0 ? 'var(--accent)' : 'var(--line)',
                        opacity: isToday || day.count > 0 ? 1 : 0.45,
                      }}
                    />
                    <span
                      className="text-[0.5625rem] font-bold"
                      style={{ color: isToday ? 'var(--accent)' : 'var(--faint)' }}
                    >
                      {isToday ? 'Today' : day.date.slice(8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {previewOpen && previewPlan && (
          <div className="mb-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
            <p className="text-[0.78125rem] font-bold">What refreshing would change</p>
            {previewPlan.total === 0 ? (
              <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Everything is already current — nothing to refresh.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {previewPlan.updates.map((u) => (
                  <li key={u.front} className="text-[0.6875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
                    <span className="font-extrabold" style={{ color: 'var(--ink)' }}>{u.front}</span>
                    <span className="block">{u.oldBack} <span aria-hidden="true" style={{ color: 'var(--faint)' }}>→</span> {u.newBack}</span>
                  </li>
                ))}
                {previewPlan.additions.map((a) => (
                  <li key={a.front} className="text-[0.6875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
                    <span className="font-extrabold" style={{ color: 'var(--ink)' }}>New question</span>
                    <span className="block">{a.front}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2.5 flex items-center gap-3">
              <button
                type="button"
                aria-label="Apply refresh changes"
                onClick={() => {
                  app.seedCardsFromActivity(now);
                  setPreviewOpen(false);
                  setFlipped(false);
                }}
                className="press rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                Apply
              </button>
              <button
                type="button"
                aria-label="Cancel refresh"
                onClick={() => setPreviewOpen(false)}
                className="press text-[0.78125rem] font-bold"
                style={{ color: 'var(--faint)' }}
              >
                Keep as is
              </button>
            </div>
          </div>
        )}
        {confirmForget}
        {empty ? (
          <>
            <p className="text-[0.9375rem] font-extrabold">No cards yet</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              Build cards from your real kitchen — what you bought, what's next to expire — or add one by hand. A new card is due the day it appears, so the queue starts the moment your deck does.
            </p>
            {forgotten && (
              <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Kitchen cards are turned off — bring them back whenever you like.
              </p>
            )}
            {seedable > 0 && !forgotten && (
              <button
                type="button"
                onClick={() => app.seedCardsFromActivity(now)}
                className="press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[0.84375rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                Build a deck from your kitchen
              </button>
            )}
            {forgotten && (
              <button
                type="button"
                onClick={() => app.seedCardsFromActivity(now)}
                className="press mt-3 inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-[0.84375rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                Bring kitchen cards back
              </button>
            )}
            <div className="mt-3">
              <AddCardForm onSave={save} heading={false} />
            </div>
          </>
        ) : adding ? (
          <AddCardForm onSave={save} onCancel={() => setAdding(false)} />
        ) : !current ? (
          <>
            <p className="text-[0.9375rem] font-extrabold">Nothing due today</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {nextDue
                ? `The next card matures on ${nextDue}. Come back then — or add another card to review sooner.`
                : 'Every card in your deck has been reviewed. Add more to keep the queue going.'}
            </p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="press mt-2 inline-flex items-center gap-1.5 text-[0.78125rem] font-extrabold"
              style={{ color: 'var(--accent)' }}
            >
              Add a card
            </button>
            {!forgotten && seedable > 0 && (
              <button
                type="button"
                onClick={openRefreshPreview}
                className="press mt-1 block text-[0.78125rem] font-extrabold"
                style={{ color: 'var(--accent)' }}
              >
                Refresh {seedable} kitchen card{seedable === 1 ? '' : 's'}
              </button>
            )}
            {autoCount > 0 && (
              <button
                type="button"
                onClick={() => setConfirmingForget(true)}
                className="press mt-1 block text-[0.78125rem] font-bold"
                style={{ color: 'var(--faint)' }}
              >
                Turn off kitchen cards
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                Due now
              </p>
              <div className="flex items-center gap-2">
                <Pill tone="muted">{queue.length} to review</Pill>
                {seedable > 0 && !forgotten && (
                  <button
                    type="button"
                    aria-label={`Refresh ${seedable} kitchen card${seedable === 1 ? '' : 's'}`}
                    onClick={openRefreshPreview}
                    className="press text-[0.6875rem] font-extrabold uppercase tracking-wide"
                    style={{ color: 'var(--accent)' }}
                  >
                    Refresh
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Add a new card"
                  onClick={() => setAdding(true)}
                  className="press text-[0.6875rem] font-extrabold uppercase tracking-wide"
                  style={{ color: 'var(--muted)' }}
                >
                  New
                </button>
              </div>
            </div>

            {!forgotten && autoCount > 0 && (
              <button
                type="button"
                onClick={() => setConfirmingForget(true)}
                className="press mt-2 text-[0.6875rem] font-bold uppercase tracking-wide"
                style={{ color: 'var(--faint)' }}
              >
                Turn off kitchen cards
              </button>
            )}

            {focusable && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Review one topic at a time">
                <button
                  type="button"
                  aria-pressed={!focusedTopic}
                  onClick={() => focusedTopic && pickTopic(focusedTopic)}
                  className="press"
                >
                  <Pill tone={!focusedTopic ? 'accent' : 'muted'}>All</Pill>
                </button>
                {topicGroups.map((group) => (
                  <button
                    key={group.topicId}
                    type="button"
                    aria-pressed={focusedTopic === group.topicId}
                    onClick={() => pickTopic(group.topicId)}
                    className="press"
                  >
                    <Pill tone={focusedTopic === group.topicId ? 'accent' : 'muted'}>
                      {topicLabel(group.topicId)} · {group.count}
                    </Pill>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 rounded-2xl border px-4 py-5 text-center" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
              <p className="text-[1.0625rem] font-extrabold leading-snug">{current.front}</p>
              {editingTopic ? (
                <div className="mx-auto mt-2 flex max-w-xs items-center gap-2">
                  <input
                    aria-label="Card topic"
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    placeholder="Topic (blank = General)"
                    className="w-full rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
                    style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                  />
                  <button
                    type="button"
                    aria-label="Save topic"
                    onClick={saveTopic}
                    className="press rounded-xl px-3 py-2 text-[0.75rem] font-extrabold"
                    style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel topic edit"
                    onClick={() => setEditingTopic(false)}
                    className="press text-[0.75rem] font-bold"
                    style={{ color: 'var(--faint)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center justify-center gap-2">
                  {current.topicId && current.topicId !== 'general' && (
                    focusable ? (
                      <button
                        type="button"
                        className="press inline-flex"
                        aria-pressed={focusedTopic === current.topicId}
                        aria-label={`Filter the queue to ${topicLabel(current.topicId)}`}
                        onClick={() => pickTopic(current.topicId)}
                      >
                        <Pill tone="accent">{topicLabel(current.topicId)}</Pill>
                      </button>
                    ) : (
                      <span className="inline-flex">
                        <Pill tone="accent">{topicLabel(current.topicId)}</Pill>
                      </span>
                    )
                  )}
                  <button
                    type="button"
                    aria-label="Retag this card's topic"
                    onClick={startRetag}
                    className="press inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wide"
                    style={{ color: 'var(--faint)' }}
                  >
                    <Pencil size={11} /> Retag
                  </button>
                </div>
              )}
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
