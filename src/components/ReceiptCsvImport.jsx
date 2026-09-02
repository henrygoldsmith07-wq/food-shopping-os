import { useMemo, useRef, useState } from 'react';
import { FileUp, Check } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { parseReceiptCsv, RECEIPT_CSV_TEMPLATE } from '../lib/receipt-import.js';
import { Card } from './ui.jsx';

/**
 * Bring a grocery history into Forq from pasted or uploaded receipt CSV.
 *
 * One shop record per trip (grouped by date+store), each going through the
 * same `saveReceipt` action as a photographed receipt — so price memory,
 * analytics and pantry reconciliation see imported history exactly like
 * scanned history.
 */
export default function ReceiptCsvImport({ onDone }) {
  const app = useApp();
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [imported, setImported] = useState(null);

  const result = useMemo(
    () => (text.trim() ? parseReceiptCsv(text, { today: app.day }) : null),
    [text, app.day],
  );

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setText(await file.text());
  };

  const run = () => {
    if (!result?.shops.length) return;
    result.shops.forEach((shop) => app.saveReceipt(shop));
    setImported(result.stats);
    setText('');
  };

  if (imported) {
    return (
      <Card className="text-center py-6">
        <Check size={26} strokeWidth={2.4} className="mx-auto mb-2" style={{ color: 'var(--good)' }} />
        <p className="font-extrabold">
          Imported {imported.parsed} items across {imported.shops} {imported.shops === 1 ? 'trip' : 'trips'}.
          {imported.skipped ? ` ${imported.skipped} row${imported.skipped === 1 ? ' was' : 's were'} skipped.` : ''}
        </p>
        <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          They count like any recorded shop — price memory and analytics included.
        </p>
        <button onClick={onDone} className="press mt-3.5 rounded-2xl px-5 py-3 text-[0.84375rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          Done
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
        One row per item, grouped into trips by date and store. Columns in any order:
        {' '}<span className="font-bold">date, store, item, qty, price</span>.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={RECEIPT_CSV_TEMPLATE}
        aria-label="Receipt CSV"
        className="w-full rounded-2xl border p-3 font-mono text-[0.71875rem] outline-none"
        style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="press rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5"><FileUp size={15} /> Choose a .csv file</span>
        </button>
        <button
          onClick={run}
          disabled={!result?.shops.length}
          className="press flex-1 rounded-2xl py-3 text-[0.8125rem] font-extrabold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {result?.shops.length
            ? `Import ${result.stats.parsed} items from ${result.shops.length} ${result.shops.length === 1 ? 'trip' : 'trips'}`
            : 'Paste or choose a CSV to import'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Choose receipt CSV file" onChange={onFile} />
      </div>

      {!!result?.shops.length && (
        <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Preview
          </p>
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {result.shops.map((shop) => (
              <div key={`${shop.date}-${shop.store}`} className="flex items-baseline gap-2 text-[0.78125rem] font-semibold">
                <span className="font-extrabold">{shop.store}</span>
                <span style={{ color: 'var(--muted)' }}>{shop.date}</span>
                <span className="ml-auto tabular-nums">{gbp(shop.total, { always: true })}</span>
                <span className="tabular-nums" style={{ color: 'var(--faint)' }}>{shop.items.length} items</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!result?.errors.length && (
        <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--warn)' }}>
          {result.errors.map((error) => (
            <p key={error} className="text-[0.71875rem] font-semibold" style={{ color: 'var(--warn)' }}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
