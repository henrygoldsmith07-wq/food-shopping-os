# Forq deep review — 9 November 2026, 16:54–17:11 UTC

## Continuity

Active checkout: `C:\Users\rober\OpenBot\Agents\agent-799f1d34-27a1-4c98-9270-244fd9251bc6\food-shopping-os-improve`.
Branch: `fix/weekly-planner-skip-action`. Base: `19f11c1ce614a1d395ab64be45ebff1a2ef0deae` (fresh `origin/main`, verified with GitHub MCP and fetch).
Other worktrees retain their pre-existing edits; no commit, push, PR change, deployment, or secret change. No overlapping Forq worker was found.

Preserved the existing starter-date correction, backup file-read error recovery, and weekday-independent planning journey. The backup recovery now lives in `OnboardingRecovery.jsx`; its original error handling was retained.

## Findings and changes

1. **High impact / high confidence / low effort — pantry-first youth onboarding dead end.** On main, the final button required youth consent, but its switch was inside the `entryGoal !== 'pantry'` branch. Giving age 16 and choosing “Use food I already have” made completion impossible. Consent is now outside the goal-specific content: `src/components/Onboarding.jsx:414-435`; the final gate remains at line 451. Completion writes the consent record and entry goal at lines 115-127. `store-api.js:154-169` merges that profile into real state. The existing persistence path saves it to IndexedDB; no alternate save/sync path was introduced. Browser inspection confirmed the switch enabled completion at 375px width, no horizontal overflow, a real pantry-first home card, and restoration of age/consent/entry goal in a fresh tab. Analytics consent was not granted.

2. **High confidence / low effort — verified CI source-size failures.** Merge run [42593893093](https://github.com/henrygoldsmith07-wq/food-shopping-os/actions/runs/42593893093) failed its unit stage with exactly three failed / 3,823 passed checks. Its line-count failure reported HomeTab 518 and Onboarding 530. The actual rule is `split(/\r?\n/).length`, including blanks and final newline (`tests/invariants.test.js:36-41`). Extracted existing welcome UI to `HomeWelcomeCard.jsx` and demo/restore UI to `OnboardingRecovery.jsx`. No new screen. All 593 JS/JSX source modules now satisfy the rule: HomeTab 456, HomeWelcomeCard 77, Onboarding 490, OnboardingRecovery 55.

3. **High confidence / low effort — missing-dialog CI journey clicked a noninteractive duplicate.** Failure is the second click at old `tests/progress-flows.test.jsx:185`, after returning to Plan. Browser DOM showed three exact recipe-name matches: first a span in `CookTwiceCard.jsx:31-34`, then the draggable calendar slot, then a planning signal. Clicking the first span cannot invoke `WeekGrid`'s picker. Scoped the existing journey to the draggable slot (`tests/progress-flows.test.jsx:184-190`), matching the established planning suite approach. Browser confirmed that slot opens “Plan a meal”; clearing it leaves zero planned slots and £0.00. `plan-actions.js:115-127` removes the slot and empty date, while `store-api.js:66-76` routes mutations through automatic list derivation. XP remains derived from plan state (`progress.js:107`); the XP assertion was retained, not executed.

4. **High confidence / low effort — copy assertion read the old component address.** The product promise is rendered in `OnboardingShowcase.jsx:15` and the parent renders that component. The old assertion only read the parent source. Updated the existing assertion to check the rendered component reference and its actual copy; banned-claim coverage now also reads extracted onboarding components (`tests/copy-claims.test.js:21-37`). No invented copy or removed assertion.

5. **Verification blocker repaired.** The old `node_modules` junction targeted the sibling onboarding checkout, outside Turbopack's filesystem root. Preserved the verified junction as workspace-root `.forq-node-modules-junction-backup`, then used ordinary `npm.cmd ci --no-audit --no-fund` in the improvement checkout. It installed 520 packages in eight minutes; lockfile unchanged. npm reported an unapproved esbuild postinstall; no script approval or policy change was made, and Next's production build nevertheless completed normally.

## Verification

- Production `npm.cmd run build`: passed, 19 static pages, TypeScript phase completed. React 18 deprecation warning remains.
- Focused ESLint of all changed code/assertion files: passed with no output.
- Full `npm.cmd run lint`: exit 0, zero errors, three pre-existing exhaustive-deps warnings in unchanged `src/lib/store-demo.js` (36, 45, 90).
- Whole-source literal line measurement: passed using the repository's exact rule.
- `git diff --check`: passed. Final tracked diff and new component contents reviewed. Dependency lockfile unchanged.
- Embedded-browser inspection: local production server on `127.0.0.1:3116`, example profile only; mobile consent/completion and desktop plan-add/edit/clear inspected. No sign-in, paid AI, remote mutation, or real household data used.
- No new test cases added; no local unit/integration/E2E test suite run. Existing failing assertions were edited. Therefore remote CI is **not** established green.

## Capability boundaries and next action

- Pantry-first onboarding: **partial**. The consent trap is fixed and completion works, but one subsequent reload in the mobile tab stayed on unhydrated first-run HTML. A fresh desktop tab loaded the saved profile correctly. Read-only IndexedDB inspection confirmed `onboarded: true`, `entryGoal: pantry`, age 16, accepted consent, empty plan/pantry. The inactive tab had no React props and was service-worker-controlled. Cause is unresolved; do not call it data loss or a passed reload check. **Next run: reproduce controlled reload; compare navigation response/cache/CSP nonce and hydration behavior with a fresh tab before editing.** Do not wipe saved state to hide it.
- Meal-slot editing: **implemented**, observed add/edit/clear. Pantry-aware list recalculation is wired at the shared setter; this run did not revalidate all units, serving conversions or shopping/cooking transitions.
- Backup read recovery: **implemented in source**, runtime failure/retry not exercised.
- Cloud sync: **unverified in this local environment**; the UI explicitly says unavailable. Offline conflicts, live accounts, AI boundaries and cooking/waste learning were not exercised this run. No measured waste reduction is claimed.

Local artifacts: installed dependencies and `.next` build output; junction backup above; workspace-root `forq-review-server.log`, `forq-review-server-error.log`, and `forq-review-server.pid`. The temporary edit script was removed. Example browser data remains only on this localhost origin. The inspection server is stopped at the end of this run.
