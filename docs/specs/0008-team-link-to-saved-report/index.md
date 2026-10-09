# 0008. Team link to the saved report, in a team list and the Sheet

**Date**: 2026-10-09
**Status**: In Progress

## Summary

Named members of the DhiRise team get a private page that lists students whose saved report copy is ready, each with an Open link, and the same link goes into column N of the Leads tab in the Sheet. Team members sign in with Google, and only Google emails listed in one setting (`TEAM_EMAILS`) are let in. Every PDF the team opens is recorded and limited to 200 an hour per person. The privacy page and the consent text must say the team can open a report before this goes live.

## Requirements

**User stories**:
- As a team member, I want to open a student's saved report from the Sheet row I am looking at, so that I can help that student without asking them for a file.
- As a team member, I want a list of students whose report is ready, newest first, so that I can find one without the Sheet.
- As the owner, I want only named Google accounts to get in, and every open recorded, so that I can show who looked at a minor's report.
- As a student, I want the notice I agree to and the privacy page to say that the team can open my report, so that I am not surprised.

**Acceptance criteria**:
- **AC-1**: A signed in Google account whose email is in `TEAM_EMAILS` opens `/dhiinterviews/team.html` and sees every student who has a stored report copy, newest first, 50 at a time with a Load more button. Each row shows name, class, the date the copy was made in India time (`Asia/Kolkata`, whatever zone the viewer is in) and an Open link. The page shows no phone, email, score or flag.
- **AC-2**: A box on the list finds one student by reference code (the code in column A of the Sheet). Spaces around a pasted code are ignored. A code that is empty, unknown or not valid shows "No saved report found", never an error page.
- **AC-3**: Open, from the list or from the Sheet link `{BETTER_AUTH_URL}/dhiinterviews/team-report.html?s=<reference code>`, shows that student's saved PDF inside the team page, in the browser tab. A Download button saves it as `DhiRise-report-<first name>.pdf`. The bytes served are exactly the stored file, and the page checks they start with `%PDF-` before showing them.
- **AC-4**: A signed out visitor sees a Sign in with Google button, and after Google returns, lands on the same page or report (the report code is kept). If Google refuses the sign in (`?signin=error`), the page says so in plain words. A signed in account that is not in `TEAM_EMAILS` (a student, or any other Google account) sees a plain refusal and gets a refusal from every team route, with no student data in it, and a Sign out button so they can use another account. When `TEAM_EMAILS` is unset or empty, everyone is refused. In production the account's email must be verified by Google; on dev, when `TEST_SIGNIN_ENABLED` is `"true"`, the fake test sign in is accepted without that check.
- **AC-5**: Every PDF the team route serves adds one `reportViews` row (student, saved copy, its `sha256` and `reportVersion`, team email, time). The row is written only after the stored file is confirmed to exist, so there is a row for every PDF served and, rarely, one for a delivery that failed on the way. Only erasure of a student (scope row 15) may delete these rows; no other app code edits or deletes them. A refused, rate limited or not found request adds no row and writes one console line with the team email and the reason, never a student field.
- **AC-6**: One team member can open at most 200 PDFs in a fixed hour window. The 201st is refused with `rate_limited` and a plain message that says when to try again. A reload of the viewer is a new open and counts. Using the list and the reference code box costs nothing.
- **AC-7**: "Ready" means the student's report row has a stored file; a copy waiting to be replaced by a newer version can still be opened. A student with no stored file is not on the list, and their link answers "This report copy is not ready", not an error, as does a missing or invalid code and a student who no longer exists.
- **AC-8**: Column N of the Leads tab holds the team link for every student who has a Leads row and a stored copy. It is empty before the copy is ready, filled within about a minute after the copy first becomes ready, and rebuilt by a refill (one `sheetAdmin:refill` at deploy fills copies that were already ready). It is plain text, never a formula, and is clickable in the Sheet. The Feedback tab gets no link. A student with no phone step has no Leads row and so no link.
- **AC-9**: Removing an email from `TEAM_EMAILS` refuses that person on their very next team request (the list is read on every request). The two pages carry `noindex` and `private, no-store` on both their `.html` address and their clean address, and the team routes answer `private, no-store`.
- **AC-10**: Nothing a team route or page logs, shows in an error or puts in a URL contains a phone number or a student email. Student names and classes are put on the page as plain text only (never as HTML), the ids in links are encoded, and the two pages carry a content security policy that allows only this site's own scripts and the PDF viewer.
- **AC-11**: The privacy page says that named members of the DhiRise team can open a report and that each open is recorded. The consent text becomes v3 (v1 and v2 stay frozen), with one added line saying the same; the owner approves the exact words before it ships. Students who agreed earlier are not asked again.

## Decision

**Chosen option**: Option 1: A team gate on one email setting, with the same bearer token routes and Pages forwarders the student download already uses.

(basis: the route and forwarder pattern of spec 0006, and the named accounts choice recorded in scope row 23.) Team members sign in with the existing Google sign in; every team route checks the signed in email against `TEAM_EMAILS` on every request, then lists, serves or logs. The Sheet link is a plain address to a team page that signs in and then shows the stored PDF.

## Feature design

**Data model sketch**:

New table `reportViews` (one row per PDF served to the team, never edited):

| Field | Type | Notes |
|---|---|---|
| `studentId` | `v.id("students")` | whose report was opened |
| `reportFileId` | `v.id("reportFiles")` | the report row (one row per check, edited in place when a copy is replaced) |
| `sha256` | string | the fingerprint of the exact file that was served |
| `reportVersion` | number | the report version of that file |
| `teamEmail` | string | lowercase, from the signed in account |
| `viewedAt` | number | milliseconds |

Indexes: `by_studentId` (`studentId`), `by_teamEmail_and_viewedAt` (`teamEmail`, `viewedAt`).

Changed table: `reportFiles` gets index `by_readyAt` (`readyAt`) so the list reads newest first. No team table: the team is the `TEAM_EMAILS` setting. Rows in `reportViews` hold ids and a team email, no student data, so they are kept when a student is erased; scope row 15 is the only code that may delete them, and a source scan test (like the one in `convex/results.test.ts`) enforces it.

**State transitions**: none. A `reportViews` row is only ever inserted.

**API surface** (both `GET`, behind one Cloudflare Pages forwarder `functions/api/team/[[path]].ts` that passes only `Authorization` and the query string, and sets `Cache-Control: private, no-store`; every Convex function behind them is internal, called from the route after the team check):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/team/list` | GET | `cursor` (opt), `ref` (opt) | `{ rows: [{ studentId, name, class, madeAt }], next }` (50 rows, `next` is null on the last page) | team | 400 `bad_request` (a cursor that is not valid), 401 signed out, 403 `not_team` |
| `/api/team/report` | GET | `s` (the reference code) | the PDF, `inline`, `private, no-store`, `nosniff` | team | 401, 403, 404 `not_ready` (also a missing or invalid `s`), 429 `rate_limited` with the time to try again |

There is no `/api/team/me`: the list and report routes already answer 401 and 403, and the pages learn their state from those answers.

Pages: `/dhiinterviews/team.html` (the list) and `/dhiinterviews/team-report.html?s=` (the viewer). Neither uses the page guard, because the guard sends anyone without a student profile to the landing page. Both load `src/lib/team.ts`, a small script that:
- signs in with Google, building the return address from the fixed page path plus `s` only when it matches the id characters (never a free address), and on dev also supports the fake sign in;
- gets a token, calls the routes with `fetch`, and shows kind messages for signed out, refused, not ready, rate limited, a server error and offline;
- shows the PDF inside the team page in an embedded viewer made from a blob address (type set by the script, `%PDF-` checked first), with a Download button (file name from `downloadName`) and a Sign out button;
- puts names and classes on the page with `textContent` only, never `innerHTML`, and builds every link with `encodeURIComponent`.

Open links from the list open in a new tab. Convex side: `convex/team.ts` (the team check, the `list` internal query, the `openFile` internal mutation), `convex/teamHttp.ts` (the two routes, registered in `http.ts`), plus the dev proxy entry for `/api/team` in `astro.config.mjs`.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| every team route | who the caller is | the signed in account, found with `getSignedInUser` (the same helper the student routes use), email lowercase |
| every team route | whether the caller may enter | the email is in the `TEAM_EMAILS` list (split on commas, trimmed, lowercase, empty and duplicate entries dropped, read on every request; unset or empty means nobody) AND (the account's `emailVerified` is true OR `TEST_SIGNIN_ENABLED` is `"true"`) |
| list | rows, newest first | `reportFiles` through `by_readyAt` using `.gt("readyAt", 0)`, descending, only rows with a `storageId`, 50 per page, cursor from the previous page; `next` is null when done |
| list | name and class | the `students` row of each `studentId` |
| list | "date the copy was made" | `reportFiles.readyAt` (set when the copy is attached or replaced), formatted with `Intl` in `Asia/Kolkata` |
| list | the Open link | `/dhiinterviews/team-report.html?s=` plus the encoded `studentId` |
| list, `ref` box | which student | the box text trimmed, then `ctx.db.normalizeId("students", ref)`; one that does not normalise, or has no stored copy, is "not found" |
| report | which file | `reportFiles` by `by_studentId`, its `storageId` (the file route's own rule: a stored file exists); none is 404 `not_ready`; the mutation confirms the file with `ctx.db.system.get(storageId)` and returns the `storageId` it checked |
| report | the file name | `downloadName(student.name)` from `reportCore.ts` (spec 0006) |
| report | the rate limit count | a `teamOpen` fixed window of 200 per hour, key = the caller's email, used only on an open that will be served |
| report | the audit row | `studentId`, `reportFileId`, `sha256` and `reportVersion` from the row above, `teamEmail` from the caller, `viewedAt = Date.now()` |
| report | the "try again at" time | the limiter's retry time, shown in India time |
| Sheet column N | the link text | `{BETTER_AUTH_URL without a trailing slash}/dhiinterviews/team-report.html?s={studentId}`, built where the lead row is built (the base address is passed in as an argument, the path is one constant) when the student's `reportFiles` row has a `storageId`, else empty; `BETTER_AUTH_URL` unset means empty |
| Sheet column N | when it appears | `reportCopy.attach` finds the lead through the row's `checkId` and queues it again with `enqueueSheet("lead", leadId, studentId, "upsert")` the first time a copy becomes ready; copies ready before deploy get theirs from one `sheetAdmin:refill` |
| privacy page, consent v3 | the wording | owner approves before it ships (draft in the build plan) |

**Key invariants**:
- A team route never returns data to a caller who is not signed in, not on `TEAM_EMAILS`, or (in production) not verified, checked on every request with no caching.
- The list never contains a phone, email, score or flag. The PDF served is the stored file, never a new render, so it carries no flag text (spec 0006).
- A `reportViews` row is written, after the file is confirmed to exist, for every PDF the team route serves, and for nothing else.
- Column N is written by the existing Sheet copy job only, inside columns A to X, as plain text (spec 0004).
- Every function behind the routes is internal (`internalQuery`, `internalMutation`), so nothing in the browser can call one directly.

**Security model**:
- Team members are named by email in `TEAM_EMAILS` (a per deployment setting, so production and dev differ). There is no role split yet; row 14 adds roles.
- A student's session never grants team access: the check is the email list, not "has a profile".
- Convention exception, stated here on purpose: team functions take a student id as input (the reference code). That is allowed only behind the team check; student facing functions still never take one.
- The 200 an hour limit bounds how much a stolen or misused team account can read. The audit rows say who opened what. Refusals are visible in the Convex logs by team email.
- Removal from `TEAM_EMAILS` takes effect at the next list or open request. A token already issued stays valid for its short life, but it cannot get past the list check.
- Compliance scope: students under 18 in India (Digital Personal Data Protection Act, 2023). Team access to a minor's report is a purpose the student must be told about, which is why AC-11 is part of this feature.
- The Sheet link contains the reference code, which is already in column A. It opens nothing for anyone who is not on the list.
- Student names are typed by students and shown to team members, so they are treated as untrusted text (AC-10).

**Configuration required**:
- `TEAM_EMAILS`: comma separated Google emails of the team. Declared optional in `convex/convex.config.ts`, set per deployment. On dev it includes the fake test address the browser tests sign in with; on production it holds the real team.
- `BETTER_AUTH_URL`: already set; the Sheet link and the Google sign in return address use it.
- Content security policy and `noindex` rules for `/dhiinterviews/team` and `/dhiinterviews/team-report` (both addresses, with and without `.html`) in `public/_headers`.

**Critical test scenarios**:
- Happy path: a team member signs in, sees the list, opens a student, sees the stored PDF, downloads it, and one `reportViews` row exists with the file's `sha256`, verifies **AC-1**, **AC-3**, **AC-5**.
- Happy path: the Sheet row for a student with a ready copy has the link in column N, and a refill fills one that was ready before, verifies **AC-8**.
- Failure case: the 201st open in an hour is refused and adds no row, verifies **AC-6**.
- Failure case: a student with no stored file, an empty or malformed code, a bad cursor, an erased student, verifies **AC-2**, **AC-7**.
- Auth and permission: signed out gets 401, a student and any other Google account get 403, an unset `TEAM_EMAILS` refuses everyone, a removed email is refused at once, an unverified email is refused in production but the fake test sign in works on dev, verifies **AC-4**, **AC-9**.
- Safety: a student named `<img src=x onerror=alert(1)>` appears as text on the list and the viewer, verifies **AC-10**.
- Privacy: no phone or email appears in a list response, an error or a log line, verifies **AC-10**; the privacy page and consent v3 carry the new words, verifies **AC-11**.
- Retention: no code other than the erasure path deletes `reportViews` rows (source scan), verifies **AC-5**.

## Build plan

Approach: Tracer Bullet (the project default). Prove one thin real thread first, a team member opens one real PDF, then add the list, the Sheet link and the notice.

**Milestone 1. The thin thread**
1. Add the `TEAM_EMAILS` setting, the team check (list parsing, the verified rule with its dev exception), the Pages forwarder `functions/api/team`, the `/api/team` dev proxy, and the `_headers` rules (`noindex`, `private, no-store`, content security policy) for both pages on both addresses each, satisfies **AC-4**, **AC-9**, **AC-10**.
2. Add the `reportViews` table, the `by_readyAt` index, the `teamOpen` fixed window limit, the `openFile` internal mutation (checks the limit, the stored file and writes the row) and `GET /api/team/report`, satisfies **AC-3**, **AC-5**, **AC-6**, **AC-7**.
3. Add `src/lib/team.ts` and the viewer page `team-report.astro`: Google sign in (and the dev fake sign in), the return address that keeps `s`, the embedded PDF, Download and Sign out, kind messages. Prove it on dev with a real ready copy, satisfies **AC-3**, **AC-4**, **AC-10**.

**Milestone 2. The list**
4. Add the `list` internal query, `GET /api/team/list` and the list page `team.astro` with Load more and the reference code box, satisfies **AC-1**, **AC-2**, **AC-7**, **AC-10**.

**Milestone 3. The Sheet link**
5. Pass the link base into the lead row and fill column N, have `reportCopy.attach` queue the lead row again the first time a copy is ready, and test a refill of copies that were already ready, satisfies **AC-8**.

**Milestone 4. The notice** (needs the owner's wording first)
6. Change section 4 of `privacy.astro` to say named members of the DhiRise team can open a report and each open is recorded; add consent v3 (v1 and v2 frozen, a test pins both fingerprints); update the tests that pin `v2`. Draft line for the owner to approve or change: "Named members of the DhiRise team can open your report to help you. Each time one does, we record who opened it and when." satisfies **AC-11**.

**Milestone 5. Proof**
7. Convex tests for the gate, list, open, limit and audit; the source scan for `reportViews`; browser tests for both pages (signed out, not on the list, on the list, a name that looks like HTML, no sideways scroll on a phone); a live check on dev that the Sheet cell is clickable, satisfies **AC-1** to **AC-10**.

## Consequences

**Positive**:
- The team can open any ready report from the Sheet row in one click, and the owner can show who opened what.
- No new service, no new login system: the same Google sign in, the same route pattern as the student download.
- Adding or removing a team member is one setting change, effective at the next request.

**Negative / tradeoffs**:
- A team member in `TEAM_EMAILS` can read any ready student's report, up to 200 an hour. Finer roles wait for row 14.
- Browsing the list is not audited (it shows only names and classes); only served PDFs are.
- The list shows names and classes of minors to the team, so it adds a second screen that holds that data. It is behind the same gate.
- Google's sign in is in test mode with a cap of 100 users, shared by students and the team. Team members must be listed as test users until the app is published (row 18).
- Students who agreed under v1 or v2 did not see the team access line. The privacy page covers them, the consent line does not.
- A saved copy stays readable by the team while a newer version is being made.

**Neutral**:
- Team pages sit under `/dhiinterviews/` like every other page. Row 20 may move them into a shared frame later without changing the Sheet link if the address is kept.
- The daily clean up deletes a sign in account more than 7 days old that has no student profile and no session activity in the last day. A team member whose account was cleaned up simply signs in again.

## Follow-up

- [ ] Owner: the list of team Google emails for `TEAM_EMAILS` on production, and each added as a Google sign in test user until the app is published.
- [ ] Owner: approve or change the consent v3 line and the privacy page sentence before milestone 4 ships.
- [ ] Row 15 (export and deletion): deleting a student must also delete their saved PDF; the privacy page already promises the PDF copy goes with an erasure request. `reportViews` rows stay (ids and a team email only) and row 15 is their only deleter. Until row 15 exists, an erasure is a manual job in the Convex dashboard.
- [ ] Row 14 (team admin view): widen this gate into roles; phone and email only for the roles that need them; decide whether browsing the list should be audited.
- [ ] Row 20: move the two team pages into the shared frame, keeping `/dhiinterviews/team-report.html?s=` working, or leave a redirect.
- [ ] Phones that cannot show a PDF inline will download it instead of showing it in the embedded viewer; check on a real phone at verify time.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
