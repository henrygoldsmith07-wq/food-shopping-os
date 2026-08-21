/**
 * The one thing this screen is for, parked where a thumb already is.
 *
 * Every screen used to open with a wall of equal-weight controls and leave you
 * to work out which one was the point. Each now names its single most likely
 * next move and puts it in the bottom third of the phone, above the tab bar —
 * the only part of a large screen you can reach without shifting your grip.
 *
 * The label changes with the state of the thing, because the most likely next
 * move does: an empty week wants filling, a full one wants shopping for. It is
 * never a shortcut to something the screen can't currently do — a disabled
 * primary action would be a worse lie than no primary action.
 */
export default function PrimaryAction({ label, onClick, hint }) {
  return (
    <div
      className="primary-action fixed left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-5"
      style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
    >
      <button
        onClick={onClick}
        className="press pop w-full rounded-2xl py-3.5 text-[0.90625rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-lg)' }}
      >
        {label}
        {hint && <span className="ml-1.5 font-bold opacity-70">{hint}</span>}
      </button>
    </div>
  );
}
