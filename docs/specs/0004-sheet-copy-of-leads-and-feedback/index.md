# 0004. Copy leads and feedback to the team's Google Sheet

**Date**: 2026-10-08
**Status**: In Progress

## Summary

Every lead and every feedback note saved in Convex (spec 0003) is copied to the team's Google Sheet a few seconds later, one row each, so the team can work from a familiar list. Convex stays the source of truth: a queue table remembers what still has to be copied, a scheduled job sends it in small batches through the Google Sheets API, retries when Google is down, and shows its health on a status tab inside the Sheet. A rebuild never moves the team's own notes away from their students. A student's save never waits for, or is lost because of, the Sheet. This is built in the same pass as spec 0003, one thread at a time.

## Requirements

**User stories**:
- As a team member, I want each new lead to appear in the Sheet without anyone pasting anything, so that I can contact students and add the right ones to the WhatsApp group.
- As a team member, I want to see at a glance whether the copy is working, so that a silent failure does not cost us leads.
- As the team, I want to rebuild the whole Sheet from the database at any time, so that a mistake or a lost Sheet is not a lost list.
- As the team, I want our own notes and columns in the Sheet to be left alone, so that the copy does not erase our work.
- As a student, I want my details removed from the Sheet when I ask for erasure, so that my data is not left in a second place.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: A saved lead appears as one row in the **Leads** tab within about a minute, and a saved feedback appears as one row in the **Feedback** tab, with every column holding the right value (see Value sourcing).
- **AC-2**: Copying the same record again (a retry, a refill, the daily check) never adds a second row. The row is found by its reference code and updated in place.
- **AC-3**: A student's save is never blocked or lost by the Sheet. The copy is queued in the same transaction as the save and sent later. A failed copy is retried with growing waits, up to 10 tries, and the student sees nothing.
- **AC-4**: A failing copy is visible. The **Sync status** tab shows the last successful copy time, how many rows are waiting, how many failed, and the last error. The Convex dashboard shows the failed rows. One command puts the failed rows back in the queue.
- **AC-5**: One command rebuilds the Sheet from the database. It re sends every lead and feedback, is safe to run at any time, and has a `prune` option that also removes rows that do not belong: a row whose reference code in column A (ignoring spaces around it) is not the code of any lead (on the Leads tab) or feedback (on the Feedback tab). Rows that do belong are never removed, moved or emptied, only updated in place. `prune` refuses when the database holds no record of that kind (unless `force` is passed), stops without deleting if the Sheet changed while it ran, and a `dryRun` option reports what it would remove without changing anything. The team sees what a prune did (or why it did not run) on the Sync status tab.
- **AC-6**: One command prints the leads or the feedback as a CSV file from Convex, so the team has a fallback when the Sheet is unavailable.
- **AC-7**: Anything outside the managed columns (our columns start at column Y) is never touched. Sorting, filtering or deleting rows in the Sheet does not break later updates, because rows are found by reference code each time, never by row number.
- **AC-8**: A change of WhatsApp status in Convex reaches the Sheet within a day, through a daily check that re sends rows whose content changed.
- **AC-9**: A delete request removes every row with that reference code from its tab (a second copy made by hand goes too, so an erased student's data is not left behind). A row that is already gone counts as done.
- **AC-10**: Nothing a student typed ever runs as a formula. Values are written as plain text, so a note that starts with `=`, `+`, `-` or `@` shows exactly as typed, and a phone number keeps its leading zeros.
- **AC-11**: The Sheet never receives sensitive flags or results (until scope row 6, and never the flags). The report PDF column stays empty until a team only link exists. Error messages and logs never contain a phone number, an email, a name or a note.
- **AC-12**: With no Sheet set up (no `SHEET_ID` or key), the app works as normal. Queued rows wait, and the status says "not set up".
- **AC-13**: Development and production use different Sheets, each chosen by that deployment's own settings. A development deployment can never write to the production Sheet.
- **AC-14**: Only one copy job runs at a time. Two jobs starting together never write the same row twice or add a duplicate row.
- **AC-15**: The old Apps Script receiver (`tools/lead-sheet.gs`) and its setup note are removed or replaced, so there is one way data reaches the Sheet.
- **AC-16**: A refill, with or without `prune`, never separates a team note from its student. A note in a column from Y stays on the same row as the student's reference code it was written beside, and a row with a blank column A (the team's own line) is never touched or removed. (Found by `/check verify`: the first version of `clear` emptied columns A to X and rewrote the rows from the top, so a note could end up beside another student.)

## Decision

**Chosen option**: Option 1: A queue table in Convex and a scheduled job that writes to the Sheet through the Google Sheets API.

Convex keeps one queue row per lead and per feedback. When 0003's save functions save a record they add or refresh its queue row in the same transaction and schedule a copy a few seconds later. A scheduled action (a Convex job that may call outside services) reads the Sheet's key column, updates rows it already knows and appends new ones, using a Google service account (a robot Google account for the app), and records the outcome. Spec 0001 chose this mechanism; this spec settles the detail.

**Implementation skills**: `convex` (`get-convex/agent-skills`, `.agents/skills/convex/`) · `convex-expert` (`get-convex/agent-skills`, `.agents/skills/convex-expert/`) · `convex-crons` (`get-convex/agent-skills`, `.agents/skills/convex-crons/`) · `convex-test` (`get-convex/agent-skills`, `.agents/skills/convex-test/`) · `gws-sheets` (`googleworkspace/cli`, `.agents/skills/gws-sheets/`) · `gws-sheets-read` (`googleworkspace/cli`, `.agents/skills/gws-sheets-read/`). Read `convex/_generated/ai/guidelines.md` before any Convex code. The two `gws` skills teach the `gws` command line tool for reading the Sheet while checking results; the server code does not use it.

## Feature design

**Data model sketch** (app side Convex tables; spec 0003's `leads`, `feedback`, `consents` and the student tables are only read):

| Table | Fields | Rules |
|---|---|---|
| `sheetSync` | `kind` (`"lead"` or `"feedback"`), `refId` (the lead or feedback id as text), `key` (the reference code that finds the row, taken when the row is queued), `op` (`"upsert"` or `"delete"`), `status` (`"pending"`, `"sending"`, `"sent"`, `"failed"`), `attempts` number, `nextAttemptAt` number, `lastError` optional short text, `sentAt` optional number, `rowHash` optional text (fingerprint of the last row sent) | One row per `(kind, refId)`: queuing again refreshes it, never adds a second. Index `by_kind_and_refId`, index `by_status_and_nextAttemptAt`. `key` is stored so a delete still works after the source row is gone. `lastError` holds a short Google reason only, never record content. |
| `sheetStatus` | one row: `lastRunAt`, `lastSuccessAt` optional, `lastError` optional, `leaseUntil` optional, `pruneNote` optional (one short line about the last prune, counts only, never a code or a name) | The one at a time lease and the numbers shown on the status tab. |

**State transitions** (a queue row): `pending` → `sending` (a job claimed it, with a lease) → `sent`. A failure sets it back to `pending` with a later `nextAttemptAt`, and after the 10th failed try to `failed`. `failed` returns to `pending` only by the retry command or a refill. A row left `sending` by a job that died counts as `pending` again once the job lease on `sheetStatus` has run out (only one job holds the lease, so an expired lease means no job is working on it).

**What the Sheet looks like.** One Sheet per deployment, with three tabs. Columns A to X are managed by the app (the app writes only there); our own columns start at Y.

- **Leads** (one row per student, key = the student reference code in column A): A reference code · B name · C age · D class · E phone · F Google email · G WhatsApp choice (`yes` or `no`) · H WhatsApp status (`new`, `added`, `opted_out`, or empty) · I WhatsApp opt in time · J lead time · K same phone flag (`yes` or empty) · L consent text version · M guardian agreed (`yes` or `no`) · N report PDF link (empty until a team only link exists). Columns O to X are held for results from scope row 6 (never the sensitive flags).
- **Feedback** (one row per student's check, key = the student reference code in column A): A reference code · B name · C age · D class · E phone · F Google email · G rating · H note · I share choice (`yes` or `no`) · J genuine (`yes` or `no`) · K feedback time.
- **Sync status**: B1 last copy time · B2 rows waiting · B3 rows failed · B4 last error · B5 last prune (the one line outcome, counts only) · A6 a one line reminder that columns A to X are rewritten by the app, our columns start at Y, and the three tab names must not be changed (if a tab is ever lost, run `sheetAdmin:refill`).

All times show in Asia/Kolkata as `yyyy-mm-dd hh:mm`. Values are written as plain text (the Sheets API `RAW` input mode), so nothing is read as a formula.

**How a copy runs**:
1. `leads.submit` and `feedback.submit` (spec 0003) call one helper, `enqueueSheet(ctx, kind, refId, key, "upsert")`. It adds or refreshes the `sheetSync` row as `pending` and schedules `sheetFlush.run` 5 seconds later, in the same transaction as the save.
2. `sheetFlush.run` (a Node action, because it uses the Google auth library) takes the lease on `sheetStatus` for 4 minutes (if another run holds it, it stops), creates any missing tab with its header row (and, when it had to create a tab, queues every row of that kind again so the new tab fills completely), claims up to 50 due rows, reads the key column of the tab, then: for each upsert it builds the row from the database, skips it if its fingerprint equals `rowHash`, updates the row if the key is already in the Sheet, or appends it; for each delete it finds every row with the key and deletes them, or counts it done if no row is left. It repeats up to 5 batches, rewrites the Sync status tab, records `sent` or the failure with the next wait, and releases the lease. If due rows are still waiting after 5 batches, it schedules itself again right away instead of waiting for the cron.
3. A cron runs every 5 minutes (catching due retries and any missed schedule). It first runs a cheap check (are any rows due?) and starts the Node job only when some are. A daily cron compares the current row fingerprint of every lead and feedback with `rowHash` and queues the ones that changed (this is how a WhatsApp status edited by hand in the dashboard reaches the Sheet).
4. Waits between tries grow as 1, 2, 4, 8 minutes and so on, capped at 6 hours. After the 10th failed try the row becomes `failed`.
5. **Prune** (`refill` with `prune`). In this order: (a) `sheetFlush.pruneAndRefill` takes the same lease (if another run holds it, it tries again in a minute, up to 5 times, and if it never gets it the status tab says "prune did not start: busy"); (b) for each record tab it reads every reference code in the database, page by page through `sheetAdmin.recordKeys` (500 at a time), and **refuses that tab** when the database holds none, unless `force` is passed (a wrong setup must never wipe a tab); (c) it reads the tab's key column and plans to delete every row whose column A, ignoring spaces around it, is not blank and is not one of those codes; (d) just before deleting it reads column A again and drops from the plan any row whose code is no longer the one it planned for, and if any row differs it stops without deleting and says "the Sheet changed while pruning, run it again" (this is the guard against a sort or a hand deletion in the middle); it also stops without deleting if more than 2 minutes have passed since it took the lease; (e) it deletes the planned rows, whole rows from the bottom up, at most 500 per request. With `dryRun` it stops after (c) and only reports the counts. It leaves rows with a blank column A, rows that belong, and the header alone, and never empties a cell. A code that appears twice is reported ("2 duplicate codes") and left alone. (f) It gives the lease back, writes the one line outcome to `sheetStatus.pruneNote` (counts only, for example "pruned 3 Leads rows and 0 Feedback rows, 1 duplicate code"), and, unless it was a dry run or it stopped, queues every record again (forgetting what was last sent) so each row is rewritten in place and any missing one is added at the end. A row is found by its code, never by its position, so the team's notes stay beside their students.

**Commands for the team** (Convex internal functions, run with `npx convex run`, never callable from a browser): `sheetAdmin:retryFailed`, `sheetAdmin:refill` (with `prune`, `dryRun` and `force` options), and `sheetAdmin:exportCsv` (leads or feedback). Row 15 queues deletes through `enqueueSheet(..., "delete")`.

**API surface** (nothing here is called by a browser; every function is internal):

| Function | Kind | Key inputs | Key outputs | Notes |
|---|---|---|---|---|
| `sheetSync.enqueue` (helper used inside 0003's mutations) | helper | `kind`, `refId`, `key`, `op` | none | Same transaction as the save |
| `sheetSync.claim` | internal mutation | `now`, `limit` | the due rows, marked `sending` with a lease | Returns nothing while another lease is live |
| `sheetSync.markResult` | internal mutation | row ids, `ok` or a short error | none | Sets `sent`, `pending` with the next wait, or `failed` |
| `sheetRows.build` | internal query | `kind`, `refIds` | the row values and their fingerprints | Reads lead, student, consent, feedback; no sensitive flags |
| `sheetFlush.run` | internal action (Node) | none | none | The one at a time copy job |
| `sheetAdmin.retryFailed`, `sheetAdmin.refill`, `sheetAdmin.exportCsv` | internal | optional `prune`, `kind` | counts, or the CSV text | Team commands |
| `sheetFlush.pruneAndRefill` | internal action (Node) | `tries`, optional `dryRun`, `force` | none | Started by `refill` with `prune`: takes the lease, deletes the rows that do not belong, gives the lease back, then queues every record again (not on a dry run). Its outcome goes to `sheetStatus.pruneNote` |
| `sheetAdmin.recordKeys` | internal query | `kind`, `cursor` | a page of at most 500 reference codes, and the next cursor | The codes of every lead or feedback, so the prune knows which rows belong |
| `sheetSync.notePrune` | internal mutation | `note` | none | Stores the one line outcome of a prune on `sheetStatus` |
| crons | scheduled | none | none | Every 5 minutes, and once a day |

**Value sourcing** (every value a copy writes, and where it comes from):

| Action | Value written | Source |
|---|---|---|
| Both tabs | reference code (column A, and the row key) | The student id (`students._id`), taken when the row is queued |
| Both tabs | name, age, class, Google email | The `students` row |
| Leads | phone, WhatsApp choice, WhatsApp status, opt in time, same phone flag | The `leads` row |
| Leads | lead time, feedback time | The row's creation time, shown in Asia/Kolkata (decided in spec 0001) |
| Leads | consent text version, guardian agreed | The `consents` row the lead points at (`consentId`) |
| Leads | report PDF link | Empty. Filled later from the PDF and a team only link (scope rows 6, 14) |
| Feedback | rating, note, share choice, genuine | The `feedback` row |
| Both tabs | `yes` or `no` for true or false | The boolean fields |
| Every copy | the Sheet to write to | `SHEET_ID` of this deployment |
| Every copy | who signs in to Google | `GOOGLE_SERVICE_ACCOUNT_KEY` of this deployment |
| Every copy | the next wait after a failure | `attempts` on the queue row (1, 2, 4, 8 minutes and so on, capped at 6 hours) |
| Sync status | last copy time, waiting, failed, last error | `sheetStatus` and counts of `sheetSync` rows by status (shown as "500+" past 500) |
| Daily check | whether a row changed | The new row fingerprint against `rowHash` |
| Prune | which rows to delete | A row on the Leads tab whose column A, ignoring spaces around it, is not blank and is not the `studentId` of any `leads` row, or on the Feedback tab not the `studentId` of any `feedback` row |
| Prune | whether to refuse | The count of records of that kind in the database (none: refuse, unless `force`); and the Sheet read again just before the delete against the plan |
| Prune | the line on the Sync status tab | The counts of rows removed, near matches kept and duplicate codes from this run, and the reason when it did not run (`busy`, `no records`, `the Sheet changed`, `too slow`) |
| Prune | which rows to keep | Every other row: rows that belong, rows with a blank column A, and the header |

**Key invariants**:
- One `sheetSync` row per `(kind, refId)`, found by `by_kind_and_refId` with no `.filter`.
- A save and its queue row exist together or not at all (same transaction).
- Only one copy job holds the lease at a time, and a lease always expires (4 minutes).
- Every run reads the tab's key column before writing, so a retry after a lost reply from Google finds the row already added and updates it. If a key appears twice in a tab, the first one is updated.
- The app writes only inside columns A to X of the three tabs. It never reads or changes our columns. The one exception is deleting a whole row, which removes the team's columns on that row too: for an erased student (AC-9) and for a row the `prune` finds does not belong (AC-5).
- A refill never moves a row's content to another row and never empties a managed cell: rows are found by reference code, so a team note always stays beside the same student (AC-16).
- A queue row is `sent` only after Google confirmed the write.
- No sensitive flag, no result (until row 6), and no PDF link ever leaves Convex in this feature.
- Server time is the only clock.

**Security model**:
- Compliance scope: students under 18 in India (Digital Personal Data Protection Act, 2023). Copying names, phones, emails and notes of minors to a spreadsheet makes Google a second place that holds them (a processor). The Sheet is shared only with named team members and the service account.
- The service account key is a secret held only as a Convex environment variable, never logged, never sent to a browser, never in the repo. Note a rotation date.
- No function takes or returns data to a browser; all are internal. The browser never talks to the Sheet.
- Errors are recorded as a short Google reason (status and reason code). The key, tokens and record content are never put in `lastError`, in logs, or on the status tab.
- Erasure (scope row 15) queues a delete for the student's rows and the daily check does not bring them back (a deleted source row has no fingerprint to send).
- Who opens the Sheet, and who is told when it changes hands, is controlled in Google's sharing settings. Audit of staff reads is scope row 14.

**Configuration required** (per deployment; dev and preview use the dev Sheet, production the production Sheet):
- `GOOGLE_SERVICE_ACCOUNT_KEY`: the service account key (a JSON text of about 2.4 KB; check the Convex size limit for one variable). Secret.
- `SHEET_ID`: the id of that deployment's Google Sheet.
- Declare both as optional in `convex/convex.config.ts` (`v.optional(v.string())`), so a deployment with no Sheet still deploys.
- One new package, `google-auth-library`, used only in the Node action.
- Prerequisites you do by hand: a Google Cloud project with the Google Sheets API turned on, a service account with a key, and each Sheet shared with the service account's email as an Editor. Replace `tools/LEAD-SHEET-SETUP.md` with these steps.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: a lead is saved, 5 seconds later one row is in the Leads tab with all 14 columns right; a feedback becomes a Feedback row, verifies **AC-1, AC-10, AC-11**.
- Copy the same lead three times (retry, refill, daily check): still one row, updated in place, verifies **AC-2**.
- Google returns an error, then recovers: the row is retried with growing waits and ends `sent`; after 10 failures it is `failed` and the status tab shows it; the retry command revives it; the student's save was never affected, verifies **AC-3, AC-4**.
- Refill from an empty Sheet, and over a Sheet that already holds the rows: the Sheet matches the database, no row added twice, verifies **AC-5**.
- Refill with `prune` over a Sheet that also holds old rows (a reference code that is not a record), a row with a blank column A, and notes in column Y: the old rows are gone, the blank code row and every record row stay on their own rows with their notes, and the records are updated in place, verifies **AC-5, AC-16**.
- Sort the tab, delete a row, put a note in column Y, then refill and refill with `prune`: every note is still beside the same student's reference code, verifies **AC-16, AC-7**.
- `prune` with a code typed with spaces around it: the row is kept. With an empty database: it refuses and the tab is unchanged, and `force` makes it go ahead. With `dryRun`: nothing changes and the status tab says what would be removed. If a row moves between the plan and the delete: nothing is deleted and the status tab says to run it again. A code that appears twice: both stay and the duplicate is reported, verifies **AC-5**.
- Queue a delete for a student whose code appears on two rows: both rows go, verifies **AC-9**.
- A prune that cannot get the lease: the status tab says it did not start, verifies **AC-5, AC-14**.
- `exportCsv` for leads and for feedback returns every row with the same columns, verifies **AC-6**.
- A team member sorts the Leads tab, deletes a row, and types in column Y; the next update lands on the right row and column Y is intact, verifies **AC-7**.
- Change a WhatsApp status in Convex: the daily check updates the row, verifies **AC-8**.
- Queue a delete: the row is removed; queue it again: done, no error, verifies **AC-9**.
- A note beginning with `=SUM(1)` and a phone beginning with `0` show as typed, verifies **AC-10**.
- No `SHEET_ID` set: saves still work, rows wait, status says not set up, verifies **AC-12**.
- Dev settings point at the dev Sheet and nothing in dev can read production's `SHEET_ID`, verifies **AC-13**.
- Two jobs start together: no duplicate row, verifies **AC-14**.
- Search the repo: the Apps Script receiver and its setup note are gone or replaced, verifies **AC-15**.

## Build plan

Approach: Tracer Bullet, **interleaved with spec 0003**. This spec's tasks come right after the 0003 tasks they depend on, so a saved lead reaches the Sheet end to end early, then the same for feedback, then both clean up together.

Order across both specs: 0003 tasks 1 to 5 (the lead thread) → this spec's tasks 1 to 6 (the lead reaches the Sheet) → 0003 tasks 6 to 8 (the feedback thread and the gate) → this spec's tasks 7 to 9 (feedback, delete, refill, status) → 0003 task 9 and this spec's tasks 10 to 11 (clean up).

**Milestone 1. A lead reaches the Sheet**
1. Add the `sheetSync` and `sheetStatus` tables and push to dev, satisfies **AC-2, AC-3, AC-14**.
2. Install `google-auth-library`, declare `GOOGLE_SERVICE_ACCOUNT_KEY` and `SHEET_ID`, and write the small Google module (token and plain `fetch` calls to the Sheets API, with short sanitized errors), satisfies **AC-11, AC-12, AC-13**.
3. Write `sheetRows.build` for leads (the 14 columns, the Asia/Kolkata times, `RAW` text, the fingerprint), satisfies **AC-1, AC-10, AC-11**.
4. Write the queue: `enqueueSheet`, `claim` with the lease, and `markResult` with the growing waits, satisfies **AC-2, AC-3, AC-14**.
5. Write `sheetFlush.run` (read the key column, update or append, skip unchanged, Sync status tab) and the 5 minute cron, satisfies **AC-1, AC-2, AC-4, AC-7, AC-12, AC-14**.
6. Call `enqueueSheet` from `leads.submit` and prove the thread: a lead saved on dev appears in the dev Sheet, satisfies **AC-1, AC-3**.

**Milestone 2. Feedback, rebuild and housekeeping**
7. Write `sheetRows.build` for feedback, call `enqueueSheet` from `feedback.submit`, and add the Feedback tab, satisfies **AC-1, AC-10, AC-11**.
8. Add the delete operation, `retryFailed`, `refill` (first built with a `clear` option, replaced by `prune` in task 12) and `exportCsv`, satisfies **AC-4, AC-5, AC-6, AC-9**.
9. Add the daily check (re queue rows whose fingerprint changed), satisfies **AC-8**.

**Milestone 3. Clean up**
10. Remove `tools/lead-sheet.gs` and rewrite `tools/LEAD-SHEET-SETUP.md` for the service account steps, satisfies **AC-15**.
11. Confirm production refuses to run against the dev Sheet (settings per deployment) and that no key or Sheet id is in the repo or the page code, satisfies **AC-13**.

**Milestone 4. Keep team notes beside their students** (added 2026-10-09 after `/check verify`)
12. Replace the `clear` option with `prune`: remove `clearManaged` from the Google client, the fake and the interface, add `sheetAdmin.recordKeys`, `sheetSync.notePrune` with the optional `sheetStatus.pruneNote` field and its line on the Sync status tab, `sheetFlush.pruneAndRefill` and its testable core (the order in step 5, `dryRun`, `force`, the re read guard and the time check), rename the option in `refill`, and update the setup note and the verify steps, satisfies **AC-5, AC-16, AC-7, AC-14**.
12a. Make the delete operation remove every row with the code (not only the first), satisfies **AC-9**.
13. Prove it on the real dev Sheet: notes in column Y, a sort, a deleted row, an old junk row and a blank code row, then `refill` and `refill` with `prune`, satisfies **AC-16**.

Tests for the whole plan (`convex-test` with the Google calls replaced by a fake, and a manual run against a real dev Sheet) belong to `/test`, mapped to the scenarios above.

## Consequences

**Positive**:
- The team gets the list it works from, without anyone pasting, and the database stays the one source of truth.
- A Sheet outage, a deleted tab or a revoked key never loses a lead or slows a student: the queue keeps everything and the status is visible.
- Rows are found by reference code, so the team can sort, filter and add columns freely.
- Refill and CSV mean the Sheet is never the only copy.
- Delete is built in from day one, so erasure (row 15) is one function call.

**Negative / tradeoffs**:
- The Sheet holds names, phones, emails, ages and free text of mostly under 18 students, all in one place that can be shared by link or downloaded. This is the engineer's choice ("every detail"). It needs strict sharing (named people only), and the legal check from specs 0002 and 0003 must cover Google as a processor.
- The team can read and copy this data once it is in the Sheet, and the app cannot recall a copy someone downloads. Erasure removes the row, not a file already saved elsewhere.
- Setup is real work: a Google Cloud project, a service account, a key and sharing, done once per environment. A mistake shows up as a failing status, not a crash.
- It is one way. An edit to a managed cell is overwritten the next time that row changes, or on a refill; the team keeps its own notes in columns from Y. (Two way sync stays deferred.)
- A new package (`google-auth-library`) and a Node action, which starts slower than a normal function. Fine for a job that runs every few minutes.
- The daily check re reads every lead and feedback. Fine at the expected size; revisit if the list passes tens of thousands.
- `prune` deletes any row whose column A holds a code that is not a record, including a row a person typed into column A by mistake, and it takes that row's team columns with it. A row deleted this way comes back only from Google's version history (File, Version history). It does not remove a second copy of a code that is a record (it reports it), and it does not remove rows with a blank column A. Run `refill` with `dryRun` first to see what would go.
- The delete operation (erasure) now removes every row with a code. A duplicate row made by hand is therefore removed with the student's data, which is what erasure needs.
- `prune` needs the database's list of reference codes, so it reads every lead and every feedback once. Fine at the expected size.
- Until the sheet copy is set up on an environment, rows wait in the queue. They are not lost, and the status tab (once the Sheet exists) says "not set up".

**Neutral**:
- The Sheet has result columns held in the block (O to X) for scope row 6, filled only when row 6 exists and never with the sensitive flags.
- The report PDF column is reserved. It is filled only with a team only link, which needs the admin sign in of scope row 14.
- Spec 0003's `leads.submit` and `feedback.submit` gain one line each (the queue call); that edit belongs to this build, not to a spec change.
- The Founding ID, challenge status and the old `flags` of the Apps Script receiver are not copied. Rows 10 and 11 add challenge columns later.

## Follow-up

- [ ] Before launch: restrict the Sheet to named people, decide who owns it (a personal account or a Google Workspace one, which also keeps access logs), and record Google as a place that stores minors' data in the privacy notice (scope row 18).
- [ ] Tell the team not to rename or delete the three tabs (the Sync status tab says so, and `tools/LEAD-SHEET-SETUP.md` repeats it).
- [ ] Create the Google Cloud project, turn on the Sheets API, make a service account and key, create a dev Sheet and a production Sheet, share each with the service account email, and set `SHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY` on each deployment. Note a key rotation date.
- [ ] Check the size limit of one Convex environment variable against the key before relying on it.
- [ ] Scope row 6 (results) adds its columns inside O to X, and must never add the sensitive flags.
- [ ] Scope rows 6 and 14 decide the team only link for the report PDF column.
- [ ] Scope row 15 (erasure) queues a delete for the student's Leads and Feedback rows through `enqueueSheet`.
- [ ] If a student ever has more than one check, the Feedback key must change from the student reference code to a check reference.
- [ ] The two `gws` Agent Skills you installed expect a `gws-shared` skill and the `gws` command line tool, which are not installed. Install `gws` and run `gws generate-skills` only if you want to read the Sheet from the command line.
- [ ] The Google Workspace skills (`gws-sheets`, `gws-sheets-read`) and `google-auth-library` conventions belong in `AGENTS.md` through `/sync`, in a nested file for the sheet copy code.
- [ ] Refresh `AGENTS.md`, `tools/AGENTS.md` and `BACKEND.md` section 9 for the new copy (`/sync`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
