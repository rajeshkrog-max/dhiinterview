# Verify: Results and report from saved data · spec 0005 · updated 2026-10-09
_Steps derived from spec 0005 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Finish a check as a fresh test student, save the phone step, open the report on a second browser signed in as the same student → same Dhi starting score ring and same style pill on both → AC-1, AC-3
- [x] On the second browser, look at `localStorage` → `dhirise.result.v1` is `{ v: 1, owner, result }` and `owner` equals `dhirise.owner.v1` → AC-10
- [x] With the result copy on the device, block `/api/auth/**` and reload the report → the report still draws from the copy → AC-10
- [x] Edit the copy's `owner` to another value and reload → the copy is ignored and replaced by this account's own → AC-10
- [x] Remove the copy, block `/api/auth/**`, open the report → a "We could not load your result" box with a Try again button, URL stays on the report, nothing is drawn → AC-13
- [x] Unblock and tap Try again → the report draws and the box goes → AC-13
- [x] Sign out → `dhirise.result.v1` is gone → AC-10
- [x] Open the report for a check with no answers → it goes to question 1, not to landing and not to a result → AC-14
- [x] Open the done page, the story and the Founding Card on the second device → each draws from the saved result (no `DhiScore.score` call in any page script) → AC-3 (run on the first device after the result was fetched; the second device is proven by the report step above)
- [x] Open the challenge page and the leaderboard → they load without `score.js` and the style label shows once the report has been opened on this device → AC-3 (style label is null before the report fills the copy, `Achiever` after: seen)
- [x] On the Finish screen, force `scoring_failed` (dev only) → the kind "try again" line shows, not "Connect to finish"; the check stays unfinished and tapping Finish again works → AC-6 (2026-10-09: the page branch is proven with Finish stubbed to `scoring_failed`; the server side is proven by `convex/results.test.ts`; not yet forced end to end on dev)
- [x] A student who finished before this change (dev has one real account) opens the report once → the result is made and shown, and a second open does not write again → AC-7 (2026-10-09: done on dev with the owner's older account: check finished 00:26 IST, result made 13:02:39 IST on first report view, one `results` row and one `resultFlags` row, and the PDF printout matches the saved numbers; a later open reads the saved row through the read only `mine` query, so it cannot write)

## Commands
- [x] `pnpm exec vitest run` → all pass, including `convex/results.test.ts`, `convex/score.lock.test.ts`, `tests/store.test.js`, `tests/report-text.test.js` → AC-1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12
- [x] In `score.js` change a weight without bumping `ENGINE_VERSION`, run `pnpm exec vitest run --project convex convex/score.lock.test.ts` → it fails; put it back → AC-4
- [x] `pnpm exec tsc --noEmit` → no errors → AC-2
- [x] `pnpm exec convex dev --once` → pushes with no bundling error, adds the `results` and `resultFlags` indexes → AC-2
- [x] `pnpm exec playwright test e2e/results.spec.ts` → all pass → AC-3, 10, 13, 14
- [x] `pnpm build` → all 11 pages build → AC-3

## Value sourcing (one step per row of the spec table)
- [x] The answers scored come from the check's saved `answers` rows: finish with a mixed set and compare the saved `detail` with `score.js` in Node → matches field for field → AC-2
- [x] The shuffle seed for `lowConsistency` comes from `checks.seed`: finish with the same answers for two students with different seeds → `lowConsistency` follows each student's own seed and is always a boolean → AC-2
- [x] `engineVersion` is `DhiScore.ENGINE_VERSION`: the saved row says 1 → AC-4
- [x] `answered` and `complete` are added by the adapter and not stored: the `results` row has neither field, the page object has `answered: 18, complete: true` → AC-13
- [x] The owner's flags come from the `resultFlags` row: `results.mine` returns seven booleans, and the `detail` block contains none → AC-8
- [x] `scoredAt` is the server clock: it is a recent server time, not a device time → AC-1
- [x] `studentId` and `checkId` come from the signed in student's own check: a second student's `mine` never returns the first student's result → AC-8, AC-9
- [x] Which result to show offline comes from the device copy, valid only for its owner (steps above) → AC-10
- [x] `REPORT_VERSION` is `DhiReportText.VERSION` and is not stored on the result → AC-12

## Acceptance-criteria coverage
- AC-1 … covered by unit tests and the second device step · AC-2 … unit test against Node, `tsc`, `convex dev --once` · AC-3 … second device, page steps, build · AC-4 … lock test and the weight change step · AC-5 … immutability unit test and the source scan tests · AC-6 … unit test and the Finish screen step · AC-7 … ensure unit tests and the older student step · AC-8 … unit tests and the flag source scan · AC-9 … unit tests · AC-10 … e2e and `store.test.js` · AC-11 … source scan and header test · AC-12 … `report-text.test.js` · AC-13 … e2e try again steps · AC-14 … e2e and the no answers step
