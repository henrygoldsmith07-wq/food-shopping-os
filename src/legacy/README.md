# Legacy quarantine — NOT part of the Forq food loop

This directory holds code moved out of the main app boundary so Forq stays a
food-shopping OS (Plan → Shop → Eat):

- `revise-domain/` — Revise/Daily-Revision SRS domain: exam outlook,
  flashcards, scheduling, knowledge/deck graphs, grade prediction,
  topic labels/status, skip-profile reflection. Pure domain, no food logic.
- `debate/` — Daily Debate demo: argument graph (`argGraph`), seeded
  `demoDebate`, `DemoDebate` component. Unrelated to meals/pantry/shopping.

Rules:

- Food-loop code MUST NOT import from `src/legacy/**`, except the single
  documented bridge `src/lib/review-actions.js` (existing deck support) and
  the legacy UI components themselves.
- New household, ledger, recovery, decision, autopilot and eval modules live
  under `src/lib/household/`, `src/lib/ledger.js`, `src/lib/recovery/`,
  `src/lib/decision/`, `src/lib/eval/` and must stay dependency-free of legacy.
- `/demo` serves the food-loop sandbox, never the debate demo.
- Enforced by `tests/arch-boundaries.test.js`. If you need Revise/Debate,
  build it as a separate app — do not wire it back into Plan/Shop/Eat.
