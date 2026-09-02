import { useRef, useState } from 'react';
import { ReceiptText, ScanLine, Sparkles } from 'lucide-react';
import { Card } from './ui.jsx';
import { staplePantryItems, staplesNotAlreadyIn } from '../lib/seed-staples.js';
import { parseReceiptCsv, RECEIPT_CSV_TEMPLATE } from '../lib/receipt-import.js';

/**
 * The cold-start pantry. Instead of a blank canvas, one calming panel with
 * the three ways in: scan a real item, accept a starter set of staples, or
 * bring a history of receipts. Nothing here pretends to be observed data —
 * seeded staples are labelled and imported receipts carry `imported: true`.
 */
export default function PantryEmptyState({ app, onScan, onAddManually }) {
  const csvRef = useRef(null);
  const [seedStatus, setSeedStatus] = useState('');

  const missingStaples = staplesNotAlreadyIn(app.pantry);

  const addStaples = () => {
    app.importPantry(staplePantryItems(app.day));
    setSeedStatus('Added 10 kitchen staples — tap any item to correct it.');
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const { shops, stats, errors } = parseReceiptCsv(await file.text(), { today: app.day });
    if (!shops.length) {
      setSeedStatus(errors[0] || 'No usable rows found. Expected columns: date, store, item, qty, price.');
      return;
    }
    app.set((s) => ({ shops: [...s.shops, ...shops] }));
    setSeedStatus(
      `Imported ${stats.items} items across ${stats.shops} trips.`
      + (errors.length ? ` ${errors.length} row${errors.length === 1 ? '' : 's'} skipped.` : ''),
    );
  };

  return (
    <Card className="text-center py-9 px-5">
      <div
        className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--card-2)', color: 'var(--faint)' }}
        aria-hidden="true"
      >
        <ScanLine size={30} strokeWidth={1.3} />
      </div>
      <p className="font-bold text-[0.90625rem]">Your pantry is empty</p>
      <p className="mx-auto mt-1 max-w-[36ch] text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Scan your first item and Forq puts it on your list forever after — or start
        from what most kitchens already have.
      </p>

      <button
        onClick={onScan}
        className="press mt-4 w-full rounded-2xl py-3.5 text-[0.90625rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center justify-center gap-2"><ScanLine size={16} /> Scan your first item</span>
      </button>

      <div className="mt-2.5 grid gap-2">
        {missingStaples.length > 0 && (
          <button
            onClick={addStaples}
            className="press w-full rounded-2xl border py-3 text-[0.8125rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
          >
            <span className="inline-flex items-center justify-center gap-2"><Sparkles size={14} /> Add {missingStaples.length} common staples</span>
          </button>
        )}
        <button
          onClick={() => csvRef.current?.click()}
          className="press w-full rounded-2xl border py-3 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
        >
          <span className="inline-flex items-center justify-center gap-2"><ReceiptText size={14} /> Import past receipts (CSV)</span>
        </button>
        <button
          onClick={onAddManually}
          className="press w-full py-1.5 text-[0.75rem] font-bold underline underline-offset-2"
          style={{ color: 'var(--muted)' }}
        >
          Or add an item manually
        </button>
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Import receipt history from CSV"
          onChange={importCsv}
        />
      </div>

      {seedStatus && (
        <p className="mt-3 text-[0.75rem] font-semibold" style={{ color: 'var(--accent)' }}>
          {seedStatus}
        </p>
      )}
      <p className="mt-3 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
        CSV format: <span style={{ color: 'var(--muted)' }}>{RECEIPT_CSV_TEMPLATE.split('\n')[0]}</span> — one row per item.
      </p>
    </Card>
  );
}
