# Classifiers: cheap labels before expensive models

`classifier.dev` is zero-shot text classification over plain HTTP — no key for
the free tier, up to 1,000 inputs per request, calibrated confidence. In Forq it
sits **between** two things that already existed:

```
request ──► 1. deterministic rules   (src/server/classify-deterministic.js)
                │  answers what it can, with a confidence
                ▼
            2. classifier.dev        (src/server/classifier-adapter.js)
                │  one batched HTTP call for everything unresolved
                ▼
            3. the general LLM       (src/server/openrouter.js / OpenAI relay)
                   only where a real answer needs one
```

Everything in layers 1 and 2 is **advisory**: labels describe what a thing *is*,
are correctable by the user (move an item on the list once and it stays moved),
and every response row carries its `source` — `deterministic`, `classifier`,
`cache` or `fallback` — so a low-confidence `other` is never dressed up as
knowledge.

## Taxonomies

| Id | Labels |
|---|---|
| `product` | produce, meat-fish, dairy, bakery, frozen, pantry, drinks, household, personal-care, other |
| `recipe-meal` | breakfast, lunch, dinner, snack, dessert, side, drink, other |
| `recipe-line` | title, ingredient, quantity, instruction, metadata, noise, other |

## Where it is used

- **`/api/classify`** — batched labelling for product names, meal slots and
  recipe lines. `POST { taxonomy, items: [...] }` → labelled rows with
  `aisle` mapped onto the app's own aisle order for products. `GET` returns the
  running telemetry.
- **`/api/ai`** — every request is routed *before* any model is reserved.
  "What aisle do oats go in" is answered by the rules; a request that would
  have been a chat completion but was answered by the rules is counted in
  `llmCallsAvoided.avoidedBy.routing`.
- **`/api/recipes/import`** — link and pasted-text imports run a line
  prepass (`classifyRecipeLines`); when the labelled lines already add up to a
  recipe, the draft is laid out directly, `read: 'line-classified'`, and the
  extraction model is not called. A failed prepass is a model call, never a
  failed import.
- **`/api/kitchen/inventory`** — after the model lists the lines, the category
  hints are decided by rules + one batched classifier call, never by asking the
  model for categories. Hints are provenance; the browser's own parser remains
  the only thing that decides pantry confidence.

## Hard boundary: never a health authority

classifier.dev is **not** used as the authority for allergies, medical
nutrition, food safety or health interpretation — in any path:

- `classifyAiRequest` checks the medical guard **first**; any request touching
  allergies, intolerance, conditions, medication, pregnancy, food safety or
  "is this still safe to eat" is routed straight to the assistant with its
  constraint-aware system prompt (`guard: 'medical'`), and never to any
  classifier.
- No product, meal or line label is ever derived from, or used to infer,
  anything about a person's health. `personal-care` says what bottle it is,
  not who may use it.
- The `/api/classify` route enforces the same boundary in its schema: it takes
  things, not people.

## Configuration

All optional; with nothing set, layer 2 is skipped and labels fall back to the
deterministic rules and `other` — a cost, not an outage.

| Variable | Meaning |
|---|---|
| `CLASSIFIER_API_URL` | Override the endpoint. **Explicitly empty (`""`) disables the remote call.** |
| `CLASSIFIER_DISABLED` | `true` turns the adapter off entirely. |
| `CLASSIFIER_API_KEY` | Pro (`classifier_pro_…`) bearer key; the free tier needs none. |
| `CLASSIFIER_TIER` | `fast` (default) or `smart` (re-asks unsure items of a reasoning model). |
| `CLASSIFIER_CONFIDENCE_FLOOR` | Below this, a label is discarded and the item falls back. Default `0.6`. |
| `CLASSIFIER_TIMEOUT_MS` | Per-request deadline. Default `3000`. |

## Telemetry: general LLM calls avoided

`classifierTelemetry()` (and `GET /api/classify`) reports, among others:

- `llmCallsAvoided` — the headline measurement: how many general LLM calls did
  not happen because this layer answered instead.
- `avoidedBy` — the same number split by `cache`, `deterministic`,
  `classifier` and `routing` (requests answered outright by rules).
- `remoteCalls` / `batchedItems` — how few HTTP calls the batching bought.
- `cacheHits`, `deterministicHits`, `classifierHits` — where answers came from.
- `lowConfidenceDiscards`, `unknownLabelDiscards`, `remoteFailures`,
  `fallbacks` — every honest degradation, counted.
