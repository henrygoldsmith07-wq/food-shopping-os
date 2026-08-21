import { useState } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { pantryFromShareCode, pantryShareCode } from '../lib/kitchen.js';
import { Card } from './ui.jsx';

export default function PantryShare() {
  const app = useApp();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const ownCode = pantryShareCode(app.pantry);

  const copy = async () => {
    if (!navigator.clipboard) {
      setMessage('Copy is unavailable here. Use Share instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(ownCode);
      setMessage('Pantry code copied.');
    } catch {
      setMessage('Could not copy the pantry code.');
    }
  };

  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: 'Forq household pantry', text: ownCode });
      setMessage('Pantry shared.');
    } catch (error) {
      if (error?.name !== 'AbortError') setMessage('Could not share the pantry.');
    }
  };

  const importCode = () => {
    try {
      const items = pantryFromShareCode(code);
      app.importPantry(items);
      setCode('');
      setMessage(`${items.length} item${items.length === 1 ? '' : 's'} imported.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <Share2 size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
        <div>
          <p className="font-bold text-[0.875rem]">Household inventory sharing</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Send a private snapshot code. It contains pantry items only and works without an account.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          disabled={!app.pantry.length}
          className="press rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Copy size={14} /> Copy code</span>
        </button>
        <button
          onClick={share}
          disabled={!app.pantry.length}
          className="press rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Share2 size={14} /> Share</span>
        </button>
      </div>
      <label className="block">
        <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Import a pantry code</span>
        <textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          rows={3}
          placeholder="FORQ-PANTRY-1…"
          aria-label="Pantry share code"
          className="mt-1 w-full rounded-2xl border p-3 text-[0.75rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
      </label>
      <button
        onClick={importCode}
        disabled={!code.trim()}
        className="press w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-1.5"><Download size={14} /> Import snapshot</span>
      </button>
      {message && (
        <p role="status" className="text-[0.75rem] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
          <Check size={13} /> {message}
        </p>
      )}
    </Card>
  );
}
