import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader, Mic, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import {
  assistedInventory, inventorySummary, parseInventoryText, toPantryItem,
} from '../lib/kitchen-inventory.js';
import { fileToDataUrl } from '../lib/recipe-import.js';
import { captureSupport, detectImageText } from '../lib/smart-capture.js';
import { CATEGORIES, LOCATIONS } from '../data/pantry.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { Card, Chip, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';

const EXAMPLE = `half a bag of spinach
2 tins of chopped tomatoes
400g chicken breast
some cheddar
frozen peas in the freezer`;

const field = { background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' };

const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

/**
 * "What's in my kitchen": type it, say it, paste it or photograph it.
 *
 * Whatever the door, it becomes text, and one parser turns that text into
 * pantry rows. The parser is the honest part: a line that named an amount gets
 * one, a line that said "some cheese" does not, and a name the food catalogue
 * did not recognise is filed as probable rather than confirmed. Those two
 * confidences are what the pantry's truth model reads, so what lands here is
 * as certain as what was said and no more.
 *
 * A model is offered for the awkward middle — a photo, or a sentence the
 * parser made a mess of — but it only ever returns words. It cannot promote a
 * guess to a certainty, because it is never asked how sure it is.
 */
export default function KitchenInventory({ onDone }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const [added, setAdded] = useState(0);
  const fileRef = useRef(null);
  const recogniser = useRef(null);
  const support = captureSupport();

  useEffect(() => () => recogniser.current?.stop?.(), []);

  const read = (value, extraNote = '') => {
    const parsed = parseInventoryText(value, {
      catalogue: app.catalogue,
      learnedAliases: app.aliasMemory,
      location: location || null,
    }).map((row) => ({ ...row, original: row.name }));
    setRows(parsed);
    setNote(extraNote);
    setError(parsed.length ? '' : 'Nothing in that read as food yet. One item per line works best.');
  };

  const assist = async (payload, working) => {
    setBusy(working);
    setError('');
    try {
      const result = await assistedInventory(payload);
      setText(result.text);
      read(result.text, result.read === 'vision'
        ? 'Read from your photo by a model — check every line before adding it.'
        : 'Tidied up by a model — check every line before adding it.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy('');
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (support.imageText) {
      setBusy('Reading the shelf on this device…');
      try {
        const found = await detectImageText(file);
        setText(found);
        read(found, 'Read on your device — nothing was uploaded. Check every line.');
        setBusy('');
        return;
      } catch {
        // The recogniser could not read this picture; the model can try.
      }
    }
    const image = await fileToDataUrl(file);
    if (!image) {
      setBusy('');
      setError('That photo could not be read on this device.');
      return;
    }
    await assist({ image }, 'Reading the photo…');
  };

  const listen = () => {
    if (!Recognition || listening) return;
    const rec = new Recognition();
    recogniser.current = rec;
    rec.lang = 'en-GB';
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = [...event.results].map((result) => result[0].transcript).join(' ');
      const next = text ? `${text}\n${said}` : said;
      setText(next);
      read(next);
    };
    rec.onerror = () => setError('Speech recognition stopped. Type it instead.');
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const update = (index, patch) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = () => {
    for (const row of rows) {
      // Correcting a name here is the same lesson a corrected receipt line
      // teaches: next time, read that word as this thing.
      const from = String(row.original || '').trim();
      const to = String(row.name || '').trim();
      if (from && to && from !== to) app.learnCorrection?.({ from, to });
      app.addPantryItem(toPantryItem(row));
    }
    setAdded(rows.length);
    setRows([]);
    setText('');
    setNote('');
  };

  const summary = inventorySummary(rows);

  return (
    <div className="px-5 pb-10 space-y-4">
      <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Say it, type it, paste a list or photograph a shelf. Amounts you give are kept; amounts you
        don’t are left blank rather than guessed, so the pantry never claims you have enough of
        something for a recipe when nobody counted.
      </p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        placeholder={'half a bag of spinach\n2 tins of chopped tomatoes\n400g chicken breast'}
        aria-label="What is in your kitchen"
        className="w-full rounded-2xl border px-4 py-3 text-[0.84375rem] font-semibold outline-none resize-none"
        style={field}
      />

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={listen}
          disabled={!Recognition || listening || Boolean(busy)}
          className="press rounded-2xl border py-2.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: listening ? 'var(--accent)' : 'var(--line)', color: listening ? 'var(--accent)' : 'var(--muted)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Mic size={13} /> {listening ? 'Listening…' : 'Speak it'}
          </span>
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(busy)}
          className="press rounded-2xl border py-2.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Camera size={13} /> Snap a shelf</span>
        </button>
        <button
          onClick={() => { setText(EXAMPLE); read(EXAMPLE); }}
          disabled={Boolean(busy)}
          className="press rounded-2xl border py-2.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          Use an example
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" aria-label="Photo of your shelf" />

      {!Recognition && (
        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          This browser has no speech recognition, so the microphone is off. Typing and pasting work
          the same way.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => read(text)}
          disabled={!text.trim() || Boolean(busy)}
          className="press rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Read my list
        </button>
        <button
          onClick={() => assist({ text }, 'Tidying the list…')}
          disabled={!text.trim() || Boolean(busy)}
          className="press rounded-2xl border py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            {busy ? <Loader size={14} className="pulse-dot" /> : <Sparkles size={14} />} Tidy it for me
          </span>
        </button>
      </div>

      {busy && <p role="status" className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{busy}</p>}
      {error && <Pill tone="danger">{error}</Pill>}
      {note && !error && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--warn)' }}>{note}</p>
      )}
      {added > 0 && rows.length === 0 && (
        <p className="text-center">
          <Pill tone="good"><Check size={11} strokeWidth={3} /> {added} item{added === 1 ? '' : 's'} put away</Pill>
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Check before it goes in
            </p>
            <Pill tone="accent">{summary.line}</Pill>
          </div>

          {summary.withoutAmounts > 0 && (
            <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {summary.withoutAmounts} item{summary.withoutAmounts === 1 ? ' has' : 's have'} no amount.
              {' '}They still count as things you have — the pantry just won’t promise there is enough
              for a recipe until you say how much.
            </p>
          )}

          <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows.map((row, index) => (
              <div key={`${row.line}-${index}`} className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Glyph e={row.emoji} size={20} style={{ color: 'var(--muted)' }} />
                  <input
                    value={row.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    aria-label={`Name of item ${index + 1}`}
                    className="min-w-0 flex-1 rounded-xl border px-2.5 py-1.5 text-[0.875rem] font-bold outline-none"
                    style={field}
                  />
                  <Pill tone={row.matched ? 'good' : 'warn'}>{row.matched ? 'recognised' : 'confirm'}</Pill>
                  <button
                    onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
                    aria-label={`Remove ${row.name}`}
                    className="press shrink-0 p-1"
                    style={{ color: 'var(--faint)' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-8">
                  <input
                    value={row.qty}
                    onChange={(event) => update(index, {
                      qty: event.target.value,
                      // Typing an amount is you telling us, so it stops being unknown.
                      amountConfidence: event.target.value.trim() ? 'approximate' : 'unknown',
                    })}
                    aria-label={`Amount of ${row.name}`}
                    placeholder="Amount (optional)"
                    className="w-32 rounded-xl border px-2.5 py-1.5 text-[0.8125rem] font-semibold outline-none"
                    style={field}
                  />
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {CATEGORIES.slice(0, 5).map((category) => (
                      <Chip key={category} active={row.cat === category} onClick={() => update(index, { cat: category })}>
                        {category}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <div>
            <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Put it all in
            </p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
              <Chip active={!location} onClick={() => { setLocation(''); read(text); }}>Where each says</Chip>
              {LOCATIONS.map((place) => (
                <Chip
                  key={place}
                  active={location === place}
                  onClick={() => {
                    setLocation(place);
                    setRows((list) => list.map((row) => ({ ...row, location: place })));
                  }}
                >
                  {place}
                </Chip>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Add {rows.length} item{rows.length === 1 ? '' : 's'} to the pantry
          </button>
        </>
      )}

      <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        {PRIVACY_COPY.kitchenInventory}
      </p>

      {onDone && rows.length === 0 && added > 0 && (
        <button
          onClick={onDone}
          className="press w-full rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          Back to the pantry
        </button>
      )}
    </div>
  );
}
