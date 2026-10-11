# 0013. Team list keeps a stable order when copies are replaced

**Date**: 2026-10-11
**Status**: Proposed

## Summary

The team list pages through students by the time their saved report copy was made, and that time moves whenever a copy is replaced. A student you have not seen yet can jump above the point where Load more continues, so you never see them. We fix it by ordering on the time a student's first copy became ready, which is set once and never changes, and by showing that date on each row. We also correct spec 0008's wording about the fake test sign in, which no longer matches the code.

## Context

Spec 0008 shows the team every student whose report copy is stored, newest first, 50 at a time (`convex/team.ts`, `list`, through the `by_readyAt` index on `reportFiles`). `readyAt` is set again each time a copy is replaced (`convex/reportCopy.ts`), and a report version change replaces every copy over several days. So a replacement moves a row to the top of the list. If that student sat below the point Load more continues from, they are never shown in that session. The reference code box still finds anyone.

Separately, spec 0008 AC-4 says the fake test sign in skips Google's verified email check on dev. The code now allows that only for fake `@example.com` addresses (`mayEnterTeam`, covered in `convex/team.test.ts`).

Production already holds real rows, so any new field needs a safe order of steps. Convex guidance for this repo says to prefer an index range over `.filter()`, so the fix should be an index, not a scan with a filter.

## Requirements

**User stories**:
- As a team member, I want Load more to show every student once, so that nobody is missed or shown twice.
- As a team member, I want the date on each row to match the order of the list, so that the list reads as one clear sequence.

**Acceptance criteria**:
- **AC-1**: The team list shows students whose saved copy is stored, newest first by when their first copy became ready (`firstCopyAt`), 50 at a time, and each row shows that date in India time (`Asia/Kolkata`).
- **AC-2**: Replacing a student's copy (a report version change) does not change their place in the list. Between two Load more clicks, no student is skipped and none is repeated.
- **AC-3**: A student whose first copy is not ready yet is not listed, and appears in their true place once it is ready (a refresh shows them; the code box already finds them). Accepted: one whose copy becomes ready after Load more passed that spot shows on the next refresh.
- **AC-4**: The code box, the opened PDF, the audit row and the Sheet link (column N) behave as before. The row still carries no phone, email, score or flag.
- **AC-5**: Every existing student with a stored copy gets a `firstCopyAt` before the list switches to it, so nobody drops out of the list at the switch. The switch needs no step in which a team page and the server disagree about a field name (see the rename rule below).
- **AC-7**: A Load more cursor from before the switch, held by an open tab, does not break the page: it shows "The list changed. Refresh to see it." with a Refresh button. A page that comes back short or empty while `next` is set keeps paging.
- **AC-6**: Spec 0008 is corrected to match: AC-1 and the list route describe the new date and order, and AC-4 says the fake test sign in is accepted without the verified check only for fake `@example.com` addresses when `TEST_SIGNIN_ENABLED` is `"true"`.

## Options considered

### Option 1: A once set `firstCopyAt` with its own index
Add an optional number to `reportFiles`, set the first time a copy is ready and never changed, with an index on it. List through that index.

**Pros**:
- Stable key, readiness is part of the index, no scan with a filter.
- The order and the date shown agree.

**Cons**:
- A schema change, a backfill for existing rows, and a rename of `madeAt`.

### Option 2: Use the row's creation time (no new field)
Order by `_creationTime` (when the student first opened the report) with a filter for ready copies.

**Pros**:
- No schema change or backfill.

**Cons**:
- Needs `.filter()` after the scan, against this repo's Convex guidance, and a page can come back short or empty when many rows are not ready.
- A copy that becomes ready after Load more passed its spot is missed more often.

### Option 3: Keep the order and add a warning
Tell the team that Load more can miss someone and to use the code box.

**Pros**:
- No change.

**Cons**:
- Leaves the bug in.

## Decision

**Chosen option**: Option 1: A once set `firstCopyAt` with its own index

Order the list by `firstCopyAt` (the time the student's first copy became ready, in your words "when they first opened their report", within about a minute) and show that date.

## Rationale

The cause is that the sort key moves when a copy is replaced, so a key that is written once fixes it at the root. Option 2 would avoid a migration but leans on `.filter()`, which this repo's Convex guidance advises against, and it leaves the "ready later" gap open. With Option 1 the readiness rule lives in the index range, the date on screen is the order key, and the migration is small (a handful of rows today, launch is 30 October). Runner up: Option 2 if a migration were unacceptable.

## Feature design

**Data model change** (`reportFiles`):
- `firstCopyAt: v.optional(v.number())`: set once, the first time a copy is ready; never written again.
- Index `by_firstCopyAt` on `["firstCopyAt"]`. The old `by_readyAt` stays until the backfill is proven, then is removed.

**API surface** (`GET /api/team/list`): same route, inputs and errors as spec 0008. A bad or old cursor still answers `bad_request`. The row changes from `{ studentId, name, class, madeAt, avatar }` to `{ studentId, name, class, firstCopyAt, madeAt, avatar }` for one release: `madeAt` carries the same value as `firstCopyAt` and is marked deprecated, because `convex/AGENTS.md` says never to rename or remove a field in the release that stops using it, and Pages and Convex deploy separately. A later release drops `madeAt`.

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Set `firstCopyAt` | the time the copy was kept | `now` inside the mutation that keeps a finished PDF (`attach` in `convex/reportCopy.ts`): written on every attach that stores a copy, only when `firstCopyAt` is empty (so a row replaced before the backfill still gets it). The "again" and "discarded" paths never touch it. `attach` is one Convex transaction, so a second run sees `ready` and is discarded |
| Backfill `firstCopyAt` | the existing row's value | the row's `readyAt` (`_creationTime` only as a defensive fallback; `attach` sets both together). The true first time is lost; copies already replaced get a later date, which is accepted |
| List order and cursor | `firstCopyAt` descending | the new index; equal values are ordered by creation time, so paging is stable; the cursor is the one Convex gives |
| Date on a row | `firstCopyAt` | formatted in `Asia/Kolkata` by `src/lib/team.ts`, as `madeAt` is today |

**Key invariants**
- `firstCopyAt` is written once and never changes, including when a copy is replaced.
- A row is listed only if `firstCopyAt` is set and a stored file exists (`listRow` tests `firstCopyAt` and `storageId` instead of `readyAt`).
- The backfill only fills an empty `firstCopyAt`, so running it twice changes nothing. A row recreated after an erase (row 15) gets a new `firstCopyAt`, which is accepted.

**Security model**: unchanged (spec 0008): team emails only, nothing new exposed.

**Configuration required**: none.

**Critical test scenarios**
- Page 1 loaded, an unseen student's copy replaced, Load more: that student still appears once and nobody repeats, verifies **AC-1, AC-2**.
- A first copy becomes ready after the list loaded: not in the old pages, present on refresh in the right place, verifies **AC-3**.
- Backfill on rows with `readyAt` set and run twice (no change the second time), and a row replaced before the backfill still gets `firstCopyAt` from `attach`, verifies **AC-5**.
- An old cursor gets `bad_request` and the page shows the Refresh message; a page with zero rows and `next` set keeps paging, verifies **AC-7**.
- Rows have exactly the keys `studentId, name, class, firstCopyAt, madeAt, avatar` (the two dates equal); the code box and PDF open still work, verifies **AC-4**.
- Source scan of `convex/`, `src/` and `e2e/` (not old spec text): the page reads `firstCopyAt` and nothing but the deprecated response field and its test still names `madeAt`, verifies **AC-1**.

## Build plan

Build approach: Tracer Bullet (the project default).

1. **M1 The thin thread, written but not yet read**: add `firstCopyAt` and `by_firstCopyAt` to the schema, set it in `attach` whenever empty, write the backfill internal mutation (batches of 100, safe to repeat, reports how many are left), run it on dev, satisfies **AC-5**, and keeps the list unchanged.
2. **M2 Switch the list**: list through `by_firstCopyAt`, return both `firstCopyAt` and the deprecated `madeAt`, make `listRow` test `firstCopyAt`, change `src/lib/team.ts` to read `firstCopyAt` with the Refresh message for an old cursor and paging on empty pages, update the unit tests and the e2e fixture, add the skip and repeat test, satisfies **AC-1, AC-2, AC-3, AC-4, AC-7**.
3. **M3 Proof and ship**: deploy order on each deployment: push M1 (Convex), run the backfill with your consent until 0 are left, then push M2 (Convex first, then Pages). Run on dev first, then production, satisfies **AC-5**.
4. **Spec 0008 correction** (done with this spec): AC-1, the list route and the list row, and AC-4's wording, satisfies **AC-6**.

## Consequences

**Positive**:
- Load more never skips or repeats a student.
- The date on the screen matches the order.

**Negative / tradeoffs**:
- One schema change and a one time backfill on each deployment, with a deploy order to follow.
- For copies already replaced, the backfilled date is the later time, not the true first time.

**Neutral**:
- The row field is renamed (`madeAt` to `firstCopyAt`); the team page and its tests change with it.

## Follow-up

- [ ] In a later release, once nothing reads them (no code, no open tabs of the old page), remove the deprecated `madeAt` response field and the `by_readyAt` index. A schema removal while code still reads the index fails the push.
- [ ] Cross check (same model, 2026-10-11) gaps are closed in this spec.
