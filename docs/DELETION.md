# Deletion runbook

What lives where, and how each copy is erased. Household deletion is
owner-only (`DELETE /api/households`, `households:delete` rate limit 5/h).

## 1. Device record (app owns, implemented)

- IndexedDB canonical store + `localStorage` pointer (`forq-state-v2`).
- Delete: Profile > Privacy & data > Delete local data, or
  `app.reset()` / clear site data in the browser.
- Demo sandbox (`isDemoSession`) never writes to the real store.
- Tested by `tests/store-persistence` + manual export/restore in
  `PrivacyPanel`.

## 2. Redis household (app owns, implemented)

Upstash Redis via `getDatabase()` (`src/server/database.js`).
`deleteHouseholdData(db, householdId)` deletes every household-scoped
collection:

`householdStates`, `memberships`, `invitations`, `coachShares`,
`uploads` (metadata), `notificationOutbox`, `auditEvents`, `aiUsage`,
`realtimeEvents`, `analyticsDaily`, `analyticsEventReceipts`.

Then `households.deleteOne({_id, ownerId})`. The flow marks
`deletingAt` first so concurrent writes get 410, deletes Blob files
first, deletes DB rows twice (before and after the household row),
then writes a `household.deleted` tombstone audit event last.

## 3. Blob receipts (app owns, stubbed when credentials missing)

- `uploads` rows carry `pathname`. `deleteReceiptBlobs` deletes in
  batches of 100 via `@vercel/blob` `del` with `BLOB_READ_WRITE_TOKEN`.
- Stub: when `uploads` exist but `BLOB_READ_WRITE_TOKEN` is unset,
  deletion throws 503 `Receipt storage deletion is not configured`
  rather than silently leaving files. With no uploads, deletion
  succeeds without a token.
- Tested in `tests/household-deletion-route.test.js` (with-token path)
  and `tests/deletion-blob-stub.test.js` (missing-token stub).

## 4. Coach shares (app owns, implemented)

- Part of `deleteHouseholdData` (`coachShares` collection).
- Individual revocation: `DELETE /api/coach-shares?id=` sets
  `revokedAt`. Disabled by default (`FORQ_COACH_SHARES_ENABLED`).
- See `docs/COACH_SHARES.md` for expiry, revocation, payload.

## 5. Rate-limit keys (expire automatically, documented)

- `rateLimits` collection (`src/server/api.js`): `_id` is
  `<key>:<window>`, with `expiresAt = window + 2×windowMs`.
- Household deletion does not need to delete them: they contain only
  counters (`ai:<user>`, `coach-shares:*:<user>`, `households:delete`,
  `analytics:<user>`), no household content, and expire within hours.
- If a compliance purge is required, delete by prefix:
  `ai:<userId>*`, `coach-shares:*:<userId>*`,
  `households:delete:<userId>*`, `analytics:<userId>*`.
  Tested by `tests/rate-limit-expiry.test.js` (TTL shape).

## Order of operations (server)

1. `assertSameOrigin`, `requireUser`, `households:delete` rate limit.
2. `requireHousehold(..., {allowDeleting:true})`, owner check.
3. Mark `deletingAt`.
4. `deleteReceiptBlobs` (or 503 stub).
5. `deleteHouseholdData` → `households.deleteOne` → repeat cleanup.
6. Write `household.deleted` tombstone.
