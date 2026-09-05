import { useState } from 'react';

const inputCls = 'w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none';
const inputStyle = { background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' };

/**
 * The two sides of a new card, plus an optional topic tag. Both sides are
 * required — a one-sided card is a note, not a recall — and the Save button
 * stays inert until they are filled, so there is no error to announce.
 *
 * The form owns only its fields; `onSave(front, back, topic)` hands the
 * finished card to the caller, who routes it through the store's addCard.
 */
export default function AddCardForm({ onSave, onCancel, heading = true }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [topic, setTopic] = useState('');
  const ready = Boolean(front.trim() && back.trim());

  return (
    <div className="space-y-2.5">
      {(heading || onCancel) && (
        <div className="flex items-center justify-between gap-2">
          {heading && <p className="text-[0.9375rem] font-extrabold">New card</p>}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="press text-[0.78125rem] font-bold"
              style={{ color: 'var(--faint)' }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      <input
        aria-label="Card question"
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Question — what you want to recall"
        className={inputCls}
        style={inputStyle}
      />
      <textarea
        aria-label="Card answer"
        rows={2}
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Answer — what the card reveals"
        className={`${inputCls} resize-none`}
        style={inputStyle}
      />
      <input
        aria-label="Card topic (optional)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (optional)"
        className={inputCls}
        style={inputStyle}
      />
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSave(front, back, topic)}
          className="press rounded-xl px-4 py-2.5 text-[0.84375rem] font-extrabold"
          style={ready
            ? { background: 'var(--accent)', color: 'var(--on-accent)' }
            : { background: 'var(--card-2)', color: 'var(--faint)' }}
        >
          Save card
        </button>
        {!ready && (
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            Question and answer are both needed.
          </p>
        )}
      </div>
    </div>
  );
}