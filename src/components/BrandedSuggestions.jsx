import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { checkLivePrice, entryFromResult } from '../lib/live-prices.js';
import { Pill } from './ui.jsx';

/**
 * "No price found" is usually a question about the search term, not the shop.
 *
 * A retailer asked for "baked beans" returns a wall of results the scraper
 * cannot confidently price; asked for "Heinz Baked Beans" it returns a
 * product. So where a generic item has named products behind it, they are
 * offered here — and tapping one prices that product straight away.
 *
 * It deliberately does not rewrite the shopping list. Deciding that "beans"
 * means Heinz is the shopper's call, not the app's; this only answers what the
 * named product would cost, and leaves the list alone.
 */
export default function BrandedSuggestions({ suggestions = [], disabled = false }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  if (!suggestions.length) return null;

  const price = async (suggestion) => {
    if (busy || disabled) return;
    setBusy(suggestion.id);
    setError('');
    try {
      const body = await checkLivePrice(suggestion.name);
      setResult({ suggestion, entry: entryFromResult(suggestion.name, body) });
    } catch (caught) {
      setError(caught.status === 429
        ? 'Too many checks — try again in an hour.'
        : caught.message || 'That check failed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mt-2.5 rounded-2xl border px-3 py-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
      <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        <Sparkles size={12} aria-hidden="true" /> Try a named product
      </p>
      <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Shops can price a specific product far more often than a general one. Your list is not changed.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => price(suggestion)}
            disabled={Boolean(busy) || disabled}
            className="press rounded-full border px-3 py-1.5 text-[0.71875rem] font-bold disabled:opacity-50"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          >
            {busy === suggestion.id ? 'Checking…' : suggestion.name}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}

      {result && !error && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.71875rem] font-bold">{result.suggestion.name}</p>
          {result.entry.best ? (
            <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              <span className="font-extrabold" style={{ color: 'var(--ink)' }}>
                {gbp(result.entry.best.price, { always: true })}
              </span>
              {' at '}{result.entry.best.retailer} · {result.entry.shopsAnswered} of {result.entry.shopsChecked} shops answered
            </p>
          ) : (
            <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              <Pill tone="muted">no price either</Pill>
              {' '}Most UK shops only price after a store or postcode is chosen.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
