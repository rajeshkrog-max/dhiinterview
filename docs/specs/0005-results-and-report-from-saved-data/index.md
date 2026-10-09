# 0005. Results and report from saved data

**Date**: 2026-10-09
**Status**: Accepted

## Summary

When a student finishes the check, the server works out their result once, from their saved answers, using the same scoring file the browser uses today. It saves that result with the scoring version that made it, and keeps the sensitive flags in a separate table. Every screen that shows a result (the done page teaser, the story, the report, the Founding Card) then reads the saved result, so it looks the same on every device and a later change to scoring never rewrites an old student's report. The saved report copy and the Download button are not part of this spec (scope row 22).

## Requirements

**User stories**:
- As a student, I want my report to show the same score, style and notes on my phone and on my laptop, so that I can trust it.
- As a student, I want my result to stay as it was when I finished, so that it does not change under me when the team improves the scoring.
- As the team, I want each result stored with the version of the scoring that made it, so that we always know which rules a number came from.
- As the team, I want the sensitive flags kept apart from the rest, so that a normal read can never hand one out by accident.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: Finishing a check (`checks.complete`) makes exactly one `results` row and one `resultFlags` row for it, in the same step as setting `completedAt`. Calling `complete` again, or from two devices at once, still leaves exactly one of each.
- **AC-2**: The result is worked out on the server from the check's saved answers and its `seed`, using the same `questions.js` and `score.js` files the browser loads (never a second copy that can drift). The server scores only when all 18 answers are valid, and fails otherwise. For a fixed set of test answers, the server's result equals the result `score.js` gives in Node, field for field.
- **AC-3**: The done page teaser, `who.html`, the report and the Founding Card read the saved result, and the challenge style label reads it from the device copy. None of them calls `DhiScore.score` any more. `DhiScore.order` (option order) stays in the browser, and `band` moves into `reportText.js`. Opening the report on a second device shows the same Dhi starting score, style and flags.
- **AC-4**: Every result stores `engineVersion`, a whole number held as `DhiScore.ENGINE_VERSION` in `score.js`. A locked test scores fixed answers and fails if the output changes while `ENGINE_VERSION` stays the same.
- **AC-5**: A saved result never changes. No function updates, replaces or deletes a `results` or `resultFlags` row, and changing the scoring code afterwards leaves every stored result as it was saved.
- **AC-6**: If the server cannot make the result at Finish, the finish fails whole. The check stays unfinished, all 18 answers stay saved, the student sees a kind "try again" message for `scoring_failed` (not the "Connect to finish" message), and tapping Finish again works once the cause is gone. Only the scoring call is treated as a scoring failure; database errors pass through. The failure is logged with the check id only, never content.
- **AC-7**: A finished check that has no result (finished before this shipped, or finished while the client timed out) gets one the first time a page asks, through `results.ensure`. A repeated `complete` that finds `completedAt` already set also makes the result if it is missing. Two asks at once make one. An unfinished check is refused with `not_completed`. The first page view of an older check therefore performs one write.
- **AC-8**: The sensitive flags live only in `resultFlags`. `results.mine` returns them only to the signed in owner of that check; no other function returns a flag. A student never receives another student's result or flags.
- **AC-9**: `results.mine` and `results.ensure` act only on the signed in student's own check. A signed out caller is refused.
- **AC-10**: After the first load the result is kept on the device as `{ v: 1, owner, result }` under `dhirise.result.v1`, written only after the server answered. It is read only when its owner equals the signed in account and the session shows the check finished, so the report opens without waiting and also when the network is off. It is wiped at sign out with the rest of the session data.
- **AC-11**: No email, phone, feedback text, score or flag is added to the Sheet copy rows or to any public response. The leaderboard and challenge functions read no result field except the style label for the signed in student's own card.
- **AC-12**: A `REPORT_VERSION` constant (a whole number, starting at 1) exists in `reportText.js` for scope row 22 to store with the report copy. It is not stored on the result.
- **AC-13**: The pages that show a result wait for it and draw only when it arrives (`DhiSession.result()` returns a promise). If it has not arrived after about 10 seconds, the page shows a kind "could not load, try again" state with a button, and never redirects to the landing page, because the sign in is fine. Pages receive the result as the old flat object (`style`, `areas`, `top`, `flags`, `answered`, `complete`), rebuilt by one adapter in `session.ts`, so the page code changes only where it gets that object.
- **AC-14**: When a page asks for the result: if the session shows the check unfinished, the student goes to `resumeTarget`; if finished, the device copy is used, else `results.mine`, else `results.ensure`.

## Decision

**Chosen option**: Option 1: The server makes and saves the result at Finish, using the one existing scoring file.

At Finish, `checks.complete` runs the existing `score.js` on the server, saves a `results` row (headline fields plus the full result as one block) and a `resultFlags` row, and every screen reads that saved result through a "my result" query cached on the device.

Read `convex/_generated/ai/guidelines.md` first (your CLAUDE.md rule) before any Convex code.

## Feature design

**Data model** (confirmed 2026-10-09; two new tables, nothing existing changes):

| Table | Fields | Rules |
|---|---|---|
| `results` | `checkId` id of `checks`; `studentId` id of `students`; `engineVersion` number; `scoredAt` number; `dhiStart` number 0 to 100; `styleKey` "v" or "p" or "k"; `confidence` "clear" or "leaning" or "blended"; `detail` one block (areas, state, style percents, `styleGap`, `top`, `bottom`, `lowest`, `indices`, `subject`, with the "said" lines). No flags in it. | One per check. Never edited. Indexes `by_checkId`, `by_studentId`. |
| `resultFlags` | `resultId` id of `results`; `studentId` id of `students`; booleans `keepsFeelingsInside`, `lowCareerClarity`, `heavyExpectations`, `selfDoubt`, `sleepStrain`, `lowMood`, `lowConsistency` | One per result. Never edited. Indexes `by_resultId`, `by_studentId`. |

Relationships: students 1 to 1 checks, checks 1 to 0..1 results, results 1 to 1 resultFlags. A finished check always has both rows.

**State transitions**: a check goes unfinished, then finished (`completedAt` set). The result is made in that same step. A check finished before this release is made whole by `results.ensure`.

**Interface surface** (Convex functions; no HTTP routes):

| Function | Kind | Inputs | Output | Auth | Errors |
|---|---|---|---|---|---|
| `checks.complete` (changed) | mutation | none | `{ completedAt }` as today, and now also saves the result and flags | signed in, owns the check | `answers_missing`, `scoring_failed` |
| `results.mine` | query | none | `null`, or `{ engineVersion, scoredAt, dhiStart, styleKey, confidence, detail, flags }` | signed in, own check | `not_signed_in`, `no_profile` |
| `results.ensure` | mutation | none | the same object as `mine`, made if missing | signed in, own check | `not_signed_in`, `no_profile`, `not_completed` |

Validators: `detail` is `v.any()` in the table and in `returns` (it is made by the server from fixed code, never from user input). `flags` is seven `v.boolean()`. `styleKey` and `confidence` reuse the literals from the schema. `mine` and `ensure` return `v.union(v.null(), v.object({ ... }))` (`ensure` never returns null).

**In the browser** (`src/lib/session.ts`): `DhiSession.result()` returns a promise of the flat result object. An adapter rebuilds the old shape (`style`, `state`, `areas`, `top`, `bottom`, `lowest`, `indices`, `dhiStart`, `subject`, `flags`, `answered`, `complete`, and the headline fields) from the saved headline, `detail` and `flags`. `DhiStore.result()` reads the device copy synchronously and returns null if there is none.

**Value sourcing** (where every value comes from):

| Action | Value produced or displayed | Source |
|---|---|---|
| `complete`, `ensure` | the answers scored | the check's `answers` rows (option ids), read in the same transaction |
| `complete`, `ensure` | the shuffle seed used for `lowConsistency` | `checks.seed` (made on the server at sign up) |
| `complete`, `ensure` | `engineVersion` | `DhiScore.ENGINE_VERSION`, a property on the `DhiScore` object (the browser files have no `export`) |
| `complete`, `ensure` | `answered`, `complete` flags of the old flat result | `answered` is the count scored (must be 18); `complete` is true; both added by the adapter, not stored |
| `results.mine` | the owner's flags | `resultFlags` row found by `by_resultId`; `lowConsistency` is a real boolean because the seed is always present on the server |
| `complete`, `ensure` | `scoredAt` | the server clock (`Date.now()`) at the moment of saving |
| `complete`, `ensure` | `dhiStart`, `styleKey`, `confidence`, `detail`, the seven flags | the output of `DhiScore.score(answers, { seed })` |
| `complete`, `ensure` | `studentId`, `checkId` | `requireStudent`, the signed in student's own check |
| `mine`, `ensure` | which result to return | the signed in student's check, found by `by_studentId` then `by_checkId` |
| the pages | which result to show offline | the device copy under `dhirise.result.v1`, valid only if its owner equals the signed in account |
| report (row 22 later) | `REPORT_VERSION` | the constant in `reportText.js`, bumped by hand when the report's words or layout change |

**Key invariants**:
- One result and one flags row per finished check, made in the same transaction as `completedAt`.
- Rows are written once and never patched or deleted by any function in this spec.
- The `detail` block never contains a flag; flags exist only in `resultFlags`.
- The server and the browser run the same scoring file, never two copies.
- `ENGINE_VERSION` is bumped by hand whenever the output of `score()` for any answers changes; the locked test enforces it.
- `makeResult` wraps only the `score()` call; a failed database write is not renamed. It refuses to save unless exactly 18 answers were scored.
- The device copy is written only after the server answered.

**Security model**: personal data of minors; India's data protection law on children's data applies, and the flags are sensitive (`AGENTS.md`: never public, never a label). Only the signed in owner reads their result and flags, and only through `mine` and `ensure`. Team access (scope rows 14 and 23) will be added as named team functions, and is out of scope here. The result never goes into the Sheet copy, analytics or the leaderboard.

**Configuration required**: none.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: finish a check, then open the report on a second browser; same score, style and flags, verifies **AC-1**, **AC-3**.
- Same answers, server against Node: the saved result equals `score.js` run in Node, verifies **AC-2**.
- Version lock: change a scoring weight without bumping `ENGINE_VERSION`; the locked test fails, verifies **AC-4**.
- Immutable: finish, change the scoring code, read again; the stored result is unchanged, verifies **AC-5**.
- Failure: force the scoring to throw at Finish; the check stays unfinished with all answers, the message shows, a second Finish works, verifies **AC-6**.
- Older check: a finished check with no result asks `ensure` twice at once; one result, verifies **AC-7**.
- Auth: signed out and another student's id are refused; a flag is never in any other response, verifies **AC-8**, **AC-9**, **AC-11**.
- Offline: after one load, open the report with the network off; it shows. Sign out wipes it; a copy that belongs to another account is ignored, verifies **AC-10**.
- Slow or failed load: the result cannot be reached for 10 seconds; the page shows the try again state, not the landing page, verifies **AC-13**, **AC-14**.
- Retry after a timeout: `complete` succeeded on the server but the client timed out; the retry returns the same time and a result exists, verifies **AC-7**.
- Sheet and responses: the lead and feedback row builders contain no result field, and no public function returns one, verifies **AC-11**.
- Signed out is refused by `mine` and `ensure`, verifies **AC-9**.

## Build plan

Order follows the project's Tracer Bullet approach: one thin real thread first (the server makes a result and one page reads it), then the other pages, then lock and clean up.

**Milestone 1. The thin thread: a saved result, read by the report**
1. Spike: add `ENGINE_VERSION = 1` as `DhiScore.ENGINE_VERSION` in `score.js`. In a Convex file, import `questions.js` then `score.js` for their side effects (they fall back to `globalThis`), read `globalThis.DhiScore`, add a type declaration, and score fixed answers. A `convex-test` test checks the server's result equals Node's `score.js` result. Decided fallback if the Convex bundler or runtime refuses the browser files: a script copies the three engine files into `convex/engine/` as ES modules, and a drift test fails if a copy differs from its original. satisfies **AC-2**, **AC-4**
2. Add the `results` and `resultFlags` tables and indexes to `convex/schema.ts`. satisfies **AC-1**, **AC-5**, **AC-8**
3. Add one shared helper `makeResult` (score, check 18 answers were scored, insert both rows once per check) and call it from `checks.complete`, including its early return when `completedAt` is already set and the row is missing. Wrap only the `score()` call, turn its failure into the stable `scoring_failed` error, and log the check id only. satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**
4. Add `results.mine` and `results.ensure` with `returns:` validators, the owner checks and the `not_completed` refusal. satisfies **AC-7**, **AC-8**, **AC-9**
5. Add `DhiSession.result()` and `DhiStore.result()` to the bridge (`src/lib/session.ts`, `store.js`): the decision order in AC-14, the adapter back to the flat object, the 10 second wait with the try again state, and the device copy under `dhirise.result.v1` (owner and finished checks, written only after the server answered). Make `report-student.js` draw from it (move `band` into `reportText.js`). Prove it on a second browser. satisfies **AC-3**, **AC-10**, **AC-13**, **AC-14**

**Milestone 2. Every other screen, and the Finish message**
6. Move `done.js`, `who.js`, `card.js` and the `styleOf` helper in `api.js` to the saved result (`styleOf` reads the device copy synchronously and returns null if none). Stop loading `score.js` on pages that no longer need it (keep `DhiScore.order` for `screen.js`). Keep the seed in `dhirise.session.v1`. satisfies **AC-3**, **AC-13**
7. Add `dhirise.result.v1` to the key list in `src/lib/local.ts` so sign out wipes it, and ignore a copy whose owner differs. satisfies **AC-10**
8. Show the kind "try again" message when Finish returns `scoring_failed`, as its own branch in the `screen.js` error handling. Let `done.js` cope with a missing session `completedAt` after a timed out Finish. satisfies **AC-6**, **AC-7**
9. Add `REPORT_VERSION = 1` to `reportText.js` (exposed as `DhiReportText.VERSION`). satisfies **AC-12**

**Milestone 3. Lock it and prove it**
10. Add `convex/score.lock.test.ts`: at least 3 answer sets (all first option, a mixed set, a set that triggers every flag), expected output stored in the repo, changed only together with an `ENGINE_VERSION` bump. satisfies **AC-4**
11. Tests in `convex-test`: concurrent `complete`, retry after a timed out `complete`, `ensure` on an older check and twice at once, `not_completed`, immutability, signed out refused, another student's data never returned, flags only in `mine`, the lead and feedback row builders carry no result field. satisfies **AC-1**, **AC-5**, **AC-7**, **AC-8**, **AC-9**, **AC-11**
12. Check on the dev deployment with a student who finished before this change: `ensure` makes the result and the report matches what they saw; also the slow load state and a copy from another account. satisfies **AC-7**, **AC-10**, **AC-13**, **AC-14**

## Migration plan

**Strategy**: strangler (build the new beside the old, switch pages one at a time, retire the old last).
**Phases**:
1. Deploy the server side (tables, `complete` saving results, `mine`, `ensure`). Pages still score in the browser, so nothing changes for students.
2. Switch the report, then the other pages, to the saved result. Students who finished earlier get theirs on first ask.
3. Remove the browser scoring calls and the unused script tags.
**Rollback**: phases 2 and 3 are page changes, so reverting that commit puts the browser scoring back, provided `mine` and `ensure` stay deployed. Phase 1 only adds rows and tables, which are harmless if left in place. Nothing is renamed or removed in the same release as the code that stops using it.
**Risks**: the spike may show the Convex bundler cannot load the browser files (the fallback covers it); a student finishing during phase 1 to 2 gets a result either way; the browser and saved result could disagree if `score.js` changed between the page load and the finish, which the stored version makes visible.

## Consequences

**Positive**:
- One source of truth: any device, and later the team views, show the same numbers.
- Old students keep the result they were given, whatever the scoring becomes.
- The version is stored, so a future deliberate rescore can be planned and compared.
- Flags sit behind a separate table, so a careless query cannot leak them.

**Negative / tradeoffs**:
- Finish now does more work, and a scoring bug at Finish blocks finishing (chosen on purpose, so no half state exists).
- Pages wait for the result on the very first load on a new device; later loads use the device copy.
- The saved block freezes the question and option text inside the "said" lines at scoring time.
- Changing scoring now needs a version bump and an updated locked test, one more step for whoever edits it.
- This freezes numbers, not words: the report's words still come from `reportText.js`, so the report as the student saw it is only frozen by the report copy in scope row 22.
- The result and the flags sit in plain text in the device copy until a confirmed sign out (sign out does not wipe while offline); on a shared device that is already true of the answers, and the flags can be worked out from them. Accepted.
- A student's first page view of an older check performs one write (`ensure`).
- If scoring ever fails on every Finish, no new student can finish, and there is no alert yet (scope row 9 would add one); the log line carries the check id only.

**Neutral**:
- Needs a Convex deploy before the pages that read it.
- Results are not part of the abandoned check purge (only finished checks have one); erasing a student (scope row 15) must delete both new tables.

## Follow-up

- [x] (done in spec 0006, which keeps `REPORT_VERSION` in `convex/reportVersion.ts` and updated spec 0002) Scope row 22 stores `REPORT_VERSION` with the report copy and PDF; update spec 0002 AC-13 and its milestone 4 note when row 22 is designed.
- [ ] `public/dhiinterviews/js/engine/AGENTS.md` still says scoring runs in the browser and that "the backend stores an engine version": `/sync` should refresh it once built, and add the rule "bump `ENGINE_VERSION` when scoring changes".
- [ ] Erase (scope row 15) must delete `results` and `resultFlags` for the student.
- [ ] Team access to results and flags (scope rows 14 and 23): decide which roles may read the flags.
- [ ] Row 9 (error monitoring) should alert on repeated `scoring_failed`.
- [ ] A deliberate rescore tool (a new result row, old kept) is not built; enroll it only if the team wants it.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
