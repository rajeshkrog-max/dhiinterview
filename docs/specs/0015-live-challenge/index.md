# 0015. The live Founding Circle Challenge (referrals, join, leaderboard, winner review)

**Date**: 2026-10-11
**Status**: In Progress

## Summary

This turns the challenge from a mock in the browser into a real, server checked game. A student joins (with a parent tick if under 18), gets a code, and every friend who signs in as a new student with it and completes every step counts as one valid referral. A job that runs every 5 minutes works out which referrals are valid from data we already keep, ranks everyone, and writes the top 50 to a leaderboard that freezes on 30 October at 23:59 India time. After the deadline the team reviews the top 10 with a checked command and a CSV, not a new screen. The work is split into four child specs, one per scope row, that share the data model and rules below.

## Structure

| Child | Scope row | What it decides |
|---|---|---|
| [0016 Referral codes and tracking](0016-referral-codes-and-tracking.md) | 10 | Code format, checking a code, recording a use at sign in, how the job decides a referral is valid, the deadline rule, replacing a weak feedback note |
| [0017 Challenge join with parent consent](0017-challenge-join-with-parent-consent.md) | 11 | Joining, the rules tick, the guardian tick under 18, hide my name, leaving, the server switch |
| [0018 Live leaderboard](0018-live-leaderboard.md) | 12 | The 5 minute job (settle, count, rank, snapshot), what a row shows, the student's own rank, freezing |
| [0019 Winner review tools](0019-winner-review-tools.md) | 13 | The top 10 command, the CSV, rejecting and restoring a referral |

## Requirements

**Acceptance criteria that cross the children** (each child lists its own as well):
- **AC-1**: Every rule is enforced on the server. The browser only displays and asks; nothing a browser sends can create a valid referral or a rank.
- **AC-2**: Nothing public or visible to other students carries an email, phone, age, flag, student id or a last name. A row shows the first name and last initial, or "Anonymous <style>" when hidden.
- **AC-3**: A server switch `CHALLENGE_LIVE` (true, 1, yes or on; unset means off) controls joining and new referrals. With it off, the site works as today and no challenge row is created.
- **AC-4**: The deadline is `2026-10-30T23:59:00+05:30` (23:59, so a step at 23:59:30 is late). The same value is in `convex/challengeRules.ts` and `public/dhiinterviews/js/challenge-config.js`, and a test fails if they differ. Queries cannot read the clock, so they return `endsAt` and `frozen`; the server job decides.
- **AC-5**: The twelve scenarios in `BACKEND.md` section 15 pass as automated tests against the real functions.
- **AC-6**: A student who erases their data (spec 0014) or leaves the challenge leaves no entry, and their referrals stop counting for their referrer at the next job run.
- **AC-7**: The challenge pages stop using the localStorage mock: `js/api.js` calls `DhiSession.challenge` (the browser bridge in `src/lib/session.ts`), and its `// BACKEND:` notes are updated to match.

## Decision

**Chosen option**: Option 1: Server owned referral rows, a 5 minute job that settles validity and writes ranks and one snapshot, and a command based winner review

All state lives in three new tables and the existing `consents` table. A friend's steps are recorded by the functions that already record them (finishing the check, seeing the report, saving feedback); the job reads those times, so no existing function gets a new hook. The job runs every 5 minutes: it settles pending referrals, recounts, ranks and writes the snapshot.

## Feature design

**Data model** (all additive):

| Table | Fields | Indexes |
|---|---|---|
| `challengeEntries` | `studentId`, `code` (7 chars), `joinedAt`, `consentId` (a `consents` row of kind `challenge`), `hideName` (boolean), `validCount` (number, 0), `lastValidAt?` (number), `rank?`, `toNext?`, `nextRank?` (written by the job) | `by_studentId`, `by_code` |
| `referrals` | `referrerId`, `friendId`, `code`, `usedAt`, `status` (`pending` \| `valid` \| `rejected`), `validAt?`, `rejectReason?` (`deadline` \| `review`), `reviewNote?`, `reviewedAt?` | `by_friendId` (unique by lookup), `by_referrerId_and_status`, `by_status` |
| `leaderboardSnapshots` | `rows` (up to 50 of `{ rank, displayName, cls?, style, valid }`), `computedAt`, `frozen` (boolean) | one row, looked up with `.first()` |
| `consents` (existing) | add the kind `challenge`; `guardianPresent` carries the parent tick | unchanged |
| `feedback` (existing) | add optional `genuineAt` (number): when the note became genuine | unchanged |

`students` is unchanged (`referralCodeEntered` stays as the format checked record). No device marker is stored in this release.

**Shared rules and constants** (`convex/challengeRules.ts`): `ENDS_AT_MS` (2026-10-30T18:29:00Z), one `CODE_RE` (`^[A-Z]{3}[A-HJ-NP-Z2-9]{4}$`) used by the browser and the server, `LEADERBOARD_SIZE` 50, `JOB_EVERY_MS` 5 minutes, `isLive(env)`.

**Referral lifecycle**: a `pending` referral is created at a new student's profile creation (child 0016). The job makes it:
- `valid` when the friend's check is `fresh` and complete (`checks.completedAt`), the report was seen (`checks.reportSeenAt`) and a genuine note exists (`feedback.genuineAt`), and the latest of those three times (`validAt`) is at or before `ENDS_AT_MS`. The referral keeps `validAt`.
- `rejected (deadline)` when a required step happened after the deadline, or when the deadline has passed and a step is still missing.
- stays `pending` otherwise.
`rejected (review)` and its undo (back to `pending`, then re-settled by the job) are set by the team (child 0019).

**The job** (`challengeBoard.run`, every 5 minutes, self chaining in pages like `purge.ts`): (1) settle `pending` referrals page by page; (2) for each referrer touched, recount `validCount` and `lastValidAt` (the maximum `validAt` of their `valid` referrals); (3) rank every entry with `validCount` above 0 (count descending, then `lastValidAt` ascending, then `joinedAt`) and write `rank`, `toNext` and `nextRank` onto the entries that changed; (4) write the top 50 to the snapshot. After the deadline one final run (settling everything as of `ENDS_AT_MS`, whenever it actually runs) sets `frozen` and later runs do nothing, except the removal of a student who erased or left (child 0018).

**Value sourcing (cross child)**
| Action | Value | Source |
|---|---|---|
| Is a student under 18 | age | `students.age` on the server (never the browser) |
| Is the challenge open | live and before the deadline | `CHALLENGE_LIVE` and `ENDS_AT_MS` |
| Has the challenge ended (a page) | `endsAt`, `frozen` | returned by `challenge.me` and `challenge.leaderboard`; the server job decides |
| Display name of a row | first name and last initial, or "Anonymous <Style>" | `students.name` (first word; last initial with `Intl.Segmenter`) and `challengeEntries.hideName` |
| Style label of a row | Builder, Achiever or Explorer | the saved result's `styleKey` (k, p, v); never the letters themselves |
| Class of a row | class text, omitted when the name is hidden | `students.class` |
| The three step times | finish, report seen, genuine note | `checks.completedAt`, `checks.reportSeenAt`, `feedback.genuineAt` |

**Key invariants**
- One entry per student, one referral per friend, a student never refers themselves (a friend's profile cannot be the referrer's own).
- `validCount` and `lastValidAt` are written only by the job and the team commands, always through one `recount(referrerId)` function.
- The snapshot never contains an id, email, phone, age, flag or last name.
- Imported checks never count.

**Security model**: the browser is untrusted. Student functions use `requireStudent`. The code check route is public, rate limited and answers only what the referrer chose to show. The leaderboard is read only by signed in students. Team commands run from the terminal (`npx convex run`, production with `--prod` and the owner's yes). Compliance scope: India's Digital Personal Data Protection Act, 2023 (children's data, parental consent, withdrawing consent). Owed to the lawyer: minors' first name and initial shown to other students, guardian consent by tick only, and a prize contest open to minors.

**Browser path** (changes the plan must make): `src/lib/session.ts` (the profile form and `createProfile` call, a `DhiSession.challenge` bridge, the `endsAt`/`frozen` values), `public/dhiinterviews/js/gate.js` (remove the `recordReferralUse` call; the waiting code stays under `dhirise.ref.v1`), `public/dhiinterviews/js/api.js` (a caller of `DhiSession.challenge`, demo rows removed), `done.js` (`#join`), `challenge.js`, `leaderboard.js`.

**Configuration required**: `CHALLENGE_LIVE` (the switch; unset means off).

**Consent and words** (all draft, the owner approves): a versioned `challenge` text `challenge-v1` (the rules summary and the parent line), and matching lines on the terms page and the privacy page. The landing consent is not changed in this release.

## Build plan

Build approach: Tracer Bullet (the project default): one real referral from join to a counted rank first, then widen. Order by what the deadline needs: M1 to M3 first, M4 and M5 can finish after 30 October except what is marked.

1. **M1 The thin thread**: the tables, `challengeRules.ts`, `CHALLENGE_LIVE`, an adult `join` that makes a code, `createProfile` recording a pending referral, `feedback.genuineAt`, the job's settle and recount, `challenge.me` showing counts, and the bridge plus `js/api.js` for `getMe`, `joinChallenge`, `recordReferralUse` and `getMyReferral`. Proved on dev with two real accounts (children 0016, 0017), satisfies **AC-1, AC-3, AC-4, AC-7**.
2. **M2 The rest of joining and checking**: the guardian tick under 18, `hideName`, `challenge.leave`, the `challenge` consent, the public code check route with its limit and forwarder, the weak note replacement, and scenarios 7 to 11 (children 0016, 0017), satisfies **AC-1, AC-2, AC-5**.
3. **M3 The leaderboard**: ranking, the snapshot, the freeze, the student's own rank, the leaderboard page and the "you" card on live data (child 0018), satisfies **AC-2, AC-4, AC-5**.
4. **M4 After the deadline**: the winner review commands and runbook (child 0019) and the erase hook for spec 0014, satisfies **AC-6**. Needed only after 30 October, except the erase hook which ships with spec 0014.
5. **M5 Proof and go live**: all twelve scenarios as tests, browser specs for join, referral and leaderboard, a live check on dev with real accounts, and the go live checklist (settings, lawyer check, words approved, switch on), satisfies **AC-1 to AC-7**.

Rows 10, 11, 12 and 13 in `docs/scope/scope.md` take their milestones from this list.

## Consequences

**Positive**:
- A real, fair, server checked challenge that cannot be gamed from the browser.
- No change to the three busy functions beyond one extra time field; no counters that can drift.
- One data model for four rows, and winner review needs no new screen, so the build fits the window.

**Negative / tradeoffs**:
- A referrer's own count and rank can be up to 5 minutes behind.
- Hide my name still ranks a student, so two hidden students of the same style look alike.
- No shared device flag in this release, so one person using several real Google accounts is caught only by the top 10 review.
- Public naming of minors and tick only guardian consent depend on the lawyer's check.

**Neutral**:
- `js/api.js` becomes a thin caller; the mock and its demo rows are removed.
- A weak first feedback note can now be replaced by a genuine one, which changes spec 0003's "first note kept" rule for that one case.

## Follow-up

- [ ] Lawyer check: minors' names on the board, guardian consent by tick, and a prize contest open to minors.
- [ ] Owner approves the draft words: `challenge-v1`, the terms and privacy lines, and the landing line for friends ("Your invite counts when you are new to DhiRise").
- [ ] Spec 0003 (leads and feedback) is updated: a non genuine note may be replaced by a genuine one before the deadline, and the Sheet row is queued again.
- [ ] Spec 0014 (erase) must delete `challengeEntries` and `referrals` (as referrer and as friend), and recount the referrer; add them when this ships.
- [ ] Row 8 (analytics) must not send referral codes.
- [ ] Spec 0022 (team admin view) adds an index `by_validCount` on `challengeEntries` for its Challenge tab when these tables are built; spec 0023 lists both tables as `erased`.
- [ ] A shared device marker was considered and cut for this release (a flag that private windows defeat, and it needs a consent text bump). Revisit only if the top 10 review shows a need.
- [ ] Decide the go live date for `CHALLENGE_LIVE` after the lawyer check and the words are in.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
