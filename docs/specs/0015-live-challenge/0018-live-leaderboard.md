# 0018. Live leaderboard (scope row 12)

## Summary

The leaderboard shows the top 50 joined students ranked by valid referrals, with ties going to whoever reached the count first. The same 5 minute job that settles referrals writes every student's rank and one snapshot, and the page reads that. Each row shows only a first name and last initial (or "Anonymous <style>"), class, style and count. At the deadline the board freezes.

## Requirements

**User stories**:
- As a student, I want to see where I stand and how many I need for the next place.
- As a parent, I want my child's public details kept to a first name and an initial, or hidden.
- As the team, I want a board that cannot be changed from the browser and stops at the deadline.

**Acceptance criteria**:
- **AC-1**: Ranks follow the number of valid referrals, highest first. Equal counts go to the earlier `lastValidAt`; any remaining tie goes to the earlier `joinedAt`. The order is total, so ranks are 1, 2, 3 and so on with no shared places, and the "you" card uses the same order.
- **AC-2**: A row holds only `rank`, `displayName`, `cls`, `style` and `valid`. `displayName` is the first word of the name plus the last initial (taken with `Intl.Segmenter` so Hindi letters stay whole), or only the first word for a one word name, or "Anonymous <Style>" when `hideName` is set. A hidden row carries no `cls`. Never an email, phone, age, flag, student id or last name. A student with 0 valid referrals is not on the board.
- **AC-3**: The job (umbrella) runs every 5 minutes until the board is frozen and writes the top 50 into the single `leaderboardSnapshots` row with `computedAt`. If it fails, the old snapshot stays.
- **AC-4**: At the deadline one final run settles referrals as of `ENDS_AT_MS` (compared with stored step times, so the run time does not matter), writes the final snapshot and sets `frozen`. Later runs change nothing. The page shows "Challenge ended" with the final board.
- **AC-5**: After the freeze, the one exception: a student who erases their data (spec 0014) or leaves the challenge is removed from the frozen snapshot and ranks close up. The team's review is separate (child 0019).
- **AC-6**: Only signed in students can read the board (`challenge.leaderboard`, returning `{ rows, computedAt, frozen, endsAt }`). A signed out visitor is sent to sign in.
- **AC-7**: `challenge.me` returns the student's own `rank`, `toNext` and `nextRank`, as the job last wrote them to their entry (`null` for a student with no valid referral). `toNext` is the closest person above's count minus mine plus 1; first place gets `0`. The read is one row, so it is cheap and not re-run when other students' referrals change.
- **AC-8**: The page draws the board and the "you" card from live data and removes the demo rows. The "Updated every 5 minutes" line uses `computedAt`.
- **AC-9**: A row carries the student's picture only if spec 0011's switch `LEADERBOARD_PICTURES_ENABLED` is on and `hideName` is not set, using `leaderboardPictureFor`; production keeps it off (built later, after the core board).
- **AC-10**: BACKEND.md scenarios 10 and 12 pass, and so do a tie of three, hidden rows, a frozen board, an erase after the freeze, and a signed out read.

## Decision

**Chosen option**: Option 1 of the umbrella: ranks written by the job, one snapshot row, read by signed in students.

## Feature design

**Data**: `leaderboardSnapshots` and the `rank`, `toNext`, `nextRank` fields on `challengeEntries` from the umbrella.

**API surface**

| Function | Kind | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `challenge.leaderboard` | query | none | `{ rows, computedAt, frozen, endsAt }` | signed in | `not_signed_in` |
| `challenge.me` (child 0017) | query | none | includes `rank`, `toNext`, `nextRank` | signed in | none |
| `challengeBoard.run` | internal mutation (cron every 5 minutes) | none | none | cron | none |

**Job reads and bounds**: the ranking reads every entry with `validCount` above 0 (read with a `take` bound that aborts the run safely if exceeded) and patches `rank`, `toNext`, `nextRank` only where they changed; the snapshot reads at most 50 entries plus their students, results and (if on) avatars.

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Rows to rank | entries with `validCount` above 0 | `challengeEntries` |
| Tie break | `lastValidAt`, then `joinedAt` | `challengeEntries` |
| Display name | first word and last initial | `students.name` and `hideName` |
| Style | Builder, Achiever or Explorer | `results.styleKey` mapped k, p, v |
| Class | class text, omitted when hidden | `students.class` |
| Time shown | last update | `computedAt` |
| Frozen | deadline passed and the final run done | `ENDS_AT_MS` and `frozen` |

**Key invariants**: the snapshot is written only by the job (and the removal in AC-5); the order is the same for the same data; the public row is built in one function (`challengeBoard.rowFor`) the way `sharePayload.ts` builds the public report, and a test scans the output keys.

**Security model**: signed in students read; nobody writes from a browser.

**Critical test scenarios**: ranking with ties and the tie break (scenario 10), the keys of a row (scenario 12), hidden rows, the 50 cap, the final run and freeze, an erase and a leave after the freeze, a rejected referral drops off before the freeze, a signed out read is refused, `toNext` and first place, a Hindi name initial, a one word name, verifies **AC-1 to AC-10**.

## Build plan

1. Add `rowFor`, the ranking and the snapshot in `challengeBoard.run`, `challenge.leaderboard`, and the cron, satisfies **AC-1, AC-2, AC-3**.
2. Add the final run and freeze, the post deadline state and the removal for erase and leave, satisfies **AC-4, AC-5**.
3. Add `rank`, `toNext`, `nextRank` to `challenge.me`, satisfies **AC-7**.
4. Switch `js/leaderboard.js` and `js/api.js` to the bridge, remove the demo rows, show "Challenge ended" and `computedAt`, satisfies **AC-6, AC-8**.
5. Pictures behind the switch, satisfies **AC-9**.
6. Tests, satisfies **AC-10**.

## Consequences

**Positive**: one cheap read, a total order, and a public shape that cannot grow by accident.

**Negative / tradeoffs**: the board and a student's own rank can be 5 minutes old; two hidden students of the same style look the same; the final board is fixed even if the team later rejects a referral (the winner is decided from the review ranking in 0019).

## Rationale

A snapshot matches the screen's promise and is cheap to read; writing ranks onto entries lets the "you" card be a single row read. Settling as of the deadline from stored times makes the freeze exact even though the job runs every 5 minutes.
