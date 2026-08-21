import { useRef, useState } from 'react';
import {
  Camera, Check, Gift, Plus, ScanLine, Tag, Ticket, Trash2, X,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { applyOffers, OFFER_KINDS } from '../lib/shopping.js';
import {
  COUPON_KINDS, couponExpiryLabel, couponsForList, LOYALTY_PROGRAMMES, draftCouponFromPhoto,
} from '../lib/coupons.js';
import { Card, Chip, Pill } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';

const BLANK_OFFER = { label: '', match: '', kind: 'money', value: '', store: '', expiry: '' };
const BLANK_COUPON = { label: '', match: '', kind: 'money', value: '', store: '', expiry: '', code: '', programme: '' };

/**
 * Offers + coupon/rewards vault.
 *
 * Forq has no deals feed. Offers are the ones you type; coupons/rewards are
 * a manual vault with an optional photo → OCR assist (on-device only). The
 * OCR never auto-saves — you confirm every field.
 */
export default function OffersPanel() {
  const app = useApp();
  const [draftOffer, setDraftOffer] = useState(BLANK_OFFER);
  const [draftCoupon, setDraftCoupon] = useState(BLANK_COUPON);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState('');
  const fileRef = useRef(null);
  const offerKind = OFFER_KINDS.find((k) => k.id === draftOffer.kind);
  const couponKind = COUPON_KINDS.find((k) => k.id === draftCoupon.kind);
  const { lines: offerLines, saved: offerSaved } = applyOffers(app.shoppingList, app.offers, { today: app.day });
  const couponHits = couponsForList(app.coupons, app.shoppingList, app.day);
  const couponSavedHint = couponHits.length ? `${couponHits.length} coupon${couponHits.length === 1 ? '' : 's'} match your list` : 'No vault coupons match the list yet';

  const addOffer = () => {
    if (draftOffer.label.trim().length < 2 || !draftOffer.match.trim()) return;
    app.addOffer(draftOffer);
    setDraftOffer(BLANK_OFFER);
  };

  const addCoupon = () => {
    if (draftCoupon.label.trim().length < 2) return;
    // manual vault: needs at least a match or a loyalty programme when it's points/freebie
    if (!draftCoupon.match.trim() && draftCoupon.kind !== 'points' && draftCoupon.kind !== 'freebie') return;
    if ((draftCoupon.kind === 'money' || draftCoupon.kind === 'percent' || draftCoupon.kind === 'multibuy') && !(Number(draftCoupon.value) > 0)) return;
    app.addCoupon({ ...draftCoupon, source: ocrNote ? 'photo-ocr' : 'manual' });
    setDraftCoupon(BLANK_COUPON);
    setOcrNote('');
  };

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOcrBusy(true);
    setOcrNote('');
    try {
      const draft = await draftCouponFromPhoto(file);
      setDraftCoupon((prev) => ({
        ...prev,
        label: draft.label || prev.label,
        kind: draft.kind || prev.kind,
        value: draft.value || prev.value,
        code: draft.code || prev.code,
      }));
      setOcrNote(draft.ocrLines?.length ? `Photo read · ${draft.ocrLines[0].slice(0, 56)} — check before saving` : 'Photo read — check and save');
    } catch (error) {
      setOcrNote(error.message || 'Photo could not be read — type the coupon instead.');
    } finally {
      setOcrBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="px-5 pb-10 space-y-5">
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>On your list</p>
        <p className="mt-0.5 text-[1.375rem] font-extrabold">{gbp(offerSaved, { always: true })} <span className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>from offers</span></p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {app.offers.length === 0
            ? 'No offers yet. Nothing here is fetched from a shop — add the ones you actually have.'
            : offerLines.length === 0
              ? 'None of your offers match anything on the list yet.'
              : `${offerLines.length} offer${offerLines.length === 1 ? '' : 's'} apply to what you’re buying.`}
        </p>
        {app.coupons?.length > 0 && (
          <p className="mt-1 text-[0.75rem] font-semibold flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
            <Ticket size={12} /> {couponHits.length ? <span style={{ color: 'var(--good)', fontWeight: 700 }}>{couponSavedHint}</span> : couponSavedHint} · {app.couponVault.active} active, {app.couponVault.expiringSoon} expiring soon
          </p>
        )}
      </Card>

      {/* Coupon & rewards vault */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}><Gift size={13} /> Coupon & rewards vault</p>
          {app.couponVault.active > 0 && <Pill tone="faint">{app.couponVault.active} active</Pill>}
        </div>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Manual vault — no retailer feed. Add by typing, or photograph a coupon/receipt and let on-device OCR seed the draft for you to confirm. Photo stays on-device.
        </p>

        {/* Photo assist */}
        <div className="rounded-2xl border p-3 flex items-center gap-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} aria-label="Photograph a coupon" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={ocrBusy}
            className="press inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[0.8125rem] font-extrabold disabled:opacity-50"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          >
            <Camera size={14} /> {ocrBusy ? 'Reading…' : 'Photo → draft'}
          </button>
          <span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>or type below</span>
          {ocrBusy && <ScanLine size={14} className="animate-pulse" style={{ color: 'var(--muted)' }} />}
        </div>
        {ocrNote && <p className="text-[0.75rem] font-semibold rounded-xl border px-3 py-2" style={{ borderColor: 'var(--line)', color: 'var(--muted)', background: 'var(--card)' }}>{ocrNote}</p>}

        {app.coupons?.length > 0 && (
          <div className="space-y-2">
            {app.coupons.map((coupon) => {
              const expiry = couponExpiryLabel(coupon, app.day);
              const hit = couponHits.find((h) => h.coupon.id === coupon.id);
              const programme = LOYALTY_PROGRAMMES.find((p) => p.id === coupon.programme);
              return (
                <div key={coupon.id} className="rounded-2xl border px-3 py-2.5 flex items-start gap-2.5" style={{ borderColor: coupon.used ? 'var(--line)' : expiry.urgent ? 'var(--warn)' : 'var(--line)', background: coupon.used ? 'var(--card-2)' : 'var(--card)', opacity: coupon.used ? 0.72 : 1 }}>
                  <Ticket size={15} className="mt-0.5 shrink-0" style={{ color: coupon.used ? 'var(--faint)' : 'var(--muted)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[0.8125rem] truncate">{coupon.label} {coupon.used && <span className="font-semibold" style={{ color: 'var(--muted)' }}>· used</span>}</p>
                    <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                      {coupon.match ? `matches “${coupon.match}”` : programme ? programme.label : coupon.kind} {coupon.store ? `· ${coupon.store}` : ''} {coupon.code ? `· ${coupon.code}` : ''}
                    </p>
                    {coupon.expiry && <p className="text-[0.71875rem] font-semibold" style={{ color: expiry.tone === 'danger' ? 'var(--danger)' : expiry.tone === 'warn' ? 'var(--warn)' : 'var(--muted)' }}>{expiry.label}</p>}
                    <p className="mt-1">
                      {hit
                        ? <Pill tone="good">matches {hit.hits.length} on list: {hit.hits.slice(0, 2).join(', ')}{hit.hits.length > 2 ? ` +${hit.hits.length - 2}` : ''}</Pill>
                        : <Pill tone="faint">no list match yet</Pill>}
                      {coupon.source === 'photo-ocr' && <span className="ml-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>photo-OCR draft</span>}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => app.toggleCouponUsed(coupon.id)} aria-label={coupon.used ? `Mark ${coupon.label} unused` : `Mark ${coupon.label} used`} className="press p-1.5 rounded-xl border" style={{ borderColor: 'var(--line)', color: coupon.used ? 'var(--muted)' : 'var(--good)' }}>
                      {coupon.used ? <X size={13} /> : <Check size={13} />}
                    </button>
                    <button onClick={() => app.removeCoupon(coupon.id)} aria-label={`Remove ${coupon.label}`} className="press p-1.5" style={{ color: 'var(--faint)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t space-y-2.5" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Add to vault</p>
          <input
            value={draftCoupon.label}
            onChange={(e) => setDraftCoupon((d) => ({ ...d, label: e.target.value }))}
            placeholder="What it says — “£1 off pasta” or “Double Nectar points”"
            aria-label="Coupon description"
            className="w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <div className="flex gap-1.5 flex-wrap">
            {COUPON_KINDS.map((k) => (
              <Chip key={k.id} active={draftCoupon.kind === k.id} onClick={() => setDraftCoupon((d) => ({ ...d, kind: k.id }))}>{k.label}</Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Coupon match</span>
              <input
                value={draftCoupon.match}
                onChange={(e) => setDraftCoupon((d) => ({ ...d, match: e.target.value }))}
                placeholder="pasta"
                aria-label="Coupon match"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
            <NumberField
              label={draftCoupon.kind === 'money' ? 'Coupon value' : draftCoupon.kind === 'percent' ? 'Coupon percentage' : draftCoupon.kind === 'multibuy' ? 'Coupon quantity' : 'Coupon value (optional)'}
              value={draftCoupon.value}
              onChange={(v) => setDraftCoupon((d) => ({ ...d, value: v }))}
              suffix={draftCoupon.kind === 'money' ? '£' : draftCoupon.kind === 'percent' ? '%' : draftCoupon.kind === 'multibuy' ? 'for' : ''}
              step={draftCoupon.kind === 'percent' ? 5 : 1}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              value={draftCoupon.store}
              onChange={(e) => setDraftCoupon((d) => ({ ...d, store: e.target.value }))}
              placeholder="Which shop (optional)"
              aria-label="Coupon shop"
              className="w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <input
              value={draftCoupon.code}
              onChange={(e) => setDraftCoupon((d) => ({ ...d, code: e.target.value }))}
              placeholder="Code (optional)"
              aria-label="Coupon code"
              className="w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Loyalty programme</span>
              <select
                value={draftCoupon.programme || ''}
                onChange={(e) => setDraftCoupon((d) => ({ ...d, programme: e.target.value || '' }))}
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              >
                <option value="">None</option>
                {LOYALTY_PROGRAMMES.filter((p) => p.id !== 'other').map((p) => <option key={p.id} value={p.id}>{p.label}{p.retailer ? ` · ${p.retailer}` : ''}</option>)}
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Expiry (optional)</span>
              <input
                type="date"
                value={draftCoupon.expiry}
                onChange={(e) => setDraftCoupon((d) => ({ ...d, expiry: e.target.value }))}
                aria-label="Coupon expiry"
                className="mt-1 w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
          </div>
          <button
            onClick={addCoupon}
            disabled={draftCoupon.label.trim().length < 2 || (!draftCoupon.match.trim() && draftCoupon.kind !== 'points' && draftCoupon.kind !== 'freebie')}
            className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-1.5"><Plus size={15} /> Add to vault</span>
          </button>
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Vault items never invent savings — they only match your list by name and flag expiry. Photo is on-device only via TextDetector; falls back to typing when unavailable.
          </p>
        </div>
      </Card>

      {app.offers.length > 0 && (
        <div className="space-y-2.5">
          {app.offers.map((offer) => {
            const line = offerLines.find((l) => l.offer.id === offer.id);
            return (
              <Card key={offer.id} className="flex items-start gap-3 !p-3">
                <Tag size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[0.875rem]">{offer.label}</p>
                  <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    matches “{offer.match}”{offer.store ? ` · ${offer.store}` : ''}
                  </p>
                  {offer.expiry && (
                    <p className="text-[0.71875rem] font-semibold" style={{ color: offer.expiry < app.day ? 'var(--danger)' : 'var(--muted)' }}>
                      {offer.expiry < app.day ? 'Expired' : 'Expires'} {offer.expiry}
                    </p>
                  )}
                  {line
                    ? <p className="mt-1"><Pill tone="good">saves {gbp(line.saved, { always: true })} on {line.items.length} item{line.items.length === 1 ? '' : 's'}</Pill></p>
                    : <p className="mt-1"><Pill tone="faint">nothing on the list matches</Pill></p>}
                </div>
                <button
                  onClick={() => app.removeOffer(offer.id)}
                  aria-label={`Remove ${offer.label}`}
                  className="press p-1 shrink-0"
                  style={{ color: 'var(--faint)' }}
                >
                  <Trash2 size={15} />
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Add an offer</p>
        <input
          value={draftOffer.label}
          onChange={(e) => setDraftOffer((d) => ({ ...d, label: e.target.value }))}
          placeholder={`What it says — “${offerKind.hint} pasta”`}
          aria-label="Offer description"
          className="w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <div className="flex gap-2">
          {OFFER_KINDS.map((k) => (
            <Chip key={k.id} active={draftOffer.kind === k.id} onClick={() => setDraftOffer((d) => ({ ...d, kind: k.id }))}>{k.label}</Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Applies to</span>
            <input
              value={draftOffer.match}
              onChange={(e) => setDraftOffer((d) => ({ ...d, match: e.target.value }))}
              placeholder="pasta"
              aria-label="Applies to"
              className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
          </label>
          <NumberField
            label={draftOffer.kind === 'money' ? 'Amount off' : draftOffer.kind === 'percent' ? 'Per cent off' : 'Buy this many'}
            value={draftOffer.value}
            onChange={(v) => setDraftOffer((d) => ({ ...d, value: v }))}
            suffix={draftOffer.kind === 'money' ? '£' : draftOffer.kind === 'percent' ? '%' : 'for'}
            step={draftOffer.kind === 'percent' ? 5 : 1}
          />
        </div>
        <input
          value={draftOffer.store}
          onChange={(e) => setDraftOffer((d) => ({ ...d, store: e.target.value }))}
          placeholder="Which shop (optional)"
          aria-label="Offer shop"
          className="w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Expiry date (optional)</span>
          <input
            type="date"
            value={draftOffer.expiry}
            onChange={(e) => setDraftOffer((d) => ({ ...d, expiry: e.target.value }))}
            aria-label="Offer expiry date"
            className="mt-1 w-full rounded-2xl border px-4 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </label>
        <button
          onClick={addOffer}
          disabled={draftOffer.label.trim().length < 2 || !draftOffer.match.trim()}
          className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Plus size={15} /> Add offer</span>
        </button>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          A multibuy of “3 for 2” takes the cheapest of every three matching items off the total.
        </p>
      </Card>
    </div>
  );
}
