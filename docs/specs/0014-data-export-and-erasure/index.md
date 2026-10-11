# 0014. Data export and erasure for students and parents

**Date**: 2026-10-11
**Status**: Proposed

## Summary

A signed in student can download all the data we hold about them, and can delete it, from a new "Your data" page. A parent can ask by email, and the team runs a checked command after matching two facts about the student. Deleting is immediate and complete in one step: the student's rows, files, sign in account and Sheet rows go, and only a short list of things stays (an erasure receipt, the team access log, the consent proof, and a hidden 30 day block on the same email). The new rules are written down for students on the privacy page.

## Requirements

**User stories**:
- As a student, I want to download everything DhiRise holds about me so that I can see it and keep a copy.
- As a student, I want to delete my data so that DhiRise no longer holds it, including when I am under 18.
- As a parent, I want to ask the team to export or erase my child's data so that I stay in control without needing my child's login.
- As the team, I want a checked, written procedure so that a request is handled the same way every time and nobody is erased by a stranger.

**Acceptance criteria**:
- **AC-1**: A signed in student can download one JSON file from the Your data page. It holds their profile (name, age, class, email), consents (kind, text version, age at consent, guardian tick, time), answers (question number and option id), result and the sensitive flags, phone and WhatsApp choice, feedback, and the status of the picture, report copy and report link. It has a format version and the date. It holds no internal ids, storage ids, secrets or Google address. The saved report PDF is a separate download link on the same page.
- **AC-2**: A student's Delete, after a clear two step confirm, removes in one all or nothing step: their `students`, `checks`, `answers`, `results`, `resultFlags`, `leads`, `feedback`, `reportFiles` (and the stored PDF), `avatars` (and the stored picture), `reportShares` and `sheetSync` rows, and (once spec 0015 is built) their `challengeEntries` and `referrals` rows as referrer and as friend with a recount of the referrer, and their Better Auth user, sessions, linked Google account and verification rows. If any part fails, or a row count passes its safety bound (every read uses `take(N + 1)` and a full bound stops the erase with `erase_failed`), nothing is deleted and the student sees a kind "try again" line. Errors from the auth component are not caught, so they roll the whole step back.
- **AC-3**: Erase also queues the deletion of the student's Leads and Feedback rows in the team's Google Sheet (including the report link in column N) through the existing Sheet delete queue, with its retries. A failed Sheet delete shows in the Sheet status tab. Once the Sheet confirms a delete, the daily sweep removes that finished queue row after 7 days, so no `sheetSync` row about the student lingers. When the Sheet is not set up, the delete ops stay pending and the receipt counts them as "queued".
- **AC-4**: After Delete: the student is signed out everywhere; their browser copy (`dhirise.*` keys) is wiped on that device; a private report link stops opening at once; their picture address answers 404 (an edge copy can last up to 50 minutes, as in spec 0011). In the browser the unsent answers queue is dropped, the server session is ended and its cookie cleared. Other tabs and other devices drop their local copy at the next sign in, which is accepted.
- **AC-5**: These stay, by your decision: the consent rows (proof they agreed, no name or email), the team access logs (`reportViews`: ids, a fingerprint and a team email; and `teamAudit` from spec 0022: an email, an action, a student id and a time), an erasure receipt, and a 30 day block on the same email. No other row about the student remains, apart from rate limiter counters that hold only a student id and expire on their own. The kept rows still hold the old student id, which is also the Sheet reference code and sits in column N team links, so they can be linked to old Sheet history or backups; this is accepted and listed for the lawyer. No separate store of totals is kept; the receipt count is the only total this row adds.
- **AC-6**: Each erase writes one receipt (`erasures`): the time, who asked (student or team), and the count removed per kind of data. It also holds a short `note` for team requests (who ran it and which request), and nothing else. It holds no name, email, phone, answer or student id. Receipts are deleted after 3 years by the daily job (the period needs the lawyer's word).
- **AC-7**: A student's own erase records a 30 day block on that email, to stop delete and re-join gaming (a team erase for a parent does not, so a stranger who passes the two facts cannot lock a child out). The email is trimmed, lowercased and kept only as a keyed hash (never in plain). While it holds, `students.me` returns the date the block ends in its "needs a profile" state, the landing page tells the student kindly, and `createProfile` returns `recently_erased` (a result, not a throw) and deletes the new sign in account in the same call. Expired blocks are deleted by the daily job. Changing `ERASURE_HASH_SECRET` ends all running blocks, which is accepted.
- **AC-8**: A parent asks by email to the privacy contact. The team runs `dataRights:adminExport` or `dataRights:adminErase` with the student's Google email and the phone number they gave. Both must match the same student (the phone is checked against that student's own lead, not by phone alone) or nothing happens, and the refusal is the same `no_match` whatever was wrong. A student who never reached the phone step cannot be matched; the owner decides those by hand. A dry run prints counts only. Every team command takes a `note` that goes into the receipt. A written procedure (including replying to the student's Google email for a yes) is saved in `tools/DATA-REQUESTS.md`. The reply to the student's Google email is a hard gate in the procedure, not optional. A production run needs `--prod` and the owner's yes. A team export is run so that the output goes to a file, never in an AI session, and the file is sent only to the student's Google address.
- **AC-9**: A team export leaves out the sensitive flags (the student's own in-app export keeps them).
- **AC-10**: A report copy job, a picture fetch or a Sheet copy that finishes after the erase does nothing and leaves no row or file behind. Most of this already holds (`reportCopy.attach` with no row deletes its file, `avatars.apply` returns false and `sync` deletes the file, the Sheet loader skips a missing student) and is proved by tests, not new code. A Sheet copy already in flight when the erase lands may add a row, and the queued delete op removes it on the next run. The daily `reportCopy.sweep` must leave avatar files alone (confirmed by a test).
- **AC-11**: The Your data page is a new page in the shared frame, linked from the privacy page and the footer, with a quiet link on the report. It needs sign in; a signed out visitor sees a sign in button and the privacy contact for email requests. It explains in plain kind words what is deleted and what stays, says Delete cannot be undone, works with a keyboard and a screen reader, and works for a student under 18 without a parent.
- **AC-12**: Limits: a student can export 5 times an hour. Erase has no count limit (it deletes the student, and a rejected try would not count anyway). Team commands are not limited.
- **AC-13**: No log line, error message or receipt holds personal data; logs hold counts only.
- **AC-14**: The privacy page has a section on export, erase, what stays and why, and the two limits we cannot control (Google Sheet version history and Convex backups). The words are approved by the owner before they ship.

## Decision

**Chosen option**: Option 1: One all or nothing erase function, one export function, a checked team command

Add one backend module, `convex/dataRights.ts`, with the student's `exportMine` and `eraseMine`, the team's internal `adminExport` (an internal query, nothing is written) and `adminErase`, and a daily `sweep` (registered in `crons.ts`, paged). Erase runs as a single transaction because a student holds fewer than 100 rows, so a half erased student can never exist. A new Your data page calls them through the browser bridge.

## Feature design

**Data model** (additive; no existing field changes):

| Table | Fields | Indexes |
|---|---|---|
| `erasures` | `at` (number), `by` (`"self"` or `"team"`), `note` (optional short text, team requests only), `counts` (object of kind to number, including `sheetRowsQueued`) | `by_at` |
| `erasedEmails` | `hash` (string, keyed hash of the lowercase email), `until` (number) | `by_hash`, `by_until` |

`students`, `consents`, `reportViews` are unchanged. Receipts and blocks hold no student id, name, email, phone or answers.

**Erase order inside the one transaction**: read the student, the auth user's own id and email, and collect their rows (bounded); queue the Sheet deletes (using each row's stored key); delete `answers`, `results`, `resultFlags`, `leads`, `feedback`, `reportFiles` (storage first), `avatars` (storage first), `reportShares`, `sheetSync` leftovers other than the new delete ops, `checks`, then `students`; delete the Better Auth session, account, verification (by the auth user's own email, not the lowercased copy) and user rows through the component (as `purge.ts` does, but looping `deleteMany` until it reports done); write the receipt and the block. Consents and `reportViews` are not touched.

**Export content**: built by a query from the same tables; keys are readable words, not ids. A team export is the same builder with `includeFlags: false`.

**API surface** (Convex functions; no new HTTP routes):

| Function | Kind | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `dataRights.exportMine` | mutation (the rate limiter writes) | none | the JSON object | signed in student | `not_signed_in`, `rate_limited` |
| `dataRights.eraseMine` | mutation | `confirm: true` | `{ ok: true }` | signed in student | `not_signed_in`, `erase_not_configured`, `erase_failed` |
| `dataRights.adminExport` | internal query (run by `npx convex run`) | `email`, `phone`, `note` | the JSON object without flags, or counts for `dryRun` | team (CLI) | `no_match` |
| `dataRights.adminErase` | internal mutation | `email`, `phone`, `note`, `dryRun` (opt) | counts only | team (CLI) | `no_match`, `erase_not_configured` |
| `dataRights.sweep` | internal mutation (daily cron) | none | none | cron | none |
| `students.me` | existing | none | adds `blockedUntil` when a block holds | signed in | none |
| `students.createProfile` | existing | existing | adds the `recently_erased` result (and deletes the new sign in account in the same call) | signed in | `recently_erased` |

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Find the student to erase or export | their `students` row | `requireStudent` for self; for team, the row whose `email` equals the given email (trimmed, lowercased) AND whose own lead (found by `by_checkId`) has the given phone |
| The status of the picture, report copy and report link in the export | picture and report copy state, link on or off | `avatars` row, `reportFiles` row, `shares.status` |
| The Sheet key for each delete | the reference code | the stored `sheetSync.key` (always the student's own id), or the student id when the student has a lead but no queue row |
| The `note` on a team receipt | who ran it and which request | typed by the team member in the command |
| The email hash | HMAC of the trimmed, lowercased email | the new setting `ERASURE_HASH_SECRET`, with Web Crypto (already used in mutations by `consentHash` and `shareCore`) |
| Block end time | now + 30 days | decided here (your choice) |
| Receipt retention | 3 years | decided here, lawyer to confirm |
| Counts per kind | number of rows deleted per table | counted during the erase |
| `blockedUntil` on `me` | the `until` of the matching hash | `erasedEmails` through `by_hash` |
| Export limit | 5 an hour | the existing rate limiter in `limits.ts` |

**Key invariants**
- Erase is all or nothing. There is no state where a student is half erased.
- Only `dataRights.ts` deletes `results`, `resultFlags`, `answers`, `students` and the other rows above. The source scan in `results.test.ts` is updated to allow exactly that file and no other.
- `consents`, `reportViews` and `teamAudit` are never deleted by any code except their own retention sweeps (spec 0023 holds the full map; the erase delete list is built from it).
- The plain email is never stored in `erasedEmails`, `erasures` or any log.
- `exportMine` is a deliberate exception to the rule that phone and flags are never returned to a browser; the exception is recorded in `convex/AGENTS.md` and the `leads` comment, and flags are never in a team export.
- A team command does nothing unless email and phone both match the same student, and refuses with the same `no_match` in every failing case.

**Security model**: a student acts only on their own data (found by `requireStudent`, no id as input). The team acts through the CLI with the deployment's admin access; production is a deliberate `--prod`. Flags are exported only to the owner. Compliance scope: India's Digital Personal Data Protection Act, 2023 (children's data, access and erasure), with three points for the lawyer: erasing without a parent for under 18s, keeping consent proof, and the 3 year receipt period.

**Configuration required**:
- `ERASURE_HASH_SECRET`: keys the email hash; a different value on dev and production; declared in `convex.config.ts`. Unset means erase refuses with `erase_not_configured`.

**Critical test scenarios** (each maps to an acceptance criterion)
- Erase a full student (check, answers, result, flags, lead, feedback, report copy and stored PDF, picture and file, share, Sheet queue rows, auth rows): every table is clear of them, the files are gone, the receipt counts match, verifies **AC-2, AC-5, AC-6**.
- A failure part way (for example the auth component refuses) leaves everything in place, verifies **AC-2**.
- The Sheet delete ops are queued with the stored keys (also for a lead with no queue row, and with the Sheet not configured), verifies **AC-3**.
- A full student at the safety bound stops with `erase_failed` and nothing is deleted, verifies **AC-2**.
- After erase: session gone, share code 404, picture 404, `reportViews`, `teamAudit` and `consents` still there, verifies **AC-4, AC-5**.
- Block holds for 30 days then the sweep clears it; `createProfile` refuses with `recently_erased` and `me` shows the date; no plain email in any table, verifies **AC-7**.
- Team command: email only, phone only, the wrong pair, two different students: all refuse; the right pair works; dry run changes nothing; the export has no flags, verifies **AC-8, AC-9**.
- A report copy attach, a picture sync and a Sheet flush that land after the erase leave no row or file, verifies **AC-10**.
- Export has every field in AC-1 and none of the forbidden ones (ids, storage ids, secrets, Google address), verifies **AC-1**.
- Browser test: the Your data page signed in, signed out, the two step confirm, the wipe of `dhirise.*` after erase, keyboard use, no sideways scroll on a phone, verifies **AC-4, AC-11**.
- The export limit blocks the sixth try in an hour, and no personal data is in logs or errors, verifies **AC-12, AC-13**.
- A student with a lead but no phone match, a phone shared by two students, and an unknown email all get the same `no_match`, verifies **AC-8**.
- After the erase the browser drops its queue and shows the signed out state without an error, verifies **AC-4**.

## Build plan

Build approach: Tracer Bullet (the project default): erase one student end to end first, then widen.

1. **M1 The thin thread**: the `erasures` and `erasedEmails` tables, `eraseMine` for the core rows (`students`, `checks`, `answers`, `results`, `resultFlags`) with the receipt, the browser bridge call, the Your data page with Delete and its two step confirm, the wipe of `dhirise.*`, and the updated source scan; proved on dev with a real signed in student, satisfies **AC-2, AC-4, AC-6, AC-11**.
2. **M2 Everything else erased**: leads, feedback, report copy and its file, picture and its file, share, Sheet delete queue, the Better Auth rows; late jobs do nothing; the 30 day block and `me.blockedUntil`, the landing message, the daily `sweep` for blocks and old receipts, `ERASURE_HASH_SECRET`, satisfies **AC-2, AC-3, AC-5, AC-7, AC-10**.
3. **M3 Export and the team commands**: `exportMine` and its download button, the rate limits, `adminExport` and `adminErase` with the two fact check and the dry run, `tools/DATA-REQUESTS.md`, satisfies **AC-1, AC-8, AC-9, AC-12**.
4. **M4 Words and links**: the privacy page section, the footer link, the quiet link on the report, the kind words on the Your data page (all draft, you approve), satisfies **AC-11, AC-14**.
5. **M5 Proof**: the full tests and browser specs, a live check on dev with a real Google account (erase, sign in again, see the block), and a production dry run for the team command, satisfies **AC-1 to AC-14**.

## Consequences

**Positive**:
- Students and parents have a real, working way to see and remove their data, which Google's consent screen and the data protection law both expect.
- Row 15's owed work from specs 0006, 0008, 0010 and 0011 is done in one place.
- One all or nothing function is easy to reason about and test.

**Negative / tradeoffs**:
- Delete cannot be undone, and a student gets only one check, so they cannot get their report back.
- Keeping the consent proof and the team log means some rows (ids only, ages and times) outlive the student; the lawyer should confirm.
- Hidden limits stay: Google Sheet version history and Convex backups can still hold old values for a time. The privacy page says so.
- The 30 day email block means a hashed email is kept for a month, and a student who deletes by mistake cannot rejoin for 30 days.
- The team runs requests by hand from a terminal, so a parent waits for a person.

**Neutral**:
- `convex/AGENTS.md` and `results.test.ts` change: results may now be deleted, but only by `dataRights.ts`.
- Row 12 (live leaderboard) must treat an erased student as gone; with their rows deleted that is automatic.

## Follow-up

- [ ] Lawyer check: under 18s erasing without a parent, keeping consent proof (it carries age and time and an id that also sits in Sheet history), the 30 day email block, and the 3 year receipt period.
- [ ] `convex/AGENTS.md`: record that only `dataRights.ts` may delete results and flags, that `exportMine` returns phone and flags to the owner, and the new setting.
- [ ] Owner approves the privacy page section and the Your data words (M4).
- [ ] Row 14 (team admin view) may add a button for these commands later.
- [ ] Rows 10 to 13 (live challenge) must check that an erased student's referrals and leaderboard row disappear, and that a 30 day block does not break a friend's referral count.
- [ ] Row 8 (analytics) must be able to erase or drop a student's events when it is designed.
- [ ] Update the pointers in specs 0006, 0008, 0010 and 0011 that say "row 15 must delete" to point here, and the scope row 15 sentence that said the team log is deleted by this row (it stays).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
