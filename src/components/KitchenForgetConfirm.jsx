/**
 * The confirm step before kitchen cards leave the deck. Only origin:'auto'
 * cards ever go, so the copy counts exactly what would be removed and never
 * threatens handmade cards; the two buttons commit or step back.
 */
export default function KitchenForgetConfirm({ count, onRemove, onKeep }) {
  return (
    <div className="mb-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
      <p className="text-[0.78125rem] font-bold">
        Remove {count} kitchen card{count === 1 ? '' : 's'}? Your own cards stay.
      </p>
      <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Undo works right after — and kitchen cards can be brought back any time.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          aria-label="Confirm removing kitchen cards"
          onClick={onRemove}
          className="press rounded-xl border px-3 py-2 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          Remove
        </button>
        <button
          type="button"
          aria-label="Keep kitchen cards"
          onClick={onKeep}
          className="press text-[0.78125rem] font-bold"
          style={{ color: 'var(--faint)' }}
        >
          Keep
        </button>
      </div>
    </div>
  );
}
