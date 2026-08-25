import { useRef, useState } from 'react';
import { Camera, Link2, Loader, Sparkles } from 'lucide-react';
import { importFromLink, importFromPhoto, isSupportedImportLink, sourceAttribution } from '../lib/recipe-import.js';
import { captureSupport } from '../lib/smart-capture.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { Card, Pill } from './ui.jsx';

const fieldStyle = { background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' };

/**
 * Fetch a recipe from a link, or read one off a photo.
 *
 * Both doors lead to the same place: the recipe text, plus a note of where it
 * came from and how it was read. Neither saves anything — what comes back is a
 * draft the user reviews in the importer they were already in.
 *
 * `onRead` is called with { text, source }. The parent parses the text with
 * the same parser a pasted recipe goes through, so nutrition, ingredient
 * matching and costing are identical however the recipe arrived.
 */
export default function RecipeImportSource({ mode, onRead }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);
  const support = captureSupport();

  const run = async (task, working) => {
    setBusy(true);
    setError('');
    setNote(working);
    try {
      const result = await task();
      const attribution = sourceAttribution(result.source);
      // The full credit line belongs on the draft below, next to the recipe it
      // describes; here all that is needed is that the read finished.
      setNote(`Read from ${attribution.label}. Check what came back below.`);
      onRead({ text: result.text, source: result.source, attribution });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setNote(null);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    run(
      () => importFromPhoto(file),
      support.imageText
        ? 'Reading the text on this device…'
        : 'This browser has no text recogniser, so the photo is being read by a model…',
    );
  };

  return (
    <div className="space-y-3">
      {mode === 'link' && (
        <>
          <label className="block">
            <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Recipe or video link
            </span>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border px-4 py-3" style={fieldStyle}>
              <Link2 size={15} style={{ color: 'var(--faint)' }} />
              <input
                value={url}
                onChange={(event) => { setUrl(event.target.value); setError(''); }}
                placeholder="https://tiktok.com/… · youtube.com/… · a recipe page"
                aria-label="Recipe or video link"
                className="w-full bg-transparent text-[0.875rem] font-semibold outline-none"
                style={{ color: 'var(--ink)' }}
              />
            </div>
          </label>
          <button
            onClick={() => run(() => importFromLink(url), 'Fetching the page and reading it…')}
            disabled={busy || !isSupportedImportLink(url)}
            className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-2">
              {busy ? <Loader size={16} className="pulse-dot" /> : <Sparkles size={16} />}
              {busy ? 'Reading the link…' : 'Fetch this recipe'}
            </span>
          </button>
          <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Forq fetches the page on your behalf and reads what it says — its recipe data where the
            site publishes any, its caption where it is a video. Amounts a caption never stated stay
            blank rather than being filled in. {PRIVACY_COPY.recipeFetch}
          </p>
        </>
      )}

      {mode === 'photo' && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" aria-label="Recipe photo" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-2">
              {busy ? <Loader size={16} className="pulse-dot" /> : <Camera size={16} />}
              {busy ? 'Reading the photo…' : 'Photograph a recipe'}
            </span>
          </button>
          <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {support.imageText
              ? 'Your browser can read printed text itself, so the page is recognised on your device and only the words are sent on to be laid out.'
              : 'This browser has no text recogniser, so the photo itself is sent to be read. Check every amount before saving.'}
            {' '}{PRIVACY_COPY.recipePhoto}
          </p>
        </>
      )}

      {note && !error && (
        <Card className="!p-3">
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{note}</p>
        </Card>
      )}
      {error && <Pill tone="danger">{error}</Pill>}
    </div>
  );
}
