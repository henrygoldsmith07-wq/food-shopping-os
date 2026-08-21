export const DATA_BOUNDARY =
  'Forq is local-first by default: your data starts in this browser and no account is required. Signing in opts your household into server sync. When you choose a server-backed AI action, Forq relays that prompt and the relevant context to OpenAI.';

export const PRIVACY_COPY = {
  cgm: 'CSV parsing happens in this browser. Imported readings stay local by default and join household sync if you sign in. They are sent to OpenAI only if you deliberately include them in a server-backed AI request.',
  reminders: 'Reminder schedules stay local by default and join household sync if you sign in. The server can queue reminder jobs, but Forq has no Web Push subscription for this device, so it cannot notify you while the app is closed. Reminders are not sent to OpenAI.',
  photos: 'Photos stay local by default. If you sign in, their thumbnails are included in your opted-in household sync. They are not sent to OpenAI by the AI relay.',
  recipeImport: 'The URL and pasted recipe are parsed in this browser; this import does not upload them or send them to OpenAI. If you save the recipe after opting into household sync, the saved recipe syncs with that household.',
  recipeShare: 'This share code is generated locally: making or copying it does not upload the recipe or send it to OpenAI. A saved recipe can still be part of household sync if you have opted in.',
};

export const PRIVACY_DISCLOSURE = [
  {
    id: 'device',
    title: 'Stored on this device',
    summary: 'Forq keeps its working copy in this browser’s local storage.',
    items: [
      'Profile and household details; shopping, pantry, recipes and meal plans; spending and receipts.',
      'Food diary, nutrition targets and allergies. When you enable the health vault, body measurements, sleep, cycle, exercise, lab and glucose entries plus progress-photo thumbnails move into an encrypted local record.',
      'Browser storage is not encrypted. Anyone who can use this browser profile may be able to read it.',
      'Optional product insights are kept as a short local queue until you enable them and sign in. They contain only coarse journey counts.',
      'When the age you gave is under 18, Forq stores your answer to its separate consent question, keeps product insights off, and does not offer to include health records in a coach link.',
    ],
  },
  {
    id: 'server',
    title: 'Stored on Forq’s servers after sign-in',
    summary: 'Signing in opts the selected household into sync through Forq’s backend.',
    items: [
      'Upstash Redis stores your sign-in identity, household membership and a complete synced copy of the household data listed above, including health data.',
      'Sync metadata includes an opaque device ID, time zone, version and timestamps. Invitations, coach-share scopes, field-level audit events, queued reminders and temporary security rate-limit counters are also stored.',
      'Short-lived live-update events are stored in Redis when the optional Ably provider is not configured, then expire automatically.',
      'Receipt files you explicitly upload are stored privately in Vercel Blob; Upstash Redis stores their file metadata.',
      'If you opt in to product insights, Forq stores daily counts for selected journey events in a separate household analytics record. It does not store food names, health values, recipe text or prices there.',
    ],
  },
  {
    id: 'transmitted',
    title: 'Transmitted when you choose a service',
    summary: 'Forq does not sell your data or send the whole household record to these services.',
    items: [
      'OpenAI receives your prompt and the relevant context only when you run a server-backed AI action.',
      'Google, Apple or Microsoft receive sign-in requests. Google or Microsoft receive meal-event details when you add them to a calendar, and return event times when you ask Forq to find busy evenings.',
      'Ably receives opaque household, user, device and sync-version identifiers for live update signals when configured. Otherwise, the same short-lived signal is held in your Upstash Redis household store.',
      'When you choose barcode enrichment, Forq sends that barcode to Open Food Facts for product and nutrition data and to Open Prices for GBP observations. Forq labels those results as external observations and does not save them unless you add the returned product to your household.',
      'Anyone holding an active coach link can read only the sections selected when that link was created. Health is a separate opt-in scope; the link is read-only, expiring and revocable.',
      'Optional product insights are sent only to Forqâ€™s own backend after sign-in. They are not sent to OpenAI, calendar providers or live-update services.',
    ],
  },
];
