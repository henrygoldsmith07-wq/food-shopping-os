/**
 * Labeling Monid rows on the client.
 *
 * Everything else in the price table is the app's own reading of a
 * retailer's page; a Monid row is a paid lookup through a hosted data
 * service, and the two deserve different trust and different words. Kept in
 * its own module beside the server's Monid adapter so the client's idea of a
 * Monid row cannot drift from what the server actually returns.
 */

/**
 * Monid rows are the ones this app did not read off a shop page itself.
 * Kept beside the other method maps in live-prices (re-exported there) so
 * the ranking and the provenance panel cannot describe the same row in
 * different words.
 */
export const monidLabel = 'from Monid, a paid data service — not read from a shop page';

export const monidTone = 'accent';

/**
 * The Monid rows of one check, plus the shape of the miss.
 *
 * A run where Monid found nothing is not the same as a run where Monid was
 * never asked or never answered, and the panel says which: a `disabled` or
 * `error` status is about this deployment, a `no-match` is about the product,
 * and only `ok` with rows means money was spent and something came back.
 * `rows` is flat (the adapter returns one result per product, not per shop);
 * `named` re-attaches which list item each row belongs to when the caller
 * knows it, so the panel can say "for X, Monid had Y".
 */
export const splitMonidRows = (results = []) => {
  const list = Array.isArray(results) ? results : [];
  const monidResults = list.filter((entry) => entry?.source === 'monid');
  const monid = monidResults[0] || null;
  const rows = (monid?.rows || []).slice();
  // Monid rows carry the item's own `query`; scoped rows are used when the
  // panel renders per-item and should not show another item's prices.
  return {
    monid,
    rows,
    status: monid?.status || null,
    note: monid?.note || null,
    provider: monid?.provider || null,
    named: (query) => rows.filter((row) => !query || row.query === query),
  };
};
