# 0002. Google sign in, student record and saved check

**Date**: 2026-10-08
**Status**: In Progress

## Summary

A student taps "Continue with Google" on the landing page. After that, a short form asks for their name, age and class and records their consent, with an extra tick from a parent or guardian when they are under 18. Their record, their consent and each of their 18 answers are saved in Convex, so they can close the tab and carry on from any device. A finished check can also be saved as a PDF of the report. This spec covers only the first slice of the data model (students, consent, checks, answers, report files); results, leads, feedback and referrals attach to it later without changing it.

## Requirements

**User stories**:
- As a student, I want to sign in with the Google account I already have, so that I do not need a new password.
- As a student, I want my answers saved as I go, so that I can stop and carry on later, on any phone or laptop.
- As a student under 18, I want my parent or guardian to be part of saying yes, so that the app treats me safely.
- As the team, I want one clean record per student with the exact consent text they agreed to, so that we can show it if asked.
- As a student, I want a PDF of my report, so that I can keep it or share it.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: A visitor with no session who opens any page after the landing page (meet, the 18 questions, done, who, report, challenge, leaderboard) is sent to the landing page, and so is a signed in student who has not finished the form (`needsProfile`). `landing` and `terms` stay public.
- **AC-2**: Tapping "Continue with Google" signs the student in through Google and returns them to `landing.html?signin=1`, which reads the sign in state before it paints anything. Before they finish the form, no student record exists. Only the sign in data Better Auth keeps is stored: the account (Google email and name, with the Google tokens encrypted), and the session (with IP address and device). No offline access is requested from Google.
- **AC-3**: A signed in student with no record sees the form. Their Google name is filled in and can be edited. Age must be a whole number from 10 to 25, class must be one of Class 8 to Class 12 or College, and the consent sheet must be read to the end before "I agree" works. Under 18, a second tick ("A parent or guardian is with me and agrees") appears and is required. Submitting creates exactly one student, one consent record and one check, then opens `meet.html`.
- **AC-4**: Signing in again, on the same or another device, never creates a second student or a second check. The student lands where `resumeTarget` says (table in Feature design): no answers → `meet.html`; some answers → the first unanswered question; all 18 answered but not finished → question 18 with the finish step; finished → `done.html`; finished and report seen → `report-student.html`. "Report seen" is saved on the server so it follows the student between devices.
- **AC-5**: Tapping an option moves on at once. The answer is kept on the device and sent to the server in the background, with retries. After closing the tab, or on another device, the student resumes at the same question with the same answers. Going offline for a while loses nothing: the answers wait in a per question queue on the device (rules in Feature design) and finishing waits until the queue is empty.
- **AC-6**: The server refuses, and writes nothing for, invalid input: an age outside 10 to 25, an unknown class, under 18 without the guardian tick, a consent version or text fingerprint it does not recognise, a question number outside 1 to 18, or an option id that does not belong to that question.
- **AC-7**: Finishing requires all 18 answers confirmed on the server. It sets the finish time once. After that, answers cannot be changed.
- **AC-8**: "Not you" (sign out) flushes or warns about unsent answers, ends the session and clears this device's saved check data. If the session ends another way (expiry, another tab), the device remembers whose data it holds (`dhirise.owner.v1`) and wipes every `dhirise.*` cache except the music setting when the next sign in is a different account. A different Google account never sees the previous student's data.
- **AC-9**: Every server function acts only on the signed in student's own records. No function accepts a student id, and another student's data cannot be reached.
- **AC-10**: A sign in account that never completed the form is deleted automatically 7 days after it was created. An account with a student record is never deleted by this job.
- **AC-11**: If the browser holds answers from the old stub (`dhirise.check.v1`) when a student first signs in on that device, and `me` is `ready` with zero server answers and an unfinished check, they are asked once "We found answers saved on this device. Keep them?". Yes saves them (a partial set is fine, a full 18 goes to the finish step), marks the check `imported`, and only works once. Yes or No both clear the old key, and the question is never asked again on that device.
- **AC-12**: A browser that Google blocks (an in app browser such as Instagram or Facebook) shows "Open this page in Chrome or Safari" with a copy link button, not a dead end. A student who cancels at Google comes back to the landing page with a plain, kind message.
- **AC-13**: The first time the report of a finished check opens, a PDF of it is made in the browser and stored once on the server, and a Download button gives the same file. Only the owner can fetch it, through a route that checks the session. It carries a `reportVersion` (from scope row 6) and is replaced when the current report version is newer. Only files that really are PDFs under 5 MB are kept. (Built after scope row 6, see Build plan.)
- **AC-14**: In production, email and password sign in and sign up are refused with a defined 400 response. The test flag is read at run time and is set only on the dev and preview deployments, never on production or the staging alias.
- **AC-15**: Beside the Google button, a short notice says what is collected (name, age, class, and the Google email), why, and links the full notice. One version string covers the notice and the consent text. The server does not record that the notice was shown before the Google trip.
- **AC-16**: A page never sends a signed in student away because the sign in handshake is still loading. `me` answers `loading` until it knows, pages draw from the cached summary in the meantime, and only a definite `signedOut` redirects. With a cache and no network, the quiz keeps working.

## Decision

**Chosen option**: Option 1: One Convex record per student, created after Google sign in, with the browser keeping a fast local copy that syncs in the background.

Build it as Google first sign in on `landing.html`, then a form that creates the student, consent and check in one step. Convex holds the truth. The browser keeps a local copy so the quiz never waits on the network.

**Implementation skills**: `convex` (`get-convex/agent-skills`, `.agents/skills/convex/`) · `convex-expert` (`get-convex/agent-skills`, `.agents/skills/convex-expert/`) · `convex-authz` (`get-convex/agent-skills`, `.agents/skills/convex-authz/`) · `convex-test` (`get-convex/agent-skills`, `.agents/skills/convex-test/`) · `convex-crons` (`get-convex/agent-skills`, `.agents/skills/convex-crons/`) · `better-auth-best-practices` (`better-auth/skills`, `.agents/skills/better-auth-best-practices/`) · `better-auth-security-best-practices` (`better-auth/skills`, `.agents/skills/better-auth-security-best-practices/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`). Read `convex/_generated/ai/guidelines.md` before any Convex code.

## Feature design

**Data model sketch** (Convex tables, app side; the Better Auth user, session and account tables live inside its component and are not repeated here):

| Table | Fields | Rules |
|---|---|---|
| `students` | `authUserId` string (the Better Auth user id), `email` string (lowercase copy of the Google email, only accepted when Google says it is verified), `name` string (1 to 60 characters, trimmed, spaces collapsed; a longer Google name is cut to 60 for the prefill), `age` number (whole, 10 to 25, as given at sign up), `class` one of `"Class 8"` to `"Class 12"` or `"College"`, `referralCodeEntered` optional string (uppercase letters and digits, max 8, format checked only) | Index `by_authUserId`, index `by_email`. One row per `authUserId` and per `email`, enforced in the mutation. "Is a minor" is `age < 18`, worked out when read, not stored. |
| `consentTexts` | `version` string, `hash` string (SHA 256 of the exact text), `text` string | One row per version, added the first time a version is used, never edited. Index `by_version`. The hash is SHA 256 of the text with line endings turned into `\n`, computed the same way in the page and on the server. |
| `consents` | `studentId`, `kind` literal `"landing"` (the row 11 parent consent adds a second kind later), `textVersion` string, `ageAtConsent` number, `guardianPresent` boolean (true is required when `ageAtConsent < 18`), `acceptedAt` number (server time) | Only ever added to. Index `by_studentId`. |
| `checks` | `studentId`, `seed` string (made on the server, used for the per student option shuffle), `source` `"fresh"` or `"imported"`, `completedAt` optional number, `reportSeenAt` optional number | At most one per student (this spec). Start time is the row's `_creationTime`. Index `by_studentId`. |
| `answers` | `checkId`, `q` number 1 to 18, `optionId` string matching `q<q>o<1 to 4>` for the same `q`, `answeredAt` number | One row per `(checkId, q)`, changed in place until the check is complete. Index `by_checkId_and_q`. |
| `reportFiles` | `studentId`, `checkId`, `storageId` (a Convex file), `size` number, `reportVersion` string, `createdAt` number | One per check, replaced when remade, the old file deleted. Index `by_checkId`. Built after scope row 6. |

Relationships: `students` 1 to many `consents`; `students` 1 to 1 `checks` for now (the model allows many); `checks` 1 to up to 18 `answers`; `checks` 1 to 1 `reportFiles`. Later tables (results, leads, feedback, referrals, challenge entries) point at `students` and `checks` by id, so adding them changes nothing here.

**State transitions**:
- Sign in state of a visitor: `signedOut` → (Google) `needsProfile` → (form submitted) `ready`.
- Check: `open` → (18 answers confirmed, finish called) `completed`. `completed` is final.

**Where to resume** (one pure function, `resumeTarget(check)`, used by landing and by every guard):

| The check looks like | Go to |
|---|---|
| No answers | `meet.html` |
| 1 to 17 answers, not finished | The first question with no answer (`DhiStore.urlFor(n)`) |
| 18 answers, not finished | Question 18, with the finish step showing |
| Finished, `reportSeenAt` empty | `done.html` |
| Finished, `reportSeenAt` set | `report-student.html` |

Going back to change an earlier answer is allowed until the check is finished. `needsProfile` on any protected page goes to landing. `ready` on landing shows "Continue as <name>" and "Not you", with no automatic redirect. Deep links such as `questions.html?q=5` are not remembered after a sign in.

**Sign in return and errors**: the Google round trip always uses `callbackURL = landing.html?signin=1` and `errorCallbackURL = landing.html?signin=error`. Landing reads `me` first, then paints exactly one state, so the signed out screen never flashes. A blocked or cancelled return shows a kind message and the button again. The page the student returns to is checked against an allowlist (spec 0001).

**Referral code across the Google trip**: on landing load, `?ref=` is checked for format and kept in `localStorage` as `dhirise.ref.v1` (not in the round trip, and not in `sessionStorage`, which can be lost when Android opens Google in another browser). It is sent once in `createProfile` and then cleared. This follows spec 0001 (row 10).

**Offline queue rules** (device side):
- The queue is a map per question `{q → {optionId, answeredAt, synced}}`, not a log, stored under a key named for the owner (`dhirise.sync.v1.<authUserId>`).
- Unsent answers retry with backoff. `not_signed_in` pauses the queue and asks the student to sign in again. `check_completed` and `invalid_input` drop the item and tell the student.
- A batch is all or nothing, so a batch that fails is split and each answer retried alone.
- On reload, an unsent local answer for a question beats the server's value for that question. For every other question the server value wins.
- Finishing (`checks.complete`) waits until the queue is empty. Offline, the student sees "Connect to finish".
- Signing out first sends the queue or warns that some answers have not been sent.

**API surface** (Convex functions; every one except `me` needs a signed in student, and none takes a student id):

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `students.me` | query | none | `loading` (handshake not finished), `signedOut`, `needsProfile` with the Google name (cut to 60), or `ready` with `{student:{name, age, class}, check:{seed, startedAt, completedAt, reportSeenAt, answers}}`. `answers` is a map `{"q1":"q1o3", ...}`. No email is returned. | none required | none |
| `students.createProfile` | mutation | `name`, `age`, `class`, `guardianPresent`, `consent:{version, hash}`, optional `referralCode` | `{studentId}`. If the student already exists it returns that one, ignores the new form values and adds no second consent. | signed in | `not_signed_in`, `invalid_input`, `guardian_required`, `consent_text_changed`, `account_conflict` (same email under another account) |
| `checks.saveAnswers` | mutation | `answers:[{q, optionId, answeredAt}]` (1 to 18, no repeated `q`; `answeredAt` is the device time, cut down to the server's now) | `{saved:n}`. The same option sent again is a no op, and an older `answeredAt` never replaces a newer stored one. | signed in with a profile | `not_signed_in`, `no_profile`, `invalid_input`, `check_completed` |
| `checks.complete` | mutation | none | `{completedAt}`; same value if called again | signed in with a profile | `answers_missing` |
| `checks.markReportSeen` | mutation | none | `{reportSeenAt}`; same value if called again | signed in with a profile, check completed | `not_completed` |
| `checks.importLocal` | mutation | `answers` as a record `qN → optionId` | `{imported:n}` | signed in with a profile | `invalid_input`, `already_has_answers` |
| `files.generateReportUploadUrl` | mutation | none | one time upload address. Only one upload may be pending per student. | signed in, check completed | `not_completed`, `upload_pending` |
| `files.saveReport` | action | `storageId`, `reportVersion` | `{ok}`. It reads the file, checks it starts with `%PDF-` and is under 5 MB, rejects a `storageId` already used by another record, then attaches it in an internal mutation. | signed in, owns the check | `invalid_file` |
| `GET /api/files/report` | HTTP action, forwarded like `/api/auth/*` | none | the student's PDF, streamed. No storage address is ever given to the browser. | session checked inside the action | 401, 404 |
| `/api/auth/*` | HTTP, through the Pages Function | Better Auth requests | session cookie | public by nature | per Better Auth |
| `purgeAbandoned` | internal, daily cron | none | none. Sweeps abandoned sign in accounts and files nobody attached. | internal only | none |

**Value sourcing** (every value an action produces, computes or displays, and where it comes from):

| Action | Value produced or displayed | Source |
|---|---|---|
| `me` | Which state the visitor is in | Whether a session exists, and whether a `students` row exists for its `authUserId` |
| `me` | Google name shown in the form | The Better Auth user record for the signed in account |
| `createProfile` | `authUserId`, `email` | The Better Auth user record from the session (email lowercased), never from the request |
| `createProfile` | `name`, `age`, `class` | Request, validated |
| `createProfile` | `acceptedAt`, check `seed`, check start | Server clock and server random value |
| `createProfile` | `ageAtConsent` | The same `age` in the request |
| `createProfile` | Consent text stored | The server's own copy of that version, found by `version`; the request's `hash` must equal the server hash |
| `createProfile` | `referralCodeEntered` | Request, format only (whether the code is valid is scope row 10) |
| `saveAnswers` | `answeredAt` | Server clock |
| `saveAnswers` | Which check | The signed in student's one check |
| `me` and the pages | Next question to resume | The lowest `q` from 1 to 18 with no `answers` row |
| Option shuffle on the quiz pages | Order of the options for this student | `checks.seed`, same on every device (replaces the old profile plus start time seed) |
| Founding Card id | `DR-XXXX` | Unchanged from today (browser made); made unique and server side under scope row 10 |
| `importLocal` | Answers to import | The browser's old `dhirise.check.v1` answers, format validated, accepted once |
| `saveReport` | Size and type | The file's own stored metadata in Convex, not the request |
| The report PDF | Content | The report page rendered from the check's answers and seed |
| Saved or Saving mark | Whether answers are confirmed | The local sync queue state in the browser |

**Key invariants**:
- One `students` row per Google account (`authUserId`) and per lowercase email. Created inside one mutation, which Convex runs one at a time per record, so two devices at once cannot both create it.
- One `checks` row per student in this spec, created in the same mutation as the student.
- A consent row always has its text version, and the stored text for that version never changes.
- A consent for `ageAtConsent < 18` always has `guardianPresent` true.
- `answers` has at most one row per `(checkId, q)` and the option id always belongs to that `q`.
- A completed check never changes.
- Server time is the only clock. No time zone is needed in this slice.

**Security model**:
- Compliance scope: students under 18 in India, covered by the Digital Personal Data Protection Act, 2023 (consent, correction and erasure). The guardian tick is a statement, not proof. Whether that meets the Act's verifiable parental consent rule needs a legal check before launch (already tracked in spec 0001).
- Every function goes through one shared helper, `requireStudent(ctx)`, which reads the identity from the session on the server. No function takes a student id, an email or an `authUserId` as input. Reads and writes touch only rows that belong to that identity.
- `students`, `consents`, `answers` and `reportFiles` are personal data of minors. They are never returned to a public function. Sensitive result flags (scope row 6) will live apart from them.
- Convex has no database level constraints, so every invariant above is checked in code inside the mutation. Uniqueness holds only if the mutation looks the row up by its index (`by_authUserId`, `by_email`, `by_version`, `by_studentId`, `by_checkId_and_q`) with no `.filter`, so that two simultaneous inserts conflict and one retries and then finds the other.
- The consent record is the audit trail for consent. Reads by staff are audited under scope row 14.
- Report PDFs are private files. They are fetched only through a short lived address given to the owner, and deleted when the student is erased.
- Better Auth is set to encrypt the Google tokens it stores (`encryptOAuthTokens`) and requests no offline access.
- Minimal abuse limits now, the rest in scope row 5: one pending upload per student, a 5 MB file cap, and a count of new sign in accounts logged daily so a flood is visible.
- Signed out visitors can reach `/api/auth/*` and `students.me` only. No answer or profile data is reachable without a session.

**Configuration required** (already set on dev and production unless noted):
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: set.
- `TEST_SIGNIN_ENABLED`: dev only. Never set in production (AC-14).
- `PUBLIC_CONVEX_URL`: passed by the deploy script.
- Google consent screen: stays in Testing until the privacy page (scope row 18) is live. Add students' test accounts as test users until then.
- No new secrets. No new third party accounts.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: new Google account → form → profile created → answer 1 to 3 → close and reopen on a second browser → resumes at question 4 with the same option order, verifies **AC-2, AC-3, AC-4, AC-5**.
- Repeat sign in twice at once from two browsers → one student, one check, verifies **AC-4**.
- Under 18 without the guardian tick, age 9 or 26, unknown class, wrong consent hash, option id for another question → refused, nothing stored, verifies **AC-6**.
- Finish with 17 answers is refused; finish with 18 works once; a later answer change is refused, verifies **AC-7**.
- Signed out visitor opens `questions.html?q=5` and is sent to landing; `terms.html` opens, verifies **AC-1**.
- Student B signs in after student A on the same phone and sees none of A's data; "Not you" clears caches, verifies **AC-8, AC-9**.
- A sign in account with no profile older than 7 days is deleted; one with a profile is not, verifies **AC-10**.
- Old local answers: Yes imports once, a second attempt is refused, verifies **AC-11**.
- Email and password sign in and sign up return the defined 400 on production, verifies **AC-14**.
- Offline for 30 answers' worth of taps, then back online: all saved in order, verifies **AC-5**.
- Report PDF stored once, replaced when `reportVersion` is newer, a file that is not a PDF or is over 5 MB is refused, another student cannot fetch it or attach its file, verifies **AC-13**.
- A page opened during the sign in handshake does not redirect a signed in student, and with a cache and no network the quiz keeps working, verifies **AC-16**.
- Unsent local answer versus a newer server answer for the same question, and for a different question, verifies **AC-5**.
- Signed in as A with a cache, then session lost, then B signs in: all of A's caches are gone, verifies **AC-8**.
- Two simultaneous `createProfile` calls, two simultaneous first uses of a consent version, and two simultaneous saves of one question each end with one row, verifies **AC-4, AC-6**.
- No exported function takes a student id, an email or an auth user id, verifies **AC-9**.
- Old stub answers: Yes once then never asked again on that device; No clears them, verifies **AC-11**.

## Build plan

Approach: Tracer Bullet. First one thin real thread (sign in, create the student, save one answer, read it back on a second browser). Then thicken one strand at a time.

**Milestone 1. The thin thread**
1. [x] Add the tables `students`, `consentTexts`, `consents`, `checks`, `answers` to `convex/schema.ts` with their indexes, and push to dev and confirm they exist, satisfies **AC-3, AC-4, AC-9**.
2. [x] Write the `requireStudent(ctx)` helper, `students.me` (with `loading`, the full output shape and `resumeTarget`) and `students.createProfile` with full validation and the consent text version check (the consent text lives once in `convex/consentText.ts`; the landing page sends its version and a hash worked out the same way, with a test that the two hashes match), satisfies **AC-3, AC-4, AC-6, AC-9, AC-16**.
3. [x] Write `checks.saveAnswers`, `checks.complete` and `checks.markReportSeen`, satisfies **AC-4, AC-5, AC-6, AC-7**.
4. [x] Add the browser bridge `src/lib/session.ts`, which exposes `window.DhiSession` (state, sign in, sign out, create profile, save answers, finish) to the classic page scripts, plus the page guard that hides each protected page until the state is known and sends signed out visitors to landing, satisfies **AC-1, AC-2**.
5. [x] Wire a first question page to save and resume through `DhiStore` (keep its current functions, change what is inside: local copy first, then a queued background save), and prove the thread with two browsers, satisfies **AC-4, AC-5**.

**Milestone 2. The real landing page and the full check**
6. [x] Rebuild the landing states: signed out (Google button, the notice with its version, "Already started? Sign in with the same Google account" caption), needs profile (the form with name prefilled, guardian tick under 18, referral code kept from `?ref=` across the Google trip, the existing consent sheet), ready ("Continue as" and "Not you"), satisfies **AC-2, AC-3, AC-4, AC-15**.
7. [x] Move every question page and `meet`, `done`, `who`, `report-student`, `challenge`, `leaderboard` onto the guard and the new `DhiStore`; replace the old profile plus start time seed with `checks.seed`; resume rules from `me`, satisfies **AC-1, AC-4, AC-5, AC-7**.
8. [x] Offline queue: saved in `localStorage`, replays in order, last answer per question wins, shows Saving and Saved, satisfies **AC-5**.
9. [x] Sign in problems: block detection for in app browsers with the open in browser help and a copy link button, the Google cancel message, and the Testing mode "this account is not allowed yet" message, satisfies **AC-12**.

**Milestone 3. Safety and clean up**
10. [x] Sign out: "Not you" ends the session and clears every `dhirise.*` cache except the music setting; a different account then starts clean, satisfies **AC-8**.
11. [x] Import of old browser answers with the one question prompt and `checks.importLocal`, satisfies **AC-11**.
12. [x] Daily cron `purgeAbandoned`. In batches, for each Better Auth user older than 7 days it checks for a student row and, if none and the account had no session activity in the last 24 hours, deletes the user and its session, account (Google tokens) and verification rows inside one transaction through the component's adapter calls. It logs the counts and covers test accounts too. It also deletes uploaded files that no record uses, satisfies **AC-10**.
13. [ ] (no secret in the built pages: checked; email and password refused with 400 when the flag is off: checked on dev; still to check on the production deployment) Confirm production refuses email and password sign in and that no secret or student value is in the page code, satisfies **AC-14**.

**Milestone 4. Report PDF (after scope row 6 exists)**
14. Add the `reportFiles` table, the upload address mutation, the `saveReport` action (reads the file, checks the `%PDF-` start, the size and that the file is not already used) and the `GET /api/files/report` route with its forwarding function, plus the daily sweep of unattached files, satisfies **AC-13**.
15. Load `html2pdf.js` only on the report page (move it out of the legacy label in `AGENTS.md`), generate the PDF quietly after the report first shows, upload it with its `reportVersion` (and again when the version is newer), add the Download button, satisfies **AC-13**.

Tests for the whole plan (`convex-test` for functions, Playwright with the test sign in for the flows) belong to `/test`, mapped to the scenarios above.

## Consequences

**Positive**:
- One stable record per student, with the exact consent text and version kept, which is what you would show if asked.
- The quiz never waits for the network, and a student can switch devices without losing a thing.
- The model adds results, leads, feedback, referrals and challenge entries later without changing these tables.
- The seed on the server makes option order and scoring the same on every device.

**Negative / tradeoffs**:
- Google first means the Google email and name are held before the student has seen the consent text. The notice by the button and the 7 day purge reduce that, but do not remove it. The alternative, form first, was the safer order and you chose against it.
- The guardian tick is a statement, not proof. Under the Act's rules for children this may not be enough, so a legal check is needed before launch. Verifying a guardian by email or code would add an email service (spec 0001 left email out).
- Importing old browser answers means the server accepts answers it did not watch being given. They are format checked and marked `imported`, and the referral rules (scope row 10) must not count an imported check as a finished friend check.
- Convex has no database constraints, so a missed check in a mutation is a real bug. The scenario list above is what guards it.
- Report PDFs made on the student's phone use `html2pdf.js`, which takes a picture of the page: larger files (about 1 to 3 MB), text that cannot be selected, and a slow moment on low end phones. They are made quietly after the report shows, and a failure never blocks the report.
- A stored PDF per student means more personal data to delete on an erasure request. Scope row 15 must remove the file.
- Students who open the link inside Instagram or Facebook cannot use Google there. The help screen covers it, but some will drop off.
- Google's Testing mode caps sign ins at 100 users and needs each account added as a test user, until the privacy page (row 18) is live. This is a launch blocker, not only a note.
- Better Auth keeps the Google tokens and a session with IP address and device for each sign in, even before the form is finished. They are encrypted or purged, but they are stored.
- Spec 0001 said "no file storage now". This spec changes that for report PDFs only.

**Neutral**:
- `BACKEND.md` section 6 and 7 (Postgres and Supabase) describe a different stack. They need a refresh after this spec, which `/sync` can do.
- The hidden `auth-spike` page is replaced by the real landing flow and can then be removed.
- The Founding Card id (`DR-XXXX`) stays browser made until scope row 10 makes it unique on the server.
- Rate limits are not in this slice. Writes are limited by their shape (one student, one check, 18 answer rows, one PDF) and by needing a session. Per function limits are scope row 5.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Follow-up

- [x] Sign in spike proven: real Google sign in worked on `https://dhirise.com/dhiinterviews/auth-spike` and Convex recognised the student (2026-10-08).
- [ ] Legal check before launch: does a guardian tick meet the Digital Personal Data Protection Act's rule for children's data and verifiable parental consent? Record the outcome and, if needed, add guardian verification before the launch date.
- [ ] Decide the exact consent and notice wording for the Google first order, and the 7 day purge, with whoever owns the privacy page (scope row 18). The text becomes consent version 1.
- [x] Spec 0001 differed on file storage (report PDFs) and on "answers saved before sign in". Both lines there were updated to point here.
- [ ] Scope row 6 (results and report from saved data) must exist before milestone 4 (the PDF) can be built. Row 6's spec should take the scoring version and the PDF file together.
- [ ] Scope row 10 (referrals) must treat `checks.source = "imported"` as not counting toward a valid referral.
- [ ] Scope row 15 (export and erasure) must delete the student's rows, the sign in account and the report PDF file.
- [ ] Launch blocker: move Google's consent screen from Testing to Production (100 user cap, test users) before real students sign in. It needs the privacy page (scope row 18).
- [ ] Decide how to tell students about Google's "app not verified" and "test user" screens while in Testing mode.
- [ ] Check that Better Auth's `encryptOAuthTokens` and the HTTP action session check work as described on the installed version before building them.
- [ ] Refresh `AGENTS.md` for the new session and storage rules (`/sync`), and move `html2pdf.js` out of the "legacy only" line when milestone 4 lands.
- [ ] Remove the hidden `auth-spike` page when the landing flow replaces it.
