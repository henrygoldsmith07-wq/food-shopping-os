# Forq deep review — 9 November 2026, 17:13 scheduled run

## Continuity

Checkout: `C:\Users\rober\OpenBot\Agents\agent-799f1d34-27a1-4c98-9270-244fd9251bc6\food-shopping-os-improve`.
Branch: `fix/weekly-planner-skip-action`; HEAD and fetched `origin/main`: `19f11c1ce614a1d395ab64be45ebff1a2ef0deae`.
GitHub MCP confirms current main and the open PRs; no newer upstream fix. Its available status method exposes PR-head deployment status, not Actions job details. Read-only `gh api` confirms merge run 42593893093 still failed at Unit & integration tests (job 129081798713). Prior CI diagnosis is retained in `review-2026-11-09-deep-onboarding-ci.md`, not repeated as a new finding.

No overlapping Forq reviewer or repository worker was found. Read README, prior continuity and repository state before edits. No applicable AGENTS.md/CLAUDE.md found in this checkout or checked ancestor/user locations. Preserved every existing modified/untracked file; no other checkout changed.

## Confirmed defect and root-cause fix

**Medium impact / high confidence / low effort.** The first real pantry-first Home screen said “7 meals covered by leftovers” with an empty pantry and zero recorded cooks. This falsely promises that food is available, while still showing 27 ingredients to buy.

The cause was `autopilot-week.js` counting every row returned by `leftoverCoverageForPlan`. That function returns every planned meal, including meals needing all fresh portions (`mealplan.js:272-301`). This is intentional: the shopping derivation uses those fresh portions (`mealplan.js:374-376`), and `tests/single-source.test.js:45-49` explicitly expects two rows even with an empty pantry. Changing the allocator would break buying quantities.

The existing `pantryCheckForPlan` already uses `coveredByLeftovers`, which filters for zero fresh portions (`week-loop.js:78-87`; `mealplan.js:306-307`). It accounts for portion allocation in calendar order, safe expiry dates, and household size, without double-counting the same portions. The proposal now reuses this existing result (`autopilot-week.js:140,169`). The single-meal regeneration helper also refreshes the top-level count from its newly derived coverage (`:239,249`), so the old count cannot survive a changed plan. Removed the no-longer-needed allocator import; no second coverage implementation added.

## Flow and boundaries

- Plan proposal/strategy comparison: **implemented with this correction**. Both read the proposal's real leftover count; comparison uses `planning-strategies.js:116`. Preview changes do not write stock or make network requests.
- Cook → saved stock → next proposal: **implemented and inspected locally**. Cook mode invokes `completeRecipe` (`CookMode.jsx:139-147`), which logs the cook and saves leftover pantry rows (`diary-actions.js:95-156`). The store's common mutation wrapper re-derives the list (`store-api.js:66-76`). The next proposal reads those pantry rows. Persistence remains the existing IndexedDB path; no schema, sync payload, or permissions change.
- Partial and expired leftovers: **implemented in the shared calculation, source-inspected only**. An expired row is skipped at `mealplan.js:295`; partial portions remain fresh need. Runtime partial/expired/multiple-household checks were not performed.
- Complete autopilot editing/acceptance: **partial**. Separate existing source issues need the next focused pass: the people override changes labels/form without recalculating rows or persisting portions (`AutopilotWeek.jsx:61-66,104-105`); Swap computes a replacement but only advances the whole-week seed (`:73-81`); eating-out days are filtered only at acceptance (`:104`). Reproduce these before editing and trace acceptance through list/persistence. The coverage fix does not claim to repair them.

## Verification

- Before edit: production browser showed seven leftover-covered meals with an empty real example pantry.
- After edit, same origin/profile: seven dinners, 27 items, no leftover-coverage claim.
- Manual mobile cook flow: advanced through five recipe steps and logged an example meal, leaving one saved portion. Home then said exactly “1 meal covered by leftovers”; pantry showed that one portion. Used up this example row through the pantry UI: the claim disappeared and list preview returned to 27 items. Reload retained one cook, zero pantry rows, onboarded profile, and an interactive home screen. Read-only IndexedDB inspection confirmed these counts; no real household or account was used. No horizontal overflow in the exercised mobile screen.
- `npm.cmd run build`: exit 0; compiled, completed TypeScript, generated 19 static pages. Existing React 18 deprecation warning remains.
- `npx.cmd eslint src/lib/autopilot-week.js`: exit 0, no output.
- `npm.cmd run typecheck:strict`: exit 0.
- Exact source-size rule (`split(/\r?\n/).length`, including blanks/final newline): all 593 JS/JSX modules at or below 500 lines. An initial inline Node invocation failed from Windows quote handling; the successful count used .NET regex splitting via PowerShell.
- Final `git diff --check`: exit 0. Inspected new diff and preserved prior tracked diff. Lockfile unchanged. Full lint was not rerun this pass; prior result remains in the previous note.
- No tests added, edited or run in this pass. Prior assertion edits remain preserved. Remote CI is not established green. Cloud sync, live accounts, AI, budget/diet safety, full plan acceptance and waste outcomes were not runtime-verified.

## Reload anomaly and next action

The previous inactive first-run screen remains **unresolved, not reproduced**. Five controlled reloads before editing restored the example profile correctly, including a service-worker-controlled reload. A direct HTTP read after rebuilding returned matching CSP/script nonces and `private, no-cache, no-store` headers. The root route is already force-dynamic. Current Next.js CSP documentation matches that design; no speculative CSP/cache/storage change made. A navigation immediately after the build/restart timed out; a subsequent normal navigation succeeded. This is not evidence that the earlier anomaly is fixed.

Next run: reproduce the autopilot portion/Swap/acceptance inconsistencies noted above, then fix the proposal-to-accepted-list contract with the same shared calculations. Retain the earlier reload anomaly as an open follow-up if it recurs; capture its actual response and diagnostics before changing code.

Artifacts: regenerated `.next`; reused root `forq-review-server.log`, `forq-review-server-error.log`, and `forq-review-server.pid`. Localhost example data now contains one fictitious recorded cook, with the saved portion used up. No temporary scripts remain. Inspection server and this run's browser tab are closed during final cleanup. Changes remain local and uncommitted; no push, PR, deploy, secrets, user-data deletion, or teammate message.
