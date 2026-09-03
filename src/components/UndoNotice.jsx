import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';

/**
 * The "deleted" moment, made recoverable.
 *
 * Ctrl+Z has always worked — but nobody presses a shortcut they don't know
 * exists. This pairs the message with the button at the instant the thing
 * vanished, where the user's eyes already are. It renders nothing unless a
 * message is set, and the offer expires on its own rather than nagging.
 */
export default function UndoNotice({ message, onUndo, seconds = 6 }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return undefined;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), seconds * 1000);
    return () => clearTimeout(timer);
  }, [message, seconds]);

  if (!message || !visible) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5"
      style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}
    >
      <p className="text-[0.78125rem] font-bold">{message}</p>
      {onUndo && (
        <button
          onClick={onUndo}
          className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.75rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Undo2 size={12} /> Undo
        </button>
      )}
    </div>
  );
}
