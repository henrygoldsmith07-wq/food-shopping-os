import { useMemo, useState } from 'react';
import { Sprout } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Card, Pill } from './ui.jsx';
import KitchenRefreshPreview from './KitchenRefreshPreview.jsx';

/**
 * The deck starts from the dashboard. A returning user with real kitchen
 * activity but no cards yet sees one strip on Today: what it would ask, and
 * one tap to see the questions — then a tap per question (or all) to build
 * the deck, no trip to Learn required. Honest on both ends: it shows
 * nothing when there is nothing to seed, previews before it writes, stands
 * down once the deck exists or the user opted out, and names its action
 * exactly.
 */
export default function KitchenSeedStrip({ goTab }) {
  const app = useApp();
  const seedable = useMemo(() => app.kitchenSeedCount(), [app, app.cards]);
  // The preview shown before anything is written: its plan, frozen at open.
  const [preview, setPreview] = useState(null);
  const [seededCount, setSeededCount] = useState(null);
  const deckSize = (app.cards || []).length;

  // The strip's preview: what the deck would ask, decided question by
  // question. Only a still-empty, still-opted-in deck shows it — once any
  // row is applied the confirmation below owns the strip, and closing
  // without acting returns to the plain offer.
  if (preview && !app.kitchenCardsForgotten && deckSize === 0) {
    return (
      <section className="px-5 rise rise-1" aria-label="Kitchen deck preview">
        <KitchenRefreshPreview
          now={preview.now}
          plan={preview.plan}
          kind="seed"
          onApplied={(count) => {
            setSeededCount(count);
            setPreview(null);
          }}
          onClose={() => setPreview(null)}
        />
      </section>
    );
  }

  // Just seeded: confirm what happened, with the way in to review.
  if (seededCount != null && deckSize > 0) {
    return (
      <section className="px-5 rise rise-1" aria-label="Kitchen cards built">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Sprout size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-extrabold">Deck started</p>
              <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {seededCount} card{seededCount === 1 ? '' : 's'} from your kitchen, due today.
              </p>
            </div>
            <button
              type="button"
              onClick={() => goTab('learn')}
              className="tap press text-[0.78125rem] font-extrabold"
              style={{ color: 'var(--accent)' }}
            >
              Review
            </button>
          </div>
        </Card>
      </section>
    );
  }

  if (!seedable || app.kitchenCardsForgotten || deckSize > 0) return null;

  return (
    <section className="px-5 rise rise-1" aria-label="Start a deck from your kitchen">
      <Card
        className="press !p-4"
        onClick={() => {
          const now = new Date();
          setPreview({ now, plan: app.kitchenSeedPreview(now) });
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Sprout size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-extrabold">Start a deck from your kitchen</p>
            <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {seedable} question{seedable === 1 ? '' : 's'} from what you buy, log and cook.
            </p>
          </div>
          <Pill tone="accent">{seedable}</Pill>
        </div>
      </Card>
    </section>
  );
}
