import { useMemo, useState } from 'react';
import { Check, Send } from 'lucide-react';
import { menuAsText } from '../lib/plan-share.js';

/**
 * "Send the menu": the planned meals for the days on screen, as a message to
 * the household (share sheet where there is one, otherwise the clipboard).
 * Dinners only by default, the question people actually ask; one tap adds
 * breakfast and lunch.
 */
export default function PlanSendMenu({ plan, dates, view = 'week' }) {
  const [allMeals, setAllMeals] = useState(false);
  const [sent, setSent] = useState('');
  const text = useMemo(
    () => menuAsText(plan, dates, allMeals ? {} : { slots: ['dinner'] }),
    [plan, dates, allMeals],
  );
  if (!menuAsText(plan, dates)) return null;

  const send = async () => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: `This ${view}'s menu`, text });
        setSent('sent');
      } else {
        await navigator.clipboard?.writeText(text);
        setSent('copied');
      }
    } catch (error) {
      setSent(error?.name === 'AbortError' ? '' : 'failed');
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={send}
        disabled={!text}
        className="press w-full rounded-2xl border py-3 text-[0.875rem] font-extrabold disabled:opacity-60"
        style={sent === 'sent' || sent === 'copied' ? { borderColor: 'var(--good)', color: 'var(--good)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        <span className="inline-flex items-center gap-2">
          {sent === 'copied' ? <><Check size={15} strokeWidth={3} /> Menu copied</>
            : sent === 'sent' ? <><Check size={15} strokeWidth={3} /> Menu sent</>
              : sent === 'failed' ? <>Couldn’t send — try again</>
                : <><Send size={15} /> {text ? `Send this ${view}'s ${allMeals ? 'menu' : 'dinners'}` : 'No dinners planned to send'}</>}
        </span>
      </button>
      <label className="flex min-h-[44px] items-center justify-center gap-2 text-[0.75rem] font-bold" style={{ color: 'var(--muted)' }}>
        <input type="checkbox" checked={allMeals} onChange={(event) => { setAllMeals(event.target.checked); setSent(''); }} />
        Include breakfast and lunch
      </label>
    </div>
  );
}
