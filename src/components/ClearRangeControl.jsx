/**
 * Two-tap guard for wiping a whole week or month of planning. Kept out of
 * PlanTab so the screen stays within the 500-line module boundary.
 */
export default function ClearRangeControl({ confirm, onArm, onCancel, onConfirm, meals, view }) {
  return (
    <div className="mt-3 flex gap-2">
      {confirm && (
        <button
          type="button"
          onClick={onCancel}
          className="press shrink-0 rounded-2xl border px-4 py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          Cancel
        </button>
      )}
      <button
        type="button"
        onClick={confirm ? onConfirm : onArm}
        className="press flex-1 rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
        style={confirm
          ? { borderColor: 'var(--danger)', color: 'var(--danger)' }
          : { borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        {confirm
          ? `Confirm clear — ${meals} meal${meals === 1 ? '' : 's'}`
          : `Clear ${view === 'week' ? 'week' : 'month'}`}
      </button>
    </div>
  );
}
