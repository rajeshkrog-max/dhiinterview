# 0004. Rationale: copy leads and feedback to the team's Google Sheet

## Context

> ⚠️ Premise note: this feature copies the most personal data the app holds (names, phones, Google emails, ages, classes and free text of mostly under 18 students) into a shared spreadsheet. You asked for every detail on both tabs, and that is what the spec builds. A spreadsheet is the easiest place for this data to leak (shared by link, downloaded, forwarded), and once a copy is downloaded the app cannot recall it. The recommended middle path (phone and email only on the Leads tab) was offered and not taken. Two things make it acceptable: the Sheet is limited to named people, and the open legal check (specs 0002 and 0003) now has to cover Google as a second place that stores the data. A second concern: you also asked for a link to the report PDF. Spec 0002 keeps PDFs private to the student, and the PDF is not built yet, so the column is reserved and filled later with a team only link, never a public one.

**Where things are today.** The old design posted each lead from the browser to a Google Apps Script web address (`tools/lead-sheet.gs`) held in `js/funnel-config.js`. That address is empty in the repo, so nothing reaches any Sheet. Spec 0003 now saves leads and feedback in Convex and removes that browser post. Without a copy step, the team would have a database with no friendly list.

**What was already decided.** Spec 0001 chose the mechanism: a Convex scheduled action writes to the Sheet through the Google Sheets API with a service account, with Convex as the source of truth. It also listed what row 7 must have (a queue table, one scheduled job sending in batches, an upsert by student id, retries in code, a visible failure count, a CSV fallback) and that no sensitive flags go to the Sheet. Spec 0003 supplies the `leads`, `feedback` and consent rows.

**Forces.** A Sheet outage must never cost a student their save, so the copy must be asynchronous and queued. The team sorts, filters and writes notes in the Sheet, so row numbers cannot be trusted and our columns must be left alone. Convex functions that throw roll back their writes, and a mutation cannot call Google, so the copy needs an action with its own bookkeeping. Google's limits (about 300 reads per minute per project) are far above this volume. The student's results do not exist in Convex until scope row 6, so the old result columns cannot be filled yet. The first rows of each environment are tests, so dev and production need separate Sheets.

## Options considered

### Option 1: A queue table in Convex and a scheduled job writing through the Google Sheets API

Each saved lead or feedback adds a queue row in the same transaction. A job claims due rows, finds each row in the Sheet by its reference code, updates or appends it, and records the result, retrying with growing waits.

**Pros**:
- A student's save is independent of Google. An outage only delays the copy.
- Idempotent (safe to repeat) by design, so retries, refills and the daily check cannot duplicate rows.
- Everything is testable with a fake Google, and failures show up on a status tab.
- Matches spec 0001 exactly, so no earlier decision is reopened.

**Cons**:
- More to build than a script, and a Google Cloud project, service account and key to set up per environment.
- A new package and a Node action.

### Option 2: Keep the Apps Script web app, called from a Convex action with a shared secret

Convex saves, then posts each row to the existing script, which appends it.

**Pros**:
- No Google Cloud project or service account, and the script already exists.
- Quick to switch on.

**Cons**:
- The script lives in the Google editor, outside the repo and its tests, and is redeployed by hand.
- A public address guarded only by a shared secret, with tight run time and daily quotas.
- Upserts, retries and visible status all have to be written inside the script, with weak error reporting back to Convex.
- Spec 0001 already chose the API route.

### Option 3: No Sheet, only an admin view and CSV exports

Skip the copy. The team works from the admin view (scope row 14) and downloads CSV when it needs a list.

**Pros**:
- No second place holding minors' data, and nothing to keep in step.
- Least build now.

**Cons**:
- Row 14 is later and undesigned, so the team would have no working list for the early access group.
- Does not meet the row's done when (rows appearing in a Sheet), and the team asked for the Sheet.

## Rationale

Option 1 follows from the forces. The asynchronous queue is what keeps a Sheet problem away from a student, and putting the queue row in the same transaction as the save means a copy is never forgotten and never invented. Finding rows by reference code, not row number, is what lets the team sort and add columns safely. A single lease makes the job run one at a time, which is simpler and safer than coordinating overlapping runs against one append. Writing values as plain text removes the formula risk the old script guarded against with a prefix trick.

Option 2 looks cheaper but moves the hard parts (idempotency, retries, status) into a script nobody can test, and spec 0001 had already weighed it. Option 3 is the privacy purist's choice and stays a good fallback (the CSV command and the later admin view keep it alive), but it does not give the team the list it asked for.

The status tab inside the Sheet is the cheap answer to "visible": the team sees a failing copy without opening Convex, and the failed rows stay in the dashboard for whoever fixes it. The daily check exists because the WhatsApp status is edited by hand in the Convex dashboard, which triggers no function, so only a comparison can notice the change.

## Decisions that were asked and how they were answered

| Question | Choice | Recommended? |
|---|---|---|
| How the two specs are built together | One interleaved thread, same pass | Yes |
| What the Sheet carries now (results are not saved yet) | Contact and choices only, results added when row 6 lands | Yes |
| Sheet layout | Leads and Feedback tabs plus a Sync status tab | Yes |
| Google library | google-auth-library for sign in, plain fetch for the Sheets calls | Yes |
| Extra Leads columns | Age, WhatsApp status (daily), Google email, reference code, and all details including the report PDF link | Beyond the options (everything) |
| Feedback tab content | Everything (name, phone and the rest) | No (recommended: reference code and class only) |
| Build the delete operation now | Yes | Yes |
| Agent Skills for Google Sheets | Install both Google Workspace skills | No (recommended: skip) |
| Report PDF link | Reserve the column, fill it later with a team only link | Yes |
| The full column list | Yes, that list on both tabs | Yes (it is what was asked) |
| Results and sensitive flags later | Style and scores yes, sensitive flags never | Yes |
| References | None (defaulted, matching spec 0003) | n/a |

## Amendment 2026-10-09: keeping team notes beside their students

**What happened.** `/check verify` ran `refill` with the first `clear` option on the real dev Sheet. It emptied columns A to X, left the team's column Y alone, then wrote the rows again from the top. The team's note "called, call back Monday" had been written beside one student and ended up beside another. Spec AC-7 (never touch our columns) was met to the letter, but the point of it (a note stays with its student) was lost.

**Options considered for the fix.**

- **Option A: leave `clear` as built and warn the team.** Cheapest, but a trap: a rebuild is exactly what someone runs when something looks wrong, which is when the notes matter most.
- **Option B: replace `clear` with `prune` (chosen).** Never empty a cell. Delete only rows whose reference code is not a record, update every other row in place by its code, add what is missing. Notes cannot move because no row's content moves. It also does the job `clear` was for (taking out stale and junk rows) and handles rows left by erased students. Costs one read of the database's reference codes.
- **Option C: keep `clear`, but first read the team's column Y by code and write it back after.** Rejected: the app would have to read the team's columns, which the spec says it never does, and a crash between the clear and the write back would lose the notes for good.

**Why B.** It keeps the rule "rows are found by reference code, never by position" as the one rule for every operation, so there is nothing new to reason about. The option name changes from `clear` to `prune` because nothing is cleared any more. Nobody had used `clear` outside this verification, so there is no old name to keep.

**Cross check (same model, read only) and what came of it.** It found no flaw in the idea, and ten gaps in the detail, the serious ones being that a prune deletes by row number from a key list read earlier (so a sort in between could delete a row that belongs), that nothing stopped a prune from wiping a tab when the database held no records, that the lease could run out mid prune, and that the delete operation removed only the first of two rows with a code (so an erased student's data could stay in a copy). The engineer chose to apply the recommended fixes: a second read of column A just before the delete with an abort on any difference, a 2 minute time check, refuse on zero records unless `force`, a `dryRun`, a trim of spaces when matching, pages and delete requests of 500, a one line outcome on the Sync status tab, and a delete operation that removes every row with the code. Not taken: a rule that refuses to delete more than half the rows (too fussy for the size of this Sheet), case insensitive matching (reference codes are case sensitive), and a renewable lease (the time check is simpler).

**Decisions asked and answered.** The engineer asked for the notes to stay beside their students and for the build to follow at once. The shape above is the recommendation. The cross check was run on the same model at the engineer's choice, and the engineer chose to apply its recommended fixes.

## Evidence: what the Agent Skill search found

Searched the skills registry on 2026-10-08 for Google Sheets, the Sheets API with a service account, and `google-auth-library`. Relevant results: `googleworkspace/cli@gws-sheets` (56.4K installs) and `googleworkspace/cli@gws-sheets-read` (48.6K installs), both installed at your choice. They document the `gws` command line tool and expect a `gws-shared` skill and the `gws` program, neither of which is installed. Unrelated results were skipped (`anthropics/skills@xlsx`, the Lark and Feishu sheet skills, two small third party skills). No skill for `google-auth-library` was found. No Google Sheets MCP server is connected; spec 0001 noted a preview one was not confirmed.
