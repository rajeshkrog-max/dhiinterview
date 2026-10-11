# 0023. The data model map: who owns each table, what erase does, how long it is kept

**Date**: 2026-10-11
**Status**: Proposed

## Summary

The data model was designed one feature at a time across specs 0002 to 0022, so no single page says which table belongs to which spec, what erase must do to it, and how long it lives. This spec is that map. It lists every table, groups them by how they are treated (deleted on erase, kept on purpose, patched, or system), fixes the small mismatches between specs that the map exposes, and adds one test that fails whenever someone adds a table without classifying it. It adds no table of its own.

## Context

Row 2 of the scope asked for "the core records every slice reads and writes". Since then the records were designed inside each feature's spec, with a rule in `convex/AGENTS.md` that tables and fields are additive and that results and consents are never deleted by app code. Spec 0014 (erase) now needs to know every table, spec 0015 adds challenge tables, specs 0021 and 0022 add monitoring and audit tables, and spec 0013 adds a field and an index. Without one map, a new table can slip past the erase function and leave a child's data behind.

The map found these mismatches, fixed here:
- Spec 0014's erase and kept lists did not name the challenge tables (0015) or the team audit table (0022). Fixed in 0014 on 2026-10-11.
- The convention "results are never deleted by app code" has one deliberate exception (erase), already stated in 0014.
- Spec 0008 and the comment on `reportViews` in `schema.ts` say that only the erasure of a student may delete `reportViews` rows. Spec 0014 keeps them, so no code deletes them. Fixed in 0008 below; the schema comment is a build task.
- Spec 0022 needs a `challengeEntries` index (`by_validCount`) that spec 0015 does not list.
- Spec 0003's "first feedback note kept" has one exception (spec 0015). Fixed in 0003 on 2026-10-11.

## Requirements

**User stories**:
- As a developer, I want one list of every table with its owner and its erase rule, so that I never forget a table.
- As the owner, I want to see how long each kind of data is kept.

**Acceptance criteria**:
- **AC-1**: `convex/dataMap.ts` lists every table in `convex/schema.ts` with exactly one class (`erased`, `kept`, `patched` or `system`), a `status` (`built` or `planned`), the owning spec as a plain string, whether it owns stored files, and a retention note that is never empty. A test (`convex/dataMap.test.ts`) fails if a schema table has no entry, if a `built` entry is not in the schema, or if a `planned` entry has appeared in the schema (someone must flip it to `built`). It reads `schema.tables` and needs no database. Tables owned by components (Better Auth, the rate limiter) are in a separate `COMPONENT_DATA` list that the test does not compare.
- **AC-2**: When spec 0014's erase function is built, its delete list is built from the `erased` entries and its own test compares the two (deferred to 0014's first milestone; not satisfied by this spec's build plan).
- **AC-3**: Rows classed `kept` are described honestly: `consents` and `reportViews` hold the old student id (so they can be linked to old Sheet history or backups), and `reportViews` and `teamAudit` also hold a staff email, which is personal data of staff; `erasures` and `erasedEmails` hold no student id.
- **AC-4**: The additive rule is stated once in the map file and kept: a new table or field is added in one release, and the code that stops using an old one is removed in a later release.
- **AC-5**: The stale statements about `reportViews` deletion are corrected: spec 0008 (its retention test line and its row 15 follow-up) now says no code deletes them, and the build corrects the comment in `convex/schema.ts`. The scope rows point at the map.

## Options considered

### Option 1: One map spec plus an executable guard
A page that lists every table and a test that keeps it complete.

**Pros**:
- Cheap; catches the exact mistake (a forgotten table in erase) at build time.

**Cons**:
- The map is only as good as the habit of updating it; the test forces that.

### Option 2: Redesign one big data model spec
Rewrite all tables in one new spec and supersede the pieces.

**Pros**:
- One place for every field.

**Cons**:
- Duplicates what the feature specs and `schema.ts` already hold, and risks drifting from them.

### Option 3: Leave row 2 as is
Rely on `schema.ts` comments.

**Pros**:
- No work.

**Cons**:
- Nothing stops a new table escaping erase or retention.

## Decision

**Chosen option**: Option 1: One map spec plus an executable guard

## Rationale

The fields of every table are already specified in the spec that created it and in `schema.ts`; a second full copy would only drift. What was missing is the cross cutting view (erase, retention, public shapes) and a guard. A test that compares the schema with a short map is the smallest thing that keeps the view true. The `built` and `planned` status lets the map describe tables that later specs will add without failing the test today.

## Feature design

**The map** (table, owning spec, class, status, files, retention). Class meanings: `erased` = spec 0014's erase deletes the student's rows; `kept` = the rows stay on purpose; `patched` = erase edits the row; `system` = holds no student data or is cleaned by its own rule.

| Table | Owning spec | Class | Status | Files | Retention |
|---|---|---|---|---|---|
| `students` | 0002 | erased | built | | until erase |
| `consents` | 0002, 0003, 0010, 0015 | kept | built | | kept, period owed (lawyer) |
| `consentTexts` | 0002 | system | built | | forever (frozen versions) |
| `checks`, `answers` | 0002 | erased | built | | until erase |
| `results`, `resultFlags` | 0005 | erased | built | | until erase |
| `leads` | 0003 | erased | built | | until erase |
| `feedback` | 0003 | erased | built | | until erase |
| `sheetSync` | 0004 | erased | built | | rows until erase; the delete ops erase queues are swept 7 days after the Sheet confirms, or 90 days if never confirmed |
| `sheetStatus` | 0004 | system | built | | one row |
| `reportFiles` | 0006, 0013 | erased | built | stored PDF | until erase |
| `reportViews` | 0008 | kept | built | | kept, period owed (lawyer); old student id and a team email |
| `avatars` | 0011 | erased | built | stored image | until erase |
| `reportShares` | 0010 | erased | built | | ends at expiry or Stop sharing; rows expired for 30 days are swept (new) |
| `erasures` | 0014 | kept | planned | | 3 years (lawyer to confirm); no student id |
| `erasedEmails` | 0014 | kept | planned | | 30 days; no student id |
| `challengeEntries`, `referrals` | 0015 | erased (the referrer is recounted) | planned | | until erase or leave |
| `leaderboardSnapshots` | 0015 | patched | planned | | one row; erase and leave remove the student's row from it, frozen or not (0018 AC-5) |
| `monitorState` | 0021 | system | planned | | 7 days, except the heartbeat row which stays |
| `teamAudit` | 0022 | kept | planned | | 2 years; student id and a team email |
| `teamStats` | 0022 | system | planned | | one row |

`COMPONENT_DATA`: Better Auth user, session, account and verification (erased through the component by 0014; abandoned accounts purged after 7 days) and the rate limiter state (counters keyed by student id, expire by themselves).

**Added in later specs** (for the record): `reportFiles.firstCopyAt` and its index (0013), `feedback.genuineAt` (0015), `leads.by_studentId` and `feedback.by_studentId` (0022), `challengeEntries.by_validCount` (added by spec 0022's build plan when 0015's tables exist).

**The guard**: `convex/dataMap.ts` exports `DATA_MAP` and `COMPONENT_DATA`. `convex/dataMap.test.ts` imports the schema and compares the names with the rules in AC-1. Shared rules (answers are option ids, one check per student, flags only in `resultFlags`, phone numbers only through the audited team reveal and the student's own export, public shapes built in one function each) are stated in a header comment of `dataMap.ts` and are enforced by the existing source scan tests (`results.test.ts`, the `NO_FLAGS` check), not by a new test.

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Table list for the test | names of schema tables | `Object.keys(schema.tables)` from `convex/schema.ts` |
| Class, status, files, retention | the map entry | `DATA_MAP`, decided in this spec |
| Owning spec | a plain string such as `"0014"` | `DATA_MAP` |

**Key invariants**:
- Every schema table has exactly one entry in `DATA_MAP`.
- Only `dataRights.ts` deletes rows classed `erased` as part of an erase; `kept` rows are never deleted by any code except their stated retention sweeps.

**Security model**: no new access; the map is a build time list.

**Critical test scenarios**: a table added to the schema without an entry fails; an entry marked `built` for a missing table fails; a `planned` entry for a table that now exists fails; an empty retention note fails; each table has one class, verifies **AC-1**.

## Build plan

Build approach: Tracer Bullet (the project default).

1. Add `convex/dataMap.ts` and `convex/dataMap.test.ts` with the entries above, satisfies **AC-1, AC-3, AC-4**.
2. Correct the comment on `reportViews` in `convex/schema.ts` and add one line to `convex/AGENTS.md` pointing at the map and restating the additive rule, satisfies **AC-4, AC-5**.
3. When spec 0014 is built, build its erase list from `DATA_MAP` and add the agreement test, satisfies **AC-2**.
4. As each planned table is built, flip its entry to `built` in the same change, satisfies **AC-1**.

## Consequences

**Positive**:
- A new table cannot be added without deciding what erase and retention do to it.
- One page answers "where does a child's data live and for how long".

**Negative / tradeoffs**:
- One more file to touch when adding a table (the test tells you).
- The map repeats table names that also live in `schema.ts`.
- Two retention periods (`consents`, `reportViews`) stay open until the lawyer answers.

**Neutral**:
- Fields stay in `schema.ts` and the feature specs; this spec does not copy them.

## Follow-up

- [ ] Revisit the retention of `consents` and `reportViews` (and the staff email in the latter) with the lawyer.
- [ ] Add the 30 day sweep of expired `reportShares` rows to spec 0010's follow-ups when built.
- [ ] Cross check (same model, 2026-10-11) gaps are closed in this spec.
