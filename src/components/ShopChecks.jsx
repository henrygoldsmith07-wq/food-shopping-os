import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card, Section } from './ui.jsx';
import { shopChecks } from '../lib/shop-checks.js';
import { haptic } from '../lib/haptics.js';

/**
 * "Check before you shop": the few list rows the pantry could not settle on
 * its own (an amount that does not compare, stock last seen weeks ago, a jar
 * marked low). One tap each. "Got enough" confirms the pantry and drops the
 * row; "Buy it" keeps it and stops asking. Hidden when there is nothing to
 * check, and for profiles that cannot edit the list.
 */
export default function ShopChecks({ app }) {
  const [announce, setAnnounce] = useState('');
  const checks = useMemo(
    () => shopChecks(app.shoppingList, app.pantry, { today: app.day, learnedAliases: app.aliasMemory || {} }),
    [app.shoppingList, app.pantry, app.day, app.aliasMemory],
  );
  // One live region for the whole card, so the last answer is read out even
  // after its row (and maybe the card) has gone.
  const live = <p className="sr-only" aria-live="polite">{announce}</p>;
  if (!app.householdAccess?.shopping || typeof app.resolveShopCheck !== 'function') {
    return null;
  }
  if (!checks.length) return announce ? live : null;
  const canConfirm = app.householdAccess?.pantry !== false;

  const answer = (check, choice) => {
    haptic();
    app.resolveShopCheck(check.itemId, choice);
    setAnnounce(choice === 'have'
      ? `${check.name} taken off the list and confirmed in your pantry.`
      : `${check.name} stays on the list.`);
  };

  return (
    <Section title={`Check before you shop · ${checks.length}`} className="rise rise-2">
      <Card className="space-y-3">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Your pantry might already cover these. A quick look in the cupboard could save buying them twice.
        </p>
        <ul className="space-y-3" aria-label="Items to check in your pantry">
          {checks.map((check) => (
            <li key={check.itemId} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--line)' }}>
              <p className="font-bold text-[0.8125rem] inline-flex items-center gap-1.5">
                <ClipboardCheck size={13} aria-hidden="true" style={{ color: 'var(--warn)' }} />
                {check.name}{check.qty ? ` · buy ${check.qty}` : ''}
              </p>
              <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{check.reason}</p>
              <div className="mt-2 flex gap-2">
                {canConfirm && (
                  <button
                    type="button"
                    onClick={() => answer(check, 'have')}
                    className="press min-h-[44px] flex-1 rounded-xl border px-3 text-[0.78125rem] font-extrabold"
                    style={{ borderColor: 'var(--good)', color: 'var(--good)' }}
                    aria-label={`Got enough ${check.name}: take it off the list`}
                  >Got enough</button>
                )}
                <button
                  type="button"
                  onClick={() => answer(check, 'buy')}
                  className="press min-h-[44px] flex-1 rounded-xl border px-3 text-[0.78125rem] font-extrabold"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
                  aria-label={`Buy ${check.name}: keep it on the list`}
                >Buy it</button>
              </div>
            </li>
          ))}
        </ul>
        {live}
      </Card>
    </Section>
  );
}
