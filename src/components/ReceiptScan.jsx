import { useRef, useState } from 'react';
import { Camera, Check, Info, ReceiptText, TriangleAlert, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { parseReceipt } from '../lib/receipt.js';
import { gbp } from '../lib/utils.js';
import { Card, Pill } from './ui.jsx';
import { captureSupport, detectReceiptText } from '../lib/smart-capture.js';

const SAMPLE = `TESCO EXTRA
28/07/2026  14:02

BANANAS LOOSE          £0.83
2 x @ £1.25
SEMI SKIMMED MILK 2L   £2.50
CHICKEN BREAST 650G    £5.49
0.482 kg @ £4.99/kg
BROCCOLI               £2.41
WHOLEMEAL BREAD        £1.15
CLUBCARD SAVING       -£0.50

TOTAL                 £12.38
VISA CONTACTLESS      £12.38`;

/**
 * Native browser OCR where available, with pasted receipt text as the reliable
 * fallback. Both routes use the same parser and total check.
 */
export default function ReceiptScan({ onDone }) {
  const app = useApp();
  const canEditPantry = app.householdAccess.pantry;
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [items, setItems] = useState([]);
  const [ocrStatus, setOcrStatus] = useState('');
  const fileRef = useRef(null);
  const support = captureSupport();

  const applyResult = (next) => {
    setResult(next);
    // Remember what OCR suggested so an edit can be taught back to entity
    // resolution: "tomatos → tomatoes" makes every later scan/plan smarter.
    setItems((next.items || []).map((item) => ({ ...item, original: item.name })));
  };

  const read = () => applyResult(parseReceipt(text));
  const scanPhoto = async (file) => {
    setOcrStatus('Reading receipt image…');
    setResult(null);
    setItems([]);
    try {
      const recognised = await detectReceiptText(file);
      setText(recognised);
      applyResult(parseReceipt(recognised));
      setOcrStatus('Receipt text recognised. Check the total before keeping it.');
    } catch (error) {
      setOcrStatus(error.message);
    }
  };

  const updateItem = (index, field, value) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === 'name') return { ...item, name: value };
      // Keep the draft as typed so decimal inputs do not lose a transient
      // value such as `1.` before the user finishes entering it.
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const itemTotal = Math.round(items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) * 100) / 100;
  const hasPrintedTotal = result?.printedTotal !== null && result?.printedTotal !== undefined;
  const hasBlankItem = items.some((item) => !String(item.name || '').trim());
  const hasInvalidNumber = items.some((item) => {
    const valid = (value) => String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
    return !valid(item.qty) || !valid(item.price);
  });
  const balanced = hasPrintedTotal
    ? Math.abs(result.printedTotal - itemTotal) < 0.02
    : result?.balanced;

  const addToPantry = () => {
    if (!canEditPantry || hasBlankItem || hasInvalidNumber) return;
    for (const item of items) {
      const from = String(item.original || '').trim();
      const to = String(item.name || '').trim();
      if (from && to && from !== to) app.learnCorrection({ from, to });
    }
    app.saveReceipt({
      store: result.store,
      date: result.date,
      total: hasPrintedTotal ? result.printedTotal : itemTotal,
      items: items.map(({ original, ...rest }) => rest),
    });
    onDone?.();
  };

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card className="space-y-3">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {support.receiptText
            ? 'This browser can read text from a receipt photo on-device. The result is still checked against the printed total before you keep it.'
            : 'This browser has no native receipt OCR. Paste text from your shop’s app or an emailed receipt; the parser and total check still work.'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) scanPhoto(file);
            event.target.value = '';
          }}
          className="hidden"
          aria-label="Receipt image"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!support.receiptText}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Camera size={14} /> Scan receipt photo</span>
        </button>
        {ocrStatus && <p role="status" className="text-[0.75rem] font-semibold">{ocrStatus}</p>}
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setResult(null); setItems([]); setOcrStatus(''); }}
          rows={7}
          placeholder="Paste the receipt"
          aria-label="Receipt text"
          className="w-full rounded-2xl border px-3 py-2.5 text-[0.75rem] font-mono outline-none"
          style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => { setText(SAMPLE); setResult(null); setItems([]); setOcrStatus(''); }}
            className="press rounded-2xl border px-3 py-2 text-[0.78125rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            Example
          </button>
          <button
            onClick={read}
            disabled={!text.trim()}
            className="press flex-1 rounded-2xl border py-2 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <span className="inline-flex items-center gap-1.5"><ReceiptText size={14} /> Read it</span>
          </button>
        </div>
        {result?.error && <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--danger)' }}>{result.error}</p>}
      </Card>

      {result && items.length > 0 && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <p className="font-bold text-[0.875rem]">
                {items.length} item{items.length === 1 ? '' : 's'}
                {result.store && ` · ${result.store}`}
              </p>
              {balanced === true && <Pill tone="good"><Check size={11} /> Adds up</Pill>}
              {balanced === false && <Pill tone="warn"><TriangleAlert size={11} /> Check it</Pill>}
            </div>
            <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Check the recognised lines, then edit or remove anything that is wrong before adding it. Saving also records this shop in your spending history.
            </p>
            {hasPrintedTotal && (
              <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Items come to {gbp(itemTotal, { always: true })}; the receipt says{' '}
                {gbp(result.printedTotal, { always: true })}.
                {balanced ? ' That matches, so the parse is sound.' : ' They differ — something was misread, so check before you keep it.'}
              </p>
            )}
            <div className="mt-2 divide-y" style={{ borderColor: 'var(--line)' }}>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.5rem_auto] items-end gap-2 py-2">
                  <label className="min-w-0 text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
                    Item
                    <input
                      value={item.name}
                      onChange={(event) => updateItem(i, 'name', event.target.value)}
                      aria-label={`Receipt item ${i + 1} name`}
                      className="mt-1 w-full min-w-0 rounded-xl border px-2 py-1.5 text-[0.8125rem] font-semibold outline-none"
                      style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                    />
                  </label>
                  <label className="text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
                    Qty
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.qty}
                      onChange={(event) => updateItem(i, 'qty', event.target.value)}
                      aria-label={`Receipt item ${i + 1} quantity`}
                      className="mt-1 w-full rounded-xl border px-2 py-1.5 text-[0.8125rem] font-semibold outline-none"
                      style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                    />
                  </label>
                  <label className="text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
                    Price
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.price}
                      onChange={(event) => updateItem(i, 'price', event.target.value)}
                      aria-label={`Receipt item ${i + 1} price`}
                      className="mt-1 w-full rounded-xl border px-2 py-1.5 text-[0.8125rem] font-semibold outline-none"
                      style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    aria-label={`Remove receipt item ${i + 1}: ${item.name}`}
                    className="press mb-0.5 rounded-xl border p-2"
                    style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {hasBlankItem && (
            <p role="alert" className="text-[0.75rem] font-semibold" style={{ color: 'var(--danger)' }}>
              Add a name to every line, or remove blank lines, before adding this receipt to the pantry.
            </p>
          )}

          {hasInvalidNumber && (
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--danger)' }}>
              Enter a non-negative quantity and price for every line before adding this receipt to the pantry.
            </p>
          )}

          {result.unread.length > 0 && (
            <Card className="!p-3">
              <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--faint)' }}>
                Couldn’t read {result.unread.length} line{result.unread.length === 1 ? '' : 's'}
              </p>
              {result.unread.slice(0, 5).map((line, i) => (
                <p key={`${line}-${i}`} className="text-[0.75rem] font-mono" style={{ color: 'var(--muted)' }}>{line}</p>
              ))}
              <p className="mt-1 text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
                <Info size={13} className="mt-0.5 shrink-0" /> Listed rather than dropped, so you can
                see exactly what didn’t make it in.
              </p>
            </Card>
          )}

          {!canEditPantry && (
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Pantry editing is off for this profile. An adult can change this under household permissions.
            </p>
          )}
          <button
            onClick={addToPantry}
            disabled={hasBlankItem || hasInvalidNumber || !canEditPantry}
            className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {canEditPantry ? `Add ${items.length} to the pantry` : 'Pantry permission required'}
          </button>
        </>
      )}
    </div>
  );
}
