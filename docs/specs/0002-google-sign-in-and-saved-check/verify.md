# Verify: real sign in and saved check · spec 0002 · updated 2026-10-08
_Run 2026-10-08 by /check verify: first run FAIL (AC-8), second run after the fix BLOCKED (nothing failing), third run after the /test and /debug work: see the end. Unticked steps were blocked or not run; see the notes at the end._
_Steps derived from spec 0002 acceptance criteria and its value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Milestones 1 to 3 are built. AC-13 (the report PDF) is milestone 4 and waits for scope row 6._

Setup: `pnpm dev` (port 4321) against the dev deployment (`TEST_SIGNIN_ENABLED=true`). Open `landing.html?test=1` for the fake sign in; `?test=2` and so on use other fake students. Real Google sign in needs a Google account added as a test user.

## UI / manual
- [x] Signed out, open `questions.html?q=5`, `done.html`, `who.html`, `report-student.html`, `challenge.html`, `leaderboard.html`, `meet.html` → each lands on `landing.html`; `terms.html` opens → AC-1
- [x] Signed in but the form not finished, open `questions.html?q=5` → sent to `landing.html` → AC-1
- [ ] Tap "Continue with Google", finish at Google → back on `landing.html?signin=1`, the card shows the form (name prefilled from Google), no flash of the signed out screen; before submitting, `students` has no row for this account → AC-2
- [x] Form: age 9 and 26 are refused, class empty is refused, "I agree" stays locked until the sheet is scrolled to the end, under 18 shows the guardian tick and blocks without it → AC-3
- [x] Submit the form → opens `meet.html`; `students`, `consents` and `checks` each have exactly one new row; the consent row has the guardian flag for an under 18 → AC-3
- [x] Sign in again on a second browser, and double submit the form from two tabs → still one student, one check; landing says "Continue as <name>" with no automatic redirect → AC-4
- [x] Resume targets: no answers → `meet.html`; some → the first unanswered question; all 18 not finished → question 18; finished → `done.html`; after the report opens → `report-student.html` (check on a second browser) → AC-4
- [x] Answer 1 to 3, close the tab, open on a second browser → same question, same option order, same answers marked → AC-5
- [x] Offline (browser dev tools) tap several answers, change one twice → "Offline" mark, then back online they all reach the server and the last choice per question wins; finishing while offline shows "Connect to finish" → AC-5, AC-7
- [x] Unsent local answer vs a newer server answer: answer q3 on device A while offline, answer q3 differently on device B, reconnect A → A's local choice wins for q3, other questions take the server value → AC-5
- [x] Finish with 17 answers is refused, with 18 works once; after that an answer change shows "could not be saved" and the server keeps the old one → AC-7
- [x] "Not you" with unsent answers shows the warning and a "Sign out anyway"; after signing out every `dhirise.*` key is gone except the music setting → AC-8
- [x] Sign in as student A, end the session another way (clear the cookie only), sign in as student B on the same browser → none of A's answers or name appear → AC-8
- [x] Put an old `dhirise.check.v1` with answers in localStorage, sign in as a new student → "We found answers saved on this device. Keep them?"; Yes keeps them once (check source is `imported`), No clears them; the question never returns → AC-11
- [x] Open the page inside Instagram or Facebook (or with a matching user agent) → "Open this page in Chrome or Safari" and a working Copy link; cancel at Google → plain kind message and the button again → AC-12
- [x] Beside the Google button the short notice and "Read the full notice" are shown, and the sheet opens read only → AC-15
- [x] Open a protected page with a cache while the network is off, and during a slow sign in → the page is not redirected; only a definite signed out leaves → AC-16

## Commands
- [x] `npx tsc -p convex --noEmit` and `npx tsc --noEmit -p tsconfig.json` → no errors → all
- [x] `npx convex dev --once` → pushes with the five tables and their indexes → AC-3, AC-4
- [x] `npx convex run students:me` with no session → `{ "state": "signedOut" }` → AC-9
- [x] Search `convex/` for exported functions with an argument named like a student id, email or `authUserId` → none (`createProfile` takes none, `me` takes none) → AC-9
- [x] A function call with `age: 9`, an unknown class, under 18 without the guardian tick, a wrong consent hash, `q: 0`, `q: 19`, an option id of another question → each refused and nothing written → AC-6
- [x] Seed an old abandoned sign in user and one with a student, run `npx convex run purge:purgeAbandoned` → the abandoned account (and its sessions and linked account) is gone, the one with a student stays, one with a session in the last 24 hours stays → AC-10
- [ ] With `TEST_SIGNIN_ENABLED` unset on the target deployment: `POST /api/auth/sign-in/email` and `/sign-up/email` → 400 with `EMAIL_PASSWORD_DISABLED` / `EMAIL_PASSWORD_SIGN_UP_DISABLED`. Run it against the production and staging alias too (not yet done) → AC-14
- [x] `grep` the built `dist/` for the Google client secret and `BETTER_AUTH_SECRET` → no match → AC-14
- [ ] Confirm `account.encryptOAuthTokens` is on: a Google account row in the dashboard holds an encrypted token, not a plain `ya29.` one → AC-2

## Value sourcing (one step per row of the spec table)
- [x] `me` state: sign out, sign in without a form, finish the form → `signedOut`, `needsProfile`, `ready` follow the session and the `students` row only → AC-2
- [x] Google name in the form: sign in with a long Google name (over 60 characters) → the field holds the first 60 characters, editable → AC-3
- [x] `createProfile` identity: send a request with a made up email or auth id in the body → ignored, the stored values come from the session (email lowercased) → AC-9
- [x] `createProfile` name, age, class: spaces in the name collapse, whole age only → AC-6
- [x] Server clock and seed: `acceptedAt` equals the server time (not a device time set wrong), `checks.seed` differs per student → AC-3
- [x] `ageAtConsent` equals the submitted age → AC-3
- [x] Consent text stored: the stored text for `v1` equals what the sheet shows, and a changed hash is refused with `consent_text_changed` → AC-6
- [ ] Referral code: `?ref=abc12345x` keeps nothing (invalid format), `?ref=RAJ7K2Q` is kept across the Google trip and stored once in `referralCodeEntered`, then cleared → AC-3
- [x] `saveAnswers.answeredAt`: set the device clock a day ahead, save an answer → stored time is at most the server's now → AC-5
- [x] `saveAnswers` check: two different students answer q1 → each lands on their own check only → AC-9
- [x] Resume question: delete a middle answer in the dashboard → the resume target is the lowest missing question → AC-4
- [x] Option shuffle: the order of options is the same on two devices for one student and differs between students → AC-4
- [x] `importLocal`: imports only well formed answers, only once → AC-11
- [x] Saved or Saving mark: reflects the local queue (Saving while answers wait, Saved when empty) → AC-5

## Acceptance-criteria coverage
- AC-1 … steps 1, 2 · AC-2 … steps 3, `account.encryptOAuthTokens` · AC-3 … steps 4, 5 · AC-4 … steps 6, 7 · AC-5 … steps 8, 9, 10, saved mark · AC-6 … validation command · AC-7 … steps 9, 11 · AC-8 … steps 12, 13 · AC-9 … `me` and id search commands · AC-10 … purge command · AC-11 … step 14 · AC-12 … step 15 · AC-13 … not built yet (milestone 4) · AC-14 … prod refusal and secret scan · AC-15 … step 16 · AC-16 … step 17

## /check verify run, 2026-10-08
Verdict: FAIL. Failing: AC-8 (sign out while offline).
- [x] (fixed by /debug and re-verified 2026-10-08, see below) "Not you" with unsent answers: the warning path was not exercised (nothing was unsent). Sign out while offline returned `ok` and wiped this device, but the server session stayed alive, and the next visit offered "Continue as <name>" → AC-8 FAIL
- Blocked, needs a real Google account: tapping Continue with Google, the Google name over 60 characters, the encrypted token check (`encryptOAuthTokens` is set in `convex/auth.ts`), the `?ref=` code kept across the Google trip.
- Blocked, needs your go ahead: the production and staging alias check of `TEST_SIGNIN_ENABLED` (AC-14). On dev with the flag off both email and password calls returned 400 (`EMAIL_PASSWORD_DISABLED`, `EMAIL_PASSWORD_SIGN_UP_DISABLED`).
- Not run: delete a middle answer in the dashboard and check the resume question; compare option order between two different students.
- AC-13 (report PDF) is milestone 4 and not built.
- Not confirmed: the daily cron schedule is in `convex/crons.ts`, but the CLI could not list scheduled jobs. Please look at the Convex dashboard, Schedules.

## Second run, after the /debug fixes (2026-10-08)
Verdict: BLOCKED. Nothing failing. What is left needs a real Google account, a production look, or later work.
- [x] AC-8 sign out: with 2 unsent answers `signOut(false)` returns `{ ok:false, unsent:2 }`; forced while offline returns `{ ok:false, offline:true }` and the device keeps its data and its queue; the session stays alive and the answers reach the server later; online it ends the session and clears every `dhirise.*` key. The page shows "1 answer has not been sent yet..." with a "Sign out anyway" button, and the offline message.
- [x] No "Leave site?" prompt with an answer in flight and a reload (0 prompts; it appeared before the fix).
- [x] `getCurrentUser` is gone from the deployed functions and from the code.
- [x] End to end with a new student after the client refactor: form → meet → question 1 saved → 17 answers → Finish button → done → who → report (report seen saved on the server) → challenge → leaderboard → landing "Continue as" resumes at the report.
- Nit: with one unsent answer the message says "they will be lost" (should read "it").
- Still blocked: real Google steps, the production and staging check of `TEST_SIGNIN_ENABLED` (AC-14; your answer did not say which deployment), the cron schedule in the dashboard, AC-13 (milestone 4).
- Still a decision for the spec: an unsent offline answer shows on screen but the server keeps a newer answer from another device, so it flips at the next load.

## Third run, after /test and the option id fix (2026-10-08)
Verdict: BLOCKED. Nothing failing. Milestones 1 to 3 are proven on dev; what is left cannot be exercised from here.
- Proven this run (evidence): both typechecks clean; 73 unit tests pass; all 30 browser tests pass (guard, form, resume on a second device, offline queue, finish, report, sign out, account switch, import, in app browser, slow and missing connection); the push to dev works and only the 8 expected functions are deployed (no `getCurrentUser`, no test files); no secret in the built pages and no test file published; email and password sign in and sign up return 400 on dev with the flag off; `q03o1`, `q003o1`, `q3o01`, `q3o1 ` and `q3o5` are refused on the live dev deployment and the exact `q3o1` still saves; a padded import key `q07` is refused.
- Production: `TEST_SIGNIN_ENABLED` is not set on the production deployment (read only, that one variable). Email and password sign in is therefore off there. Not run: a live request against production, and the staging alias (not known to me).
- Ticked from the unit suites: the long Google name cut to 60 (`students.test.ts`), the resume question being the lowest missing one (`store.test.js`), and the option order differing between students (`score-order.test.js`).
- Still blocked: tapping Continue with Google and the encrypted token row (you tested the Google sign in by hand and it worked; I cannot observe it), the `?ref=` code kept across the Google trip, the daily cron schedule (it is in `convex/crons.ts` and the push accepts it, but the command line cannot list scheduled jobs: please look at Schedules in the dashboard), AC-13 (milestone 4).
