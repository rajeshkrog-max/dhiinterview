# Verify: sheet copy · spec 0004 · updated 2026-10-08
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The steps marked (real Sheet) need the Google setup in `tools/LEAD-SHEET-SETUP.md` first._

## UI / manual
- [x] (real Sheet) Follow `tools/LEAD-SHEET-SETUP.md` for development: service account, a dev Sheet shared with it, `SHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY` set on the dev deployment → AC-12, AC-13
- [x] (real Sheet) Save a lead on dev. Within about a minute one row appears in the **Leads** tab with 14 columns: reference code, name, age, class, phone, email, WhatsApp choice, status, opt in time, lead time, same phone flag, consent version, guardian agreed, empty PDF link. Times read like `2026-10-08 22:31` → AC-1, Value sourcing (every Leads cell)
- [x] (real Sheet) Save a feedback for that student. One row appears in the **Feedback** tab with 11 columns, the phone is the one from the lead → AC-1, Value sourcing (every Feedback cell)
- [x] (real Sheet) Use a student named `=SUM(1)` and a note starting with `+1 hello`. Both cells show exactly as typed, not as a formula. A phone keeps its digits → AC-10
- [x] (real Sheet) Type a note in column Y of a row, sort the Leads tab by name, delete a different row, then change that student's WhatsApp status in the Convex dashboard and run `npx convex run sheetSync:dailyCheck '{"kind":"lead"}'`. The update lands on the right row and column Y is untouched → AC-7, AC-8
- [x] (real Sheet) Open **Sync status**: B1 last copy time, B2 rows waiting, B3 rows failed, B4 last error, and the reminder in A6. Break the key (change one character in the dashboard variable) and save a lead: B4 shows a short Google reason, B3 or B2 changes, and the student's save was not affected. Put the key back and run `sheetAdmin:retryFailed` → AC-3, AC-4, AC-11
- [x] (real Sheet) Delete the Feedback tab by hand, then run `npx convex run sheetAdmin:refill`. The tab comes back with its header and every feedback row → AC-5
- [x] (real Sheet) Put notes in column Y of three rows, sort the tab, delete one student's row by hand, add an old junk row at the bottom and a team line with column A left empty. Run `npx convex run sheetAdmin:refill`: every note is still beside the same student, the missing student is added at the end → AC-5, AC-7, AC-16
- [x] (real Sheet) Run `npx convex run sheetAdmin:refill '{"dryRun":true}'`: the Sheet does not change and the **Sync status** tab (Last prune) says how many rows it would remove → AC-5
- [x] (real Sheet) Run `npx convex run sheetAdmin:refill '{"prune":true}'`: the junk row is removed, the notes and the team line stay on their rows, and Last prune says what it did → AC-5, AC-16
- [ ] (real Sheet) Run `prune` while someone sorts the tab by hand, and with an empty database: nothing is deleted and the Last prune line says why (covered by tests, not run on the real Sheet) → AC-5
- [x] With no `SHEET_ID` set (a fresh deployment), save a lead: the app works, `npx convex run sheetAdmin:status` shows `configured` false, rows waiting and `lastError` "not set up" → AC-12
- [ ] Check the development and production deployments hold different `SHEET_ID` values, and that dev can never read the production one (each deployment has its own settings) → AC-13

## Commands
- [x] `pnpm vitest run` → all pass (`sheetFlush.test.ts`, `sheetAdmin.test.ts`, `no-secrets.test.js`) → AC-1 to AC-15
- [x] `npx convex run sheetAdmin:exportCsv '{"kind":"lead"}'` and with `"feedback"` → the header and one line per record with the same columns as the Sheet; a name starting with `=` shows with a leading quote → AC-6, AC-10
- [x] `npx convex run sheetAdmin:status` → counts of waiting and failed rows, last success, last error → AC-4
- [x] `npx convex run sheetAdmin:retryFailed` after forcing failures → failed rows go back to `pending` with 0 attempts → AC-4
- [x] In the dashboard table `sheetSync`, one row per (kind, refId) after saving and after a refill, never two → AC-2
- [x] Start two copy runs together (`npx convex run sheetFlush:run` twice) → no duplicate row; the second stops because the lease is held → AC-14
- [x] Queue a delete for a lead through a test mutation or the console: the row leaves the Leads tab, and queueing it again ends `sent` with no error → AC-9
- [x] `grep -r "lead-sheet.gs\|leadEndpoint" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs` → no match, and `tools/lead-sheet.gs` does not exist → AC-15
- [x] `grep -rn "SHEET_ID\|GOOGLE_SERVICE_ACCOUNT_KEY\|private_key" public src` → no match; the repo holds no key file → AC-13
- [x] `npx tsc -p . --noEmit` → no errors

## Acceptance-criteria coverage
- AC-1 … Leads and Feedback row steps · AC-2 … `sheetSync` one row and repeat copies · AC-3 … broken key step and retry tests · AC-4 … Sync status, status and retryFailed steps · AC-5 … refill steps · AC-6 … exportCsv step · AC-7 … sort and column Y step · AC-8 … daily check step · AC-9 … delete step · AC-10 … formula text step · AC-11 … error text and flags checks · AC-12 … no Sheet set up step · AC-13 … per deployment and grep steps · AC-14 … two runs step · AC-15 … grep step
