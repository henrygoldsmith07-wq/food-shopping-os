/**
 * Price evidence — predicted prices and actual receipt prices are TWO
 * INDEPENDENT observations (task: separate predicted price from actual
 * receipt price).
 *
 * A price that Forq showed before shopping and a price that was paid at the
 * till are different facts about the world. They must never originate from
 * the same mutable list field, and neither may be relabelled into the other:
 * the list price carried to the shop stays a PREDICTION; only an
 * independently observed receipt price is an OUTCOME.
 *
 * This module holds:
 *   - PRICE_PROVENANCE — the controlled vocabulary for who produced a
 *     PREDICTED price (`forq-price-estimate`, `retailer-price`,
 *     `historical-receipt-estimate`, `user-manual-price`, `unknown`). Forq
 *     spend accuracy scores only prices Forq genuinely produced or selected;
 *     a Forq-generated quantity with a user-entered price is NOT a Forq
 *     price prediction.
 *   - ACTUAL_PRICE_PROVENANCE — the controlled vocabulary for who observed
 *     an OUTCOME price (`actual-receipt`, `receipt-import`). Only these
 *     labels make a price an actual; absent both, `actualPrice` is null and
 *     the row has no outcome evidence.
 *   - linkReceiptRows — conservative linkage of receipt rows back to frozen
 *     prediction rows: immutable row id, then explicit user confirmation,
 *     then canonical subject match ONLY when it is provably unambiguous.
 *     Never a silent name match.
 */

/** Who produced a PREDICTED price (the frozen prediction side). */
export const PRICE_PROVENANCE = {
  FORQ_ESTIMATE: 'forq-price-estimate',         // Forq's pricing engine produced/selected it
  RETAILER_PRICE: 'retailer-price',             // Forq selected a retailer reference price
  HISTORICAL_RECEIPT: 'historical-receipt-estimate', // Forq reused this household's recorded history
  USER_MANUAL: 'user-manual-price',             // the household typed the price themselves
  USER_SUBSTITUTION: 'user-substitution',       // the household swapped the ingredient — the displayed price rode a user decision, never Forq advice
  UNKNOWN: 'unknown',                           // no provable origin — never scored
};

/** Who observed an OUTCOME price (the independent receipt side). */
export const ACTUAL_PRICE_PROVENANCE = {
  RECEIPT: 'actual-receipt',   // confirmed from the paper/till receipt at checkout
  RECEIPT_IMPORT: 'receipt-import', // imported receipt rows (CSV/photo pipeline)
};

/** Price provenances Forq may CLAIM accuracy for — Forq selected the number. */
export const FORQ_PRICE_PROVENANCE = [
  PRICE_PROVENANCE.FORQ_ESTIMATE,
  PRICE_PROVENANCE.RETAILER_PRICE,
  PRICE_PROVENANCE.HISTORICAL_RECEIPT,
];

export const isForqPriceProvenance = (value) => FORQ_PRICE_PROVENANCE.includes(value);

/**
 * Resolve a freeze row's predicted price provenance. An explicit stamp wins
 * (frozen with the evidence); otherwise it is derived from the row's list
 * `priceSource` — with one deliberate LEGACY rule: a freeze row carrying a
 * positive price but no provenance at all was priced by Forq's list engine,
 * so it resolves to `forq-price-estimate` (labelled legacy, never silently —
 * `legacy: true` rides the result). An explicitly `manual` list price stays
 * the household's own number; a zero/absent price is `unknown`.
 */
export const priceProvenanceFor = (row = {}) => {
  const explicit = row.priceProvenance == null ? null : String(row.priceProvenance);
  if (explicit && Object.values(PRICE_PROVENANCE).includes(explicit)) {
    return { provenance: explicit, legacy: false };
  }
  // The row's frozen PREDICTION provenance (who created/repeated the row)
  // also owns its price when no explicit price stamp exists: a row the
  // household hand-added or repeated from their own last shop carries the
  // household's own numbers — never Forq advice — and a substitution rides
  // the household's swap decision. (Vocabulary mirrors PREDICTION_PROVENANCE
  // in prediction-evidence.js, inlined here to keep the two modules decoupled.)
  const rowProvenance = row.provenance == null ? null : String(row.provenance);
  if (rowProvenance === 'user-manual' || rowProvenance === 'user-repeat-shop') {
    return { provenance: PRICE_PROVENANCE.USER_MANUAL, legacy: false };
  }
  if (rowProvenance === 'user-substitution') {
    return { provenance: PRICE_PROVENANCE.USER_SUBSTITUTION, legacy: false };
  }
  const price = Number(row.predictedPrice ?? row.price);
  const source = row.priceSource == null ? null : String(row.priceSource);
  if (source === 'manual') return { provenance: PRICE_PROVENANCE.USER_MANUAL, legacy: false };
  if (source === 'receipt' || source === 'historical') {
    // A `receipt` priceSource on a LIST row means historical price memory —
    // a past receipt, not this till — so it stays an estimate Forq reused.
    return { provenance: PRICE_PROVENANCE.HISTORICAL_RECEIPT, legacy: false };
  }
  if (source === 'retailer') return { provenance: PRICE_PROVENANCE.RETAILER_PRICE, legacy: false };
  if (!(price > 0)) return { provenance: PRICE_PROVENANCE.UNKNOWN, legacy: false };
  // Deliberate legacy resolution: the list engine priced this row; the
  // priceSource vocabulary never recorded who. Frozen as Forq's estimate,
  // labelled legacy so evaluation can tell the difference.
  return { provenance: PRICE_PROVENANCE.FORQ_ESTIMATE, legacy: true };
};

/**
 * Is this item's price an INDEPENDENTLY OBSERVED actual? Only items carrying
 * both a positive `actualPrice` and an outcome provenance label count —
 * a bare `price` is the carried list price (a prediction echo), never an
 * outcome. `item.actualPriceSource` must be one of ACTUAL_PRICE_PROVENANCE.
 */
export const observedActualPriceOf = (item = {}) => {
  const price = Number(item?.actualPrice);
  const source = item?.actualPriceSource == null ? null : String(item.actualPriceSource);
  if (!(price > 0) || !Object.values(ACTUAL_PRICE_PROVENANCE).includes(source)) return null;
  return { price, source, observedAt: item?.observedAt ?? null };
};

/** Canonical row key for conservative matching (exact subject identity). */
const rowKeyOf = (value) => String(value ?? '').trim().toLowerCase();

/** The receipt-outcome record schema version (task: version frozen evidence). */
export const OUTCOME_SCHEMA_VERSION = 1;

const OUTCOME_CONFIDENCE = { 'actual-receipt': 'high', 'receipt-import': 'medium' };

/**
 * The canonical RECEIPT OUTCOME RECORD (task: actual price-observation
 * pipeline) — one shape for every trusted checkout source. Built from a
 * shop item ONLY when the item carries an independently observed actual
 * price (`observedActualPriceOf`); an item whose price is the carried list
 * price produces NO outcome record — nothing is manufactured.
 *
 * Spend evaluation consumes THESE records, never the shopping-list price:
 * `shopId`, linked row id, frozen subject, actual line price, quantity,
 * store, observed timestamp, source, confidence and schema version ride
 * every record, so each scored row proves where its outcome came from.
 */
export const receiptOutcomeRecord = (item = {}, shop = {}) => {
  const observed = observedActualPriceOf(item);
  if (!observed) return null;
  return {
    schemaVersion: OUTCOME_SCHEMA_VERSION,
    shopId: shop?.id ?? null,
    rowId: item?.id ?? item?.confirmedRowId ?? null,
    subjectKey: item?.subjectKey == null ? null : String(item.subjectKey),
    actualPrice: observed.price,
    actualPriceSource: observed.source,
    confidence: OUTCOME_CONFIDENCE[observed.source] || 'low',
    quantity: item?.qty == null ? null : String(item.qty),
    store: shop?.store ?? null,
    observedAt: observed.observedAt ?? shop?.date ?? null,
  };
};

/** All outcome records for one shop — the rows whose prices were observed. */
export const receiptOutcomeRecords = (shop = {}) => (Array.isArray(shop?.items) ? shop.items : [])
  .map((item) => receiptOutcomeRecord(item, shop))
  .filter(Boolean);

/**
 * Link receipt rows back to frozen prediction rows — CONSERVATIVELY, in
 * this order (task: link receipt imports back to predictions safely):
 *
 *   1. `row-id` — the immutable row id carried through checkout;
 *   2. `user-confirmed` — the receipt row carries an explicit
 *      `confirmedRowId` (the user confirmed the match in the UI);
 *   3. `canonical-exact` — the receipt row's name matches the frozen row's
 *      subject EXACTLY, and the match is provably unambiguous on BOTH sides
 *      (exactly one frozen row and one receipt row for that subject).
 *
 * Ambiguous or unmatched receipt rows stay unlinked — never name-matched by
 * best effort. Returns a Map: prediction row id → { item, method }.
 */
export const linkReceiptRows = ({ predictionRows = [], receiptRows = [], canonicalKeyOf = null } = {}) => {
  const items = (Array.isArray(receiptRows) ? receiptRows : []).filter((item) => item && typeof item === 'object');
  const links = new Map();
  const keyOf = typeof canonicalKeyOf === 'function' ? canonicalKeyOf : rowKeyOf;

  // Uniqueness maps for the canonical-exact pass: a subject with more than
  // one candidate on either side is ambiguous and never auto-matched.
  const freezeByKey = new Map();
  for (const row of Array.isArray(predictionRows) ? predictionRows : []) {
    if (!row || row.listItemId == null) continue;
    const key = keyOf(row.subjectKey ?? row.name);
    if (!key) continue;
    freezeByKey.set(key, (freezeByKey.get(key) || []).concat(row));
  }
  const receiptByKey = new Map();
  for (const item of items) {
    const key = keyOf(item.subjectKey ?? item.name);
    if (!key) continue;
    receiptByKey.set(key, (receiptByKey.get(key) || []).concat(item));
  }
  const byId = new Map(items.filter((item) => item.id != null).map((item) => [String(item.id), item]));
  const byConfirmedId = new Map(
    items.filter((item) => item.confirmedRowId != null).map((item) => [String(item.confirmedRowId), item]),
  );

  for (const row of Array.isArray(predictionRows) ? predictionRows : []) {
    if (!row || row.listItemId == null) continue;
    const rid = String(row.listItemId);
    const byRowId = byId.get(rid);
    if (byRowId) {
      links.set(rid, { item: byRowId, method: 'row-id' });
      continue;
    }
    const confirmed = byConfirmedId.get(rid);
    if (confirmed) {
      links.set(rid, { item: confirmed, method: 'user-confirmed' });
      continue;
    }
    const key = keyOf(row.subjectKey ?? row.name);
    const freezeCandidates = freezeByKey.get(key) || [];
    const receiptCandidates = receiptByKey.get(key) || [];
    if (key && freezeCandidates.length === 1 && receiptCandidates.length === 1) {
      links.set(rid, { item: receiptCandidates[0], method: 'canonical-exact' });
    }
    // Anything else stays unlinked — no silent match.
  }
  return links;
};
