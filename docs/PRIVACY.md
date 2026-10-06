# Privacy notice (short, matches the code)

Forq is local-first by default. No account is required.

## Stays on this device

- Meal plans, shopping lists, pantry and leftovers, recipes, cooked
  meals, waste records, food diary, targets, budgets, receipts you type
  or paste, and app settings live in IndexedDB in this browser.
- The encrypted health vault (body, sleep, cycle, exercise, lab and
  glucose entries, progress-photo thumbnails) stays in this browser
  until you unlock it here.
- Product-insight counts stay in a local queue until you turn them on
  and sign in. They contain only coarse journey counts, never food
  names, health values, recipe text, or prices.

## Leaves only after you choose

- Signing in copies the selected household to Upstash Redis so it can
  sync (identity, membership, household copy, invitations, coach-share
  scopes, audit events, queued reminders, rate-limit counters).
- Receipt images you explicitly upload go to private Vercel Blob;
  Redis keeps their file metadata.
- Server-backed AI actions send your prompt plus meal names, pantry
  items, and list gaps to the free-tier provider (NVIDIA NIM or
  OpenRouter), or to OpenAI only when the free ladder cannot answer
  and a paid key is configured. Health fields are never sent.
- Barcode enrichment sends the barcode to Open Food Facts and Open
  Prices. Calendar actions send meal events to Google or Microsoft.
- Coach links, when enabled, are read-only, expiring, revocable links
  exposing only the scopes chosen at creation.

## Export and delete

- Export: Profile > Privacy & data > Export creates a JSON backup of
  the on-device copy. Restore from the same screen or first run.
- Delete on device: Profile > Privacy & data > Delete local data, or
  clear site data in the browser.
- Delete server copy: sign in, open Privacy & data > Delete server
  household (owner only). This removes the Redis household, member
  access, invitations, coach links, audit events, queued reminders,
  and uploaded receipts. See `docs/DELETION.md` for the full runbook.
