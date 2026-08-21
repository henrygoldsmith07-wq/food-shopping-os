import { useRef, useState } from 'react';
import { Camera, Check, ScanLine } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { isBarcode, lookupBarcode, SCANNABLE } from '../lib/foodlog.js';
import { captureSupport, detectBarcodeImage } from '../lib/smart-capture.js';
import { observedStaleness } from '../lib/observed-prices.js';
import { Card, Chip, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';

/**
 * Scanning a barcode onto the shopping list or into the pantry.
 *
 * Uses the browser's native barcode detector where it exists. The bundled
 * catalogue is the default; signed-in users can explicitly enrich a barcode
 * through the server-side Open Food Facts and Open Prices adapters.
 */
export default function BarcodeAdd({ onPick, action = 'Add' }) {
  const app = useApp();
  const [phase, setPhase] = useState('idle'); // idle · scanning · found · unknown
  const [code, setCode] = useState('');
  const [food, setFood] = useState(null);
  const [added, setAdded] = useState(null);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState('');
  const fileRef = useRef(null);
  const onlineRequestRef = useRef(0);
  const support = captureSupport();

  const resolve = (value) => {
    onlineRequestRef.current += 1;
    setOnlineBusy(false);
    const hit = lookupBarcode(value, app.catalogue);
    setCode(value);
    setFood(hit);
    setPhase(hit ? 'found' : 'unknown');
    setOnline(null);
    setOnlineMessage('');
  };

  const lookupOnline = async () => {
    if (!isBarcode(code)) return;
    const requestedCode = code;
    const requestId = ++onlineRequestRef.current;
    setOnlineBusy(true);
    setOnlineMessage('');
    try {
      const response = await fetch(`/api/integrations/products?${new URLSearchParams({ barcode: code, prices: '1' })}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Online product data is unavailable.');
      if (requestId !== onlineRequestRef.current || requestedCode !== code) return;
      setOnline(body);
    } catch (error) {
      if (requestId !== onlineRequestRef.current || requestedCode !== code) return;
      setOnlineMessage(error.message || 'Online product data is unavailable.');
    } finally {
      if (requestId === onlineRequestRef.current) setOnlineBusy(false);
    }
  };

  const scan = async (file) => {
    onlineRequestRef.current += 1;
    setOnlineBusy(false);
    setOnline(null);
    setOnlineMessage('');
    setPhase('scanning');
    setAdded(null);
    setMessage('');
    try {
      resolve(await detectBarcodeImage(file));
    } catch (error) {
      setPhase('idle');
      setMessage(error.message);
    }
  };

  const take = (item) => {
    onlineRequestRef.current += 1;
    setOnlineBusy(false);
    onPick(item);
    setAdded(item.name);
    setPhase('idle');
    setFood(null);
    setCode('');
    setOnline(null);
    setOnlineMessage('');
  };

  return (
    <div className="space-y-3">
      <div
        className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl border"
        style={{ background: 'var(--card-2)', borderColor: 'var(--line)' }}
      >
        <div className="absolute inset-x-10 inset-y-12 rounded-xl border-2" style={{ borderColor: 'var(--accent)' }} />
        {phase === 'scanning' && <div className="scanline absolute inset-x-10 h-0.5" style={{ background: 'var(--accent)' }} />}
        <p className="relative text-[0.78125rem] font-bold" style={{ color: 'var(--muted)' }}>
          {phase === 'scanning' ? 'Reading barcode…' : 'Hold the barcode inside the frame'}
        </p>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={!support.barcode || phase === 'scanning'}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-60"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-2">
          <Camera size={15} /> {phase === 'scanning' ? 'Scanning…' : support.barcode ? 'Scan a barcode' : 'Camera recognition unavailable'}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) scan(file);
          event.target.value = '';
        }}
        className="hidden"
        aria-label="Barcode image"
      />
      {!support.barcode && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          This browser has no native barcode detector. Type the number or choose a catalogue example below.
        </p>
      )}
      {message && <p role="status" className="text-[0.75rem] font-semibold">{message}</p>}

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            onlineRequestRef.current += 1;
            setCode(e.target.value);
            setOnline(null);
            setOnlineMessage('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && isBarcode(code) && resolve(code)}
          placeholder="…or type the number"
          aria-label="Barcode number"
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={() => resolve(code)}
          disabled={!isBarcode(code)}
          className="press rounded-2xl border px-4 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--line)' }}
        >
          <ScanLine size={15} />
        </button>
      </div>

      {added && (
        <p className="text-center"><Pill tone="good"><Check size={11} strokeWidth={3} /> {added} added</Pill></p>
      )}

      {phase === 'found' && food && (
        <Card className="flex items-center gap-3 !p-3">
          <Glyph e={food.emoji} size={22} style={{ color: 'var(--muted)' }} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[0.875rem] truncate">{food.name}</p>
            <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {[food.brand, code].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            onClick={() => take({ name: food.brand ? `${food.brand} ${food.name}` : food.name, emoji: food.emoji, barcode: code })}
            className="press rounded-full px-3 py-1.5 text-[0.78125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {action}
          </button>
        </Card>
      )}

      {phase === 'unknown' && (
        <Card className="!p-3">
          <p className="font-bold text-[0.84375rem]">Barcode {code} isn’t in the catalogue</p>
          <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing is invented for an unknown code. Add it by name instead and it’ll be yours from then on.
          </p>
          <button
            onClick={() => take({ name: `Item ${code.slice(-4)}`, barcode: code })}
            className="press mt-2 w-full rounded-2xl border py-2 text-[0.78125rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            {action} it as an unnamed item
          </button>
        </Card>
      )}

      {(phase === 'found' || phase === 'unknown') && isBarcode(code) && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={lookupOnline}
            disabled={onlineBusy}
            className="press w-full rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold disabled:opacity-50"
            style={{ borderColor: 'var(--line)' }}
          >
            {onlineBusy ? 'Checking Open Food Facts…' : 'Find product data and observed prices online'}
          </button>
          {onlineMessage && <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{onlineMessage}</p>}
        </div>
      )}

      {online?.product && (
        <Card className="!p-3 space-y-2">
          <div className="flex items-start gap-3">
            {online.product.imageUrl && <img src={online.product.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[0.875rem] truncate">{online.product.name}</p>
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {[online.product.brand, online.product.quantity, 'Open Food Facts'].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          {online.product.nutrition && (
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {[online.product.nutrition.kcal && `${online.product.nutrition.kcal} kcal/100g`, online.product.nutrition.protein && `${online.product.nutrition.protein}g protein`, online.product.nutrition.sugar && `${online.product.nutrition.sugar}g sugar`].filter(Boolean).join(' · ')}
            </p>
          )}
          {online.prices?.length > 0 ? (
            <div>
              <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {online.prices.length} GBP price observation{online.prices.length === 1 ? '' : 's'} from Open Prices; these are community data, not a live supermarket quote.
              </p>
              <ul className="mt-1 space-y-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {online.prices.slice(0, 3).map((price, index) => {
                  const stale = observedStaleness(price.observedAt);
                  const tone = stale.tone === 'good' ? 'good' : stale.tone === 'warn' ? 'warn' : stale.tone === 'danger' ? 'danger' : 'muted';
                  return (
                    <li key={`${price.id || price.store || 'price'}-${index}`} className="flex flex-wrap items-center gap-1.5">
                      <span>{gbp(price.price, { always: true })} · {price.store || 'Shop not named'}</span>
                      <Pill tone={tone}>{stale.label}</Pill>
                      <span className="text-[0.625rem]" style={{ color: 'var(--faint)' }}>{price.observedAt ? String(price.observedAt).slice(0, 10) : 'date unknown'}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-[0.625rem] font-semibold" style={{ color: 'var(--faint)' }}>Community observed — not a live quote. Old rows may be out of date.</p>
            </div>
          ) : online.priceStatus === 'unavailable' ? (
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Open Prices is temporarily unavailable. The Open Food Facts product data above is still usable.
            </p>
          ) : (
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              No GBP observations were returned. Open Food Facts does not provide a live supermarket price.
            </p>
          )}
          <button
            type="button"
            onClick={() => take({
              name: online.product.brand ? `${online.product.brand} ${online.product.name}` : online.product.name,
              barcode: code,
              imageUrl: online.product.imageUrl,
            })}
            className="press w-full rounded-2xl py-2.5 text-[0.78125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Use this product
          </button>
        </Card>
      )}

      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--faint)' }}>
          Barcodes this build can read
        </p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {SCANNABLE.slice(0, 8).map((f) => (
            <Chip key={f.id} onClick={() => resolve(f.barcode)}>{f.brand ? `${f.brand} ` : ''}{f.name}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
