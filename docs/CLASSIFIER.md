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

## The recipe-prepass quality gate

`draftFromClassifiedLines` assembles leniently — a title plus two ingredients
is a draft. `assessPrepassDraft` (in `recipe-extract.js`) decides whether that
draft may bypass the extraction model, and it is deliberately stricter than
the assembler: a classified recipe must not skip the model unless enough of
the source has been confidently understood. Any single failure declines the
draft and the import falls back to the model; declining is always safe,
accepting is what needs evidence. Defaults live in `DEFAULT_PREPASS_GATE`:

| Check | Reason code | Default |
|---|---|---|
| confident title required | `no-confident-title` | confidence ≥ 0.7 |
| sufficient confident ingredients | `too-few-ingredients` / `weak-ingredient-confidence` | ≥ 2 at confidence ≥ 0.7 (the second code fires when the count exists but the confidence does not) |
| instruction evidence when method-like content exists | `missing-instruction-evidence` | required |
| minimum share of lines carrying recipe content | `low-classified-rate` | ≥ 0.5 of lines labelled title/ingredient/quantity/instruction/metadata |
| maximum `other` proportion | `high-other-rate` | ≤ 0.4 |
| maximum fallback proportion | `high-fallback-rate` | ≤ 0.4 |
| suspicious quantity/ingredient pairings — quantity lines that never merged into an ingredient | `dangling-quantities` | decline when orphans reach half of ingredients-plus-orphans |

The assessment also reports measurements without ever carrying recipe text:
`ingredientCoverage`, `instructionCoverage`, per-factor rates, and
`incomplete` (accepted but thin — no steps, or fewer than three confident
ingredients). `classifyRecipeLines` returns `{ results, draft, assessment,
latencyMs }`; the route reads only the gated `draft`. Outcomes feed the
adapter telemetry as `prepassAccepted` / `prepassDeclined` /
`prepassDeclineReasons` (stable codes only).
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

## Taxonomy versioning and cache validation

`TAXONOMY_VERSIONS` in `classify-taxonomies.js` versions each label set
(`recipe-line.v1`, …). The adapter mixes a fingerprint of the exact label set
into its cache key alongside the taxonomy id and the normalised text, so a
label change invalidates cached answers without waiting for the TTL to
expire. The rule for taxonomy edits: bump the version when a label set
changes, and never redefine what an existing label means in place.

A short or ragged classifier response (fewer rows than inputs, or non-object
rows) is treated like any other malformed answer: the affected positions fall
back to `other`, and the mismatch is counted once as `rowCountMismatches`
rather than passing silently.

## Telemetry: general LLM calls avoided

`classifierTelemetry()` (and `GET /api/classify`) reports, among others:

- `llmCallsAvoided` — the headline measurement: how many general LLM calls did
  not happen because this layer answered instead.
- `avoidedBy` — the same number split by `cache`, `deterministic`,
  `classifier` and `routing` (requests answered outright by rules).
- `remoteCalls` / `batchedItems` — how few HTTP calls the batching bought.
- `cacheHits`, `deterministicHits`, `classifierHits` — where answers came from.
- `lowConfidenceDiscards`, `unknownLabelDiscards`, `rowCountMismatches`,
  `remoteFailures`, `fallbacks` — every honest degradation, counted.
- `prepassAccepted` / `prepassDeclined` / `prepassDeclineReasons` — recipe
  prepass outcomes and the gate codes behind the declines.
