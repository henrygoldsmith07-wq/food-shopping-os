import { Droplet, Minus, Plus } from 'lucide-react';
import { useApp } from '../lib/store.jsx';

const GLASSES = 8;

/**
 * The day's glasses of water.
 *
 * This used to be eight 18px droplets you tapped individually. Eight targets
 * that small can't be made 44px wide inside a half-width card — the row is
 * only about 155px across — so the droplets stopped being buttons and became
 * what they always really were: a picture of the count. The two controls
 * either side are the real ones, and they're full size.
 *
 * You lose being able to jump straight to glass five. You gain being able to
 * hit the thing at all with a thumb, which is the trade the guideline exists
 * to make.
 */
export default function WaterGlasses({ size = 18 }) {
  const app = useApp();
  const set = (n) => app.set({ water: Math.max(0, Math.min(GLASSES, n)) });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => set(app.water - 1)}
        disabled={app.water === 0}
        aria-label="One glass fewer"
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-30"
        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        <Minus size={16} strokeWidth={2.6} />
      </button>

      {/* A read-out, not a control — the count is announced by the buttons. */}
      <div
        className="flex min-w-0 flex-1 flex-wrap justify-center gap-1"
        role="img"
        aria-label={`${app.water} of ${GLASSES} glasses`}
      >
        {Array.from({ length: GLASSES }, (_, i) => (
          <Droplet
            key={i}
            // Re-keyed on fill so the glass you just added pops in.
            className={i === app.water - 1 ? 'pop' : undefined}
            size={size}
            fill={i < app.water ? 'currentColor' : 'none'}
            style={{ color: i < app.water ? 'var(--accent)' : 'var(--line)' }}
          />
        ))}
      </div>

      <button
        onClick={() => set(app.water + 1)}
        disabled={app.water === GLASSES}
        aria-label="One more glass"
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-30"
        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        <Plus size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}
