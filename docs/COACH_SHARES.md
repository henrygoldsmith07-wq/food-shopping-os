# Coach-share links (disabled by default)

Coach-share links are parked behind Add tools (`coach`) and behind the
build flag `FORQ_COACH_SHARES_ENABLED`. In the default build all three
routes return 403:

- `POST /api/coach-shares` — issue a link
- `GET /api/coach-shares` — list links
- `GET /api/coach/:token` — read a shared snapshot
- `DELETE /api/coach-shares?id=` — revoke (requires the flag too)

To enable locally: `FORQ_COACH_SHARES_ENABLED=true` plus the `coach`
tool in Add tools. Do not enable in production unless a coach workflow
needs it.

## Expiry

- `expiresInDays` 1–90, default 30. Stored as `expiresAt`.
- `GET /api/coach/:token` only serves shares with
  `revokedAt == null && expiresAt > now`. Expired links read as 404.

## Revocation

- Owner/admin: `DELETE /api/coach-shares?id=<shareId>` sets
  `revokedAt`. Revoked links read as 404 immediately.
- Household deletion (`DELETE /api/households`) deletes all
  `coachShares` rows for the household.
- Every view writes `coach-share.viewed` to `auditEvents` and bumps
  `viewCount`/`lastViewedAt`.

## Payload

`readCoachShare` returns only the scopes chosen at creation:

- `diary`: `log`, `cooked`
- `nutrition`: `goal`, `diets`, `allergies`, `intolerances`, `targets`, `weeklyKcal`
- `plan`: `plan`
- `health`: `body`, `measurements`, `vitals`, `sleep`, `stress`,
  `cycles`, `workouts`, `bloods`, `glucose`

Health is a separate opt-in scope. Under-18 mode never offers it.
The link is read-only, expiring, revocable, `no-store` +
`noindex, nofollow`. No token is ever logged; only its SHA-256 hash
is stored.
