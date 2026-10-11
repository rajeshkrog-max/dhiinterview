# 0022. Team admin view (totals, students, leads, feedback, challenge) with two roles

**Date**: 2026-10-11
**Status**: Proposed

## Summary

The team gets one private admin page with tabs: Totals, Students, Leads and Feedback now, and Challenge once the challenge tables exist. Everyone on the team list sees them with phone numbers hidden. A smaller list of phone viewers can reveal a phone number, change a student's WhatsApp status, block a picture and switch off a share link, and also sees an access log of those actions. Every view, reveal and change is written to an audit log. This builds on row 23's team sign in (the `TEAM_EMAILS` list and the audited report viewer) and replaces the hand edits to the WhatsApp status in the Sheet.

## Context

Row 23 built a team sign in that is one flat list: everyone on `TEAM_EMAILS` can open any student's report PDF, and each PDF open writes a `reportViews` row. The team routes are internal queries behind Pages forwarders (`functions/api/team/[[path]].ts`, GET only) and the page sends a bearer token in a header, not a cookie. Leads (with phone numbers), feedback and the WhatsApp status are visible to the team only in the Google Sheet, and the status is changed by hand there. Some administrative actions exist only as terminal commands (`avatars:adminBlock` and `adminUnblock` by email, `shares.adminOff`).

Compliance scope: India's Digital Personal Data Protection Act, 2023. Phone numbers of children are the most sensitive field the team can reach, so who may see them, and a record that someone looks at the record, matter. AGENTS.md rules also apply: flags are never shown, and a feedback note is never quoted with a name outside the team.

The challenge tables from spec 0015 are not built yet. Typed Convex code cannot query a table that does not exist, so the Challenge tab ships only after those tables do.

## Requirements

**User stories**:
- As a team member, I want to see how the funnel is doing and read leads and feedback, so that I do not need the Sheet.
- As a phone viewer, I want to reveal a phone number and update a student's WhatsApp status in one place, so that the status stays right.
- As the owner, I want a record of who looked at what and who changed what, and a way to see it, so that access to children's data can be checked.

**Acceptance criteria**:
- **AC-1**: A signed in account on `TEAM_EMAILS` (the existing gate, including the Google verified rule) opens `/dhiinterviews/team` and sees the tabs Totals, Students, Leads and Feedback (and Challenge once spec 0015 is built). An account not on the list, or signed out, is refused as today, with no data. A visited tab is kept in the page and not fetched again until the member asks (Load more or Refresh).
- **AC-2**: A second setting `TEAM_PHONE_EMAILS` lists the phone viewers. A phone viewer must also pass the full team gate (on `TEAM_EMAILS`, Google verified, or a fake `@example.com` test address on dev); an email only on the second list gets nothing. Unset or empty means nobody is a phone viewer. Both are read on every request. On dev the test phone viewer is `phone.e2e@example.com`, put on both settings on dev only.
- **AC-3**: Phone numbers never appear in any list response. A phone viewer's Reveal calls its own route, which returns one phone number and writes its audit row in the same step. It is limited to 30 reveals an hour and 200 a day per member. The browser keeps the number in memory for 30 seconds. A team member who is not a phone viewer sees no Reveal button and gets a refusal from the route.
- **AC-4**: Totals shows, as of a time: students, finished checks, reports seen, leads, WhatsApp opt ins, feedback notes (and how many are genuine) and report links on. The numbers come from one stored row refreshed every hour by a paged job, plus a Refresh button limited to once per 10 minutes. The challenge counts (joined, valid and pending referrals) are added when spec 0015 is built.
- **AC-5**: Students lists the students whose report copy is stored (the existing list, with its reference code box). Leads lists every lead, newest first, 50 at a time: name, class, opt in time (if any), and WhatsApp status (`none` for a student who did not opt in). Feedback lists rating, text, genuine and can share, newest first. Each list has the reference code box and Load more. A page that comes back short or empty while there is more to load keeps asking.
- **AC-6**: The pages show no flag, score, style label, email, age or answer. The reference code (the student's id, the same one in the Sheet) is shown so a row can be matched. Feedback text is shown as plain text only, and Feedback rows have no link to shares or exports.
- **AC-7**: A phone viewer can set a lead's WhatsApp status to `new`, `added` or `opted_out` (any value to any other). Only a lead that opted in (`whatsappOptInAt` set) can be set; a bad value answers 400. The change is saved, the Sheet row is queued again with `enqueueSheet(ctx, "lead", leadId, studentId, "upsert")`, and it is audited. After this ships, a hand edit of the status column in the Sheet is overwritten at the next copy, and the "changed by hand" note in `schema.ts` is updated.
- **AC-8**: From a Students row a phone viewer can block or unblock the student's picture (one route with `blocked: true or false`) and switch off their report link. The logic of `avatars.adminBlock`, `adminUnblock` and `shares.adminOff` is moved into shared helpers that both the terminal commands and the team routes call, and the team routes find the student by id. Each asks for a confirm tap in the page, but the server does not rely on it: a repeated identical write is idempotent, and a repeated block or share off is a no-op that is still audited. The page says a picture change can take up to 10 minutes to show. A team member who is not a phone viewer sees none of these buttons and is refused by the routes.
- **AC-9**: Every team call that returns data or changes it and succeeds writes one `teamAudit` row in the same step: the team email, the action (`view_totals`, `view_students`, `view_leads`, `view_feedback`, `reveal_phone`, `set_whatsapp`, `block_picture`, `share_off`, and `view_challenge` later), the student id when the action concerns one student (reveal, set, block, share off, and a reference code lookup), and the time. One row per page of a list, not per row. A refused call writes no row. The existing PDF views stay in `reportViews`. Because reads now write, every team read route is an internal mutation (not a query), including the existing `/api/team/list`, which becomes audited as `view_students`.
- **AC-10**: `teamAudit` rows are only ever added by the team routes. They hold ids and an email, no student data, and stay after a student's erase (spec 0014 lists them as kept). A paged daily job registered in `crons.ts` deletes rows older than 2 years.
- **AC-11**: Phone viewers also get an Access log panel on the Totals tab: the last 100 reveals and changes (who, which reference code, when, what). `tools/TEAM-ACCESS.md` sets a weekly review of it by the owner and says what to look for (many reveals by one member, reveals at odd hours). Opening the panel is audited as `view_access_log`.
- **AC-12**: Writes are limited to 120 an hour per member. Order in every write: role check, then the student is found (an unknown or erased student answers `not_found` and uses no quota), then the limit, then the work. Limit refusals are returned as result objects, not thrown (a thrown error would roll the count back).
- **AC-13**: The new POST routes pass through the team forwarder (allowing POST, passing a JSON body of at most 1 KB and requiring `content-type: application/json`) and are registered in `convex/http.ts`. Every response is `private, no-store`, including the phone. No log line holds a phone or a name. The page and routes keep the team pages' rules: `noindex`, a content security policy allowing only this site, and no third party address. No Origin check is needed because the page uses a header token and `credentials: "omit"`.
- **AC-14**: The consent text and the privacy page say that the team can see a student's phone number and feedback, with an access log; spec 0008's wording covers only opening a report. The words are drafts for the owner to approve.
- **AC-15**: Convex tests cover both roles, every refusal, the audit rows, the limits and the status rules; browser tests cover the tabs, the hidden and revealed phone, a status change and a refusal for a non phone viewer. "Two writes at once" is a live check on dev, because `convex-test` runs one mutation at a time.

## Options considered

### Option 1: One admin page, two roles from two settings, an audit log
Extend the team page into tabs; add `TEAM_PHONE_EMAILS`; add a `teamAudit` table and a stored totals row; make reads audited mutations.

**Pros**:
- Small change on top of row 23; phones are hidden for most of the team; every access is recorded and the owner can see it.
- Settings are read each request, so access changes at once; no new user table.

**Cons**:
- Roles live in two settings, not in the database.
- Reads that write rows add audit volume and drop caching (these routes were never cached or reactive).

### Option 2: One flat list, no roles
Everyone on the team list sees everything including phones.

**Pros**:
- Least to build.

**Cons**:
- Every team member can read every child's phone number; against the row's own goal.

### Option 3: A role table with an invite screen
Store roles in the database and manage them from the page.

**Pros**:
- Roles can be changed without touching settings.

**Cons**:
- A screen and rules to protect the screen itself; far more than a small team needs now.

## Decision

**Chosen option**: Option 1: One admin page, two roles from two settings, an audit log

**Implementation skills**: `convex` (`.claude/skills/convex/`) · `convex-authz` (`.claude/skills/convex-authz/`, for the role checks) · `astro` (`.claude/skills/astro/`)

## Rationale

Phone numbers of children are the one field that needs a stricter rule than the rest, and two settings give that with almost no new code on top of the gate row 23 already tests. Reveal on tap, its own route, a short lived display and a lower limit make a phone read a deliberate, recorded act. You asked for everything to be audited including browsing; one row per list page keeps that readable, and an audit only works if someone reads it, so phone viewers get the access log and a weekly review. The block picture and share off buttons (a choice you made) act on children's data from a web page, so they sit behind the phone viewer role, a confirm tap and an audit row, and reuse the same helpers as the terminal commands. A stored totals row keeps the first screen cheap however many students there are. The browser cannot block screenshots, copy or extensions, so the real brake on a phone read is policy plus the log.

## Feature design

**Data model** (additive):

| Table | Fields | Indexes |
|---|---|---|
| `teamAudit` | `teamEmail`, `action` (the union in AC-9, plus `view_access_log`), `studentId?`, `at` | `by_at`, `by_teamEmail_and_at`, `by_studentId` |
| `teamStats` | one row: `computedAt`, `chainStartedAt?` (the chain guard) and the counts in AC-4 | none (read with `.first()`) |
| `leads` (existing) | add index `by_studentId` | additive |
| `feedback` (existing) | add index `by_studentId` | additive |

Leads and feedback lists page on the default creation order (`order("desc")`). When spec 0015 is built, `challengeEntries` also gets an index `by_validCount` and the Challenge tab is added then.

**Roles**: `teamGate` (existing, including `mayEnterTeam`) stays the base. A new `phoneGate` calls it, then requires the email to be in `parseTeamEmails(TEAM_PHONE_EMAILS)`. Both are read on each call. A typo in `TEAM_PHONE_EMAILS` fails safe (no phone access); the page tells a team member plainly when they are not a phone viewer.

**API surface** (internal mutations behind `functions/api/team/` routes; the forwarder is changed to allow POST with a capped JSON body):

| Route | Method | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/team/totals` | GET | none | the counts and `computedAt` | team | 401, 403 |
| `/api/team/list` (existing) | GET | `cursor`, `ref` | students rows | team | 400, 401, 403 |
| `/api/team/leads` | GET | `cursor`, `ref` | `{ rows: [{ studentId, name, class, optInAt?, whatsappStatus }], next }` | team | 400, 401, 403 |
| `/api/team/feedback` | GET | `cursor`, `ref` | `{ rows: [{ studentId, firstName, class, rating, text, genuine, canShare }], next }` | team | 400, 401, 403 |
| `/api/team/access-log` | GET | none | the last 100 sensitive audit rows | phone viewer | 401, 403 |
| `/api/team/phone` | POST | `studentId` | `{ phone }` | phone viewer | 401, 403, 404, 429 |
| `/api/team/whatsapp` | POST | `studentId`, `status` | `{ ok: true }` | phone viewer | 400, 401, 403, 404, 429 |
| `/api/team/picture` | POST | `studentId`, `blocked` | `{ ok: true }` | phone viewer | 401, 403, 404, 429 |
| `/api/team/share-off` | POST | `studentId` | `{ ok: true }` | phone viewer | 401, 403, 404, 429 |

**Jobs** (both registered in `crons.ts`): `teamStats.refresh` hourly, chained in pages of about 100 documents, passing the running counts in its arguments, one chain at a time (the `chainStartedAt` guard, restarted if it is over 30 minutes old), writing the row at the end; `teamAudit.sweep` daily, paged, deleting rows older than 2 years through `by_at`.

**Limits** (new entries in `limits.ts`, keyed by the member's email, refusals returned as results): `teamReveal` (30 an hour and 200 a day), `teamWrite` (120 an hour), `teamStatsRefresh` (once per 10 minutes).

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Who is acting | the team email | the signed in account, as `teamGate` finds it |
| Is a phone viewer | the email is on both lists and passes the gate | `TEAM_EMAILS` and `TEAM_PHONE_EMAILS` through `mayEnterTeam` |
| The student for a write | the `students` row | the `studentId` input, normalised with `ctx.db.normalizeId`; unknown or erased gives `not_found` |
| Leads rows | name, class, opt in time, status | `leads` (newest first) joined to `students`; the lead of one student through `leads.by_studentId` |
| Feedback rows | rating, text, genuine, can share | `feedback` (newest first) joined to `students`; one student through `feedback.by_studentId` |
| Totals | counts | the `teamStats` row, built by walking `students`, `checks`, `leads`, `feedback`, `reportShares` |
| Audit time | now | `Date.now()` in the mutation |
| Sheet copy of a status change | the lead row queued again | `enqueueSheet(ctx, "lead", leadId, studentId, "upsert")` |
| Picture block and share off | the existing behaviour | shared helpers extracted from `avatars.adminBlock`, `adminUnblock` and `shares.adminOff` |

**Key invariants**
- A phone number appears only in the response of `/api/team/phone`, only for a phone viewer, and the audit row is written in the same mutation as the read.
- Every route checks its role first; a refusal returns no student data and writes no audit row.
- Lists never hold phone, email, age, flag, score, style or answers.
- An erased student cannot be reached: their rows are gone and the routes answer `not_found`.

**Security model**: the team gate (Google verified email, on the list) plus the phone viewer list; settings read per request; bearer token in a header (no cookie, so no CSRF path); strict page headers; limits per member; an access log the owner reviews weekly. A team member who loses access loses it on the next request. A stolen signed in browser could read up to 200 phones a day, which is why the limits are low and the log is reviewed.

**Configuration required**:
- `TEAM_PHONE_EMAILS`: comma separated emails of phone viewers; declared in `convex/convex.config.ts` as an optional string; per deployment.

**Critical test scenarios**
- Totals, leads and feedback for a team member: right rows, no phone, no forbidden field, a short or empty page keeps paging, verifies **AC-1, AC-4, AC-5, AC-6**.
- A phone viewer reveals a phone; a team member who is not a phone viewer is refused; an email only on `TEAM_PHONE_EMAILS` is refused everywhere; the hourly and daily limits hold and refusals are results, verifies **AC-2, AC-3, AC-12**.
- Setting a WhatsApp status saves, queues the Sheet row and audits; a lead that did not opt in cannot be set; a bad value answers 400; a repeated identical write is idempotent, verifies **AC-7, AC-8**.
- Block and unblock a picture and switch off a share link as a phone viewer; refused for others; repeated calls are no ops that are still audited, verifies **AC-8, AC-9**.
- The audit has one row per list page and one per reveal or change, none for a refusal, no student data; the sweep deletes rows older than 2 years, verifies **AC-9, AC-10**.
- The Access log shows the last 100 sensitive rows to a phone viewer only, verifies **AC-11**.
- An unknown or erased student answers `not_found`, uses no quota and changes nothing, verifies **AC-12**.
- The forwarder allows POST with a small JSON body only, rejects other content types and large bodies, and every response is `no-store`, verifies **AC-13**.
- Browser: the tabs (a visited tab is not fetched again), hidden then revealed phone that disappears, a status change, a refused non phone viewer, no sideways scroll on a phone, verifies **AC-1, AC-15**.
- Live on dev: two members writing the same status at once end with the last value and two audit rows, verifies **AC-15**.

## Build plan

Build approach: Tracer Bullet (the project default): one real role protected read end to end first, then the rest.

1. **M1 The thin thread**: `TEAM_PHONE_EMAILS` and `phoneGate`, `teamAudit`, the forwarder allowing POST, the Leads tab (with `leads.by_studentId`) with Reveal through its own audited mutation, the tabs shell on the team page, proved on dev with two accounts (one phone viewer, one not), satisfies **AC-1, AC-2, AC-3, AC-9, AC-13**.
2. **M2 The other tabs and the audit on reads**: Totals with `teamStats` and its hourly job and Refresh, Feedback (with `feedback.by_studentId`), the existing Students list made an audited mutation, the reference code box on each list, satisfies **AC-4, AC-5, AC-6, AC-9**.
3. **M3 The actions**: WhatsApp status with the Sheet queue, the shared helpers for picture block and share off, the routes, confirm taps, `teamWrite` limits and `not_found`, satisfies **AC-7, AC-8, AC-12**.
4. **M4 The access log, retention and words**: the Access log panel, the 2 year sweep, `tools/TEAM-ACCESS.md`, the consent and privacy page lines (drafts), the `schema.ts` note, satisfies **AC-10, AC-11, AC-14**.
5. **M5 Proof**: Convex tests, browser specs, a live check on dev with two real Google accounts including the two writes at once, satisfies **AC-15**.
6. **Later, with spec 0015**: the Challenge tab, its route and the challenge counts in Totals, with the `by_validCount` index, satisfies **AC-1, AC-4, AC-9**.

## Consequences

**Positive**:
- Phone numbers of children are seen by a few people, one deliberate tap at a time, with a record that is actually reviewed.
- The team stops using the Sheet for status; the numbers and lists are in one place.
- Reuses row 23's tested gate and the existing admin logic.

**Negative / tradeoffs**:
- Roles are settings, so changing them means editing a Convex setting, not clicking in the page.
- Every read writes an audit row, so these routes are mutations and are not cached.
- Block picture and share off from a web page act on children's data without a terminal step; the role, the confirm tap and the log are the brakes.
- Totals are up to an hour old; the Challenge tab arrives later.
- The browser cannot stop screenshots or copying of a revealed phone; policy and the log do.

**Neutral**:
- The terminal commands remain for erase, export and winner review; this page does not replace them.

## Follow-up

- [ ] Owner decides who is on `TEAM_PHONE_EMAILS`, sets it on each deployment, and does the weekly review of the Access log.
- [ ] Owner approves the consent text and privacy page lines about the team seeing phone numbers and feedback.
- [ ] Spec 0015 is built first or later: its `challengeEntries` table gets `by_validCount` and the Challenge tab and counts are then added here.
- [ ] Spec 0014 (erase): `teamAudit` rows stay (ids only); add it to its list of kept records and its procedure.
- [ ] Rows 13 and 15 may later add buttons here (winner review, erase), each audited the same way.
- [ ] Lawyer check: the team reading children's phone numbers and feedback, and the audit retention of 2 years.
- [ ] Cross check (same model, 2026-10-11) gaps are closed in this spec.
