import { Card, Sheet } from './ui.jsx';
import { FinishShop } from './ShopForms.jsx';
import OffersPanel from './OffersPanel.jsx';
import BarcodeAdd from './BarcodeAdd.jsx';
import ReceiptScan from './ReceiptScan.jsx';
import ShoppingExport from './ShoppingExport.jsx';
import { recordProductEvent } from '../lib/product-analytics.js';

/**
 * Everything the Shop tab opens on top of itself: finishing a shop, the offers
 * you entered, the aisle-order editor, the two scanners and the plain-text
 * export.
 *
 * They live together because they are all the same kind of thing — a step you
 * step into and back out of — and separately from the tab because the tab is
 * already the longest screen in the app.
 */
export default function ShopSheets({
  app, sheet, setSheet, store, visibleList, ticked, shoppingSession, honestOffers,
  routeEditor, setRouteEditor, routeOrder, moveAisle, saveRoute, asText, onOpenPantry,
}) {
  return (
    <>
      <Sheet open={sheet === 'finish'} onClose={() => setSheet(null)} title="Finish shop">
        <FinishShop
          items={visibleList}
          store={store}
          onDone={() => {
            recordProductEvent('shopping_completed', { count: ticked });
            setSheet(null);
            shoppingSession.stop();
          }}
        />
      </Sheet>
      <Sheet open={sheet === 'offers'} onClose={() => setSheet(null)} title="Offers you have">
        <div className="px-5 pb-10 space-y-3">
          <OffersPanel />
          {honestOffers.filter((row) => !row.quality.honest && row.offer.kind === 'multibuy').length > 0 && (
            <Card className="!p-3 space-y-2" style={{ background: 'var(--card-2)' }}>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                Deals that can't fire on this list
              </p>
              {honestOffers.filter((row) => !row.quality.honest && row.offer.kind === 'multibuy').map(({ offer, quality }) => (
                <p key={offer.id} className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {offer.label}: {quality.note}
                </p>
              ))}
            </Card>
          )}
        </div>
      </Sheet>
      <Sheet open={routeEditor} onClose={() => setRouteEditor(false)} title={`Route for ${store || 'this shop'}`}>
        <div className="px-5 pb-10 space-y-2">
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Move aisles into the order you walk them. This replaces the learned route for {store}.
          </p>
          {routeOrder.map((aisle, index) => (
            <Card key={aisle} className="!p-3 flex items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-extrabold truncate">
                <span className="mr-2 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>{index + 1}</span>
                {aisle}
              </span>
              <span className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveAisle(index, -1)}
                  aria-label={`Move ${aisle} up`}
                  className="press flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-30"
                  style={{ borderColor: 'var(--line)' }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === routeOrder.length - 1}
                  onClick={() => moveAisle(index, 1)}
                  aria-label={`Move ${aisle} down`}
                  className="press flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-30"
                  style={{ borderColor: 'var(--line)' }}
                >
                  ↓
                </button>
              </span>
            </Card>
          ))}
          <button
            type="button"
            onClick={saveRoute}
            className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Save route for {store}
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'scan'} onClose={() => setSheet(null)} title="Scan onto the list">
        <div className="px-5 pb-10">
            <BarcodeAdd action="Add" onPick={(item) => app.addToList({ ...item, store })} />
        </div>
      </Sheet>
      <Sheet open={sheet === 'receipt'} onClose={() => setSheet(null)} title="Read a receipt">
        <ReceiptScan onDone={() => { setSheet(null); onOpenPantry?.(); }} />
      </Sheet>
      <Sheet open={sheet === 'export'} onClose={() => setSheet(null)} title="Your list as text">
        <ShoppingExport text={asText()} />
      </Sheet>
    </>
  );
}
