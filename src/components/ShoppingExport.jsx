import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

export const canShareShopping = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export default function ShoppingExport({ text }) {
  const [status, setStatus] = useState('');
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('Copied to your clipboard.');
    } catch {
      setStatus('Copy is unavailable in this browser. Select the text above instead.');
    }
  };
  const share = async () => {
    if (!canShareShopping()) return copy();
    try {
      await navigator.share({ title: 'Forq shopping list', text });
      setStatus('Shared with your chosen app.');
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus('The share sheet could not open.');
    }
  };

  return (
    <div className="px-5 pb-10 space-y-3">
      <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Forq doesn’t connect to any supermarket. This is your list as plain text, in the
        aisle order you’d walk — share it to another app or paste it into the shop you use.
      </p>
      <textarea
        readOnly
        value={text}
        rows={12}
        aria-label="List as text"
        className="w-full rounded-2xl border p-3 text-[0.78125rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={copy}
          className="press rounded-2xl py-3 text-[0.875rem] font-extrabold"
          style={{ background: 'var(--card-2)', color: 'var(--ink)' }}
          aria-label="Copy shopping list"
        >
          <span className="inline-flex items-center gap-1.5"><Copy size={15} /> Copy</span>
        </button>
        <button
          type="button"
          onClick={share}
          className="press rounded-2xl py-3 text-[0.875rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          aria-label="Share shopping list"
        >
          <span className="inline-flex items-center gap-1.5"><Share2 size={15} /> Share</span>
        </button>
      </div>
      {status && (
        <p role="status" className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          <Check size={13} /> {status}
        </p>
      )}
    </div>
  );
}
