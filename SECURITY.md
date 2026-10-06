# Security policy

## Supported versions

Forq is local-first. The current `main` branch receives security fixes.
If you run a fork or a pinned deployment, upgrade to the latest `main`
before reporting.

## Report a vulnerability

Email the maintainer via the GitHub repository
(github.com/henrygoldsmith07-wq/food-shopping-os) with:

- what you found and where (URL, route, file, commit)
- steps to reproduce with a fresh local install if possible
- what data you accessed (do not include other people's household data)

Do not open a public issue for an unpatched vulnerability that exposes
household data, auth tokens, or receipt images.

We aim to acknowledge within 72 hours and to ship or document a fix
within 30 days.

## Scope

In scope:

- household sync auth and authorisation (`src/app/api/households`, `src/app/api/sync`)
- coach-share token issue, expiry, and revocation (`src/app/api/coach-shares`, `src/app/api/coach/[token]`)
- AI relay input filtering (health fields must never reach a model)
- receipt upload handling and Blob access scoping
- rate-limit bypass and stored XSS in rendered household content

Out of scope: retailer search pages, Open Food Facts / Open Prices
responses, and OAuth provider behaviour.

## Handling household data in reports

Use the demo sandbox (`/demo`) for reproduction. Do not send real
pantry, diary, health, or receipt contents. Redact names, stores, and
prices before attaching logs.
