# 0016. Referral codes and tracking (scope row 10)

## Summary

A joined student has one code. A friend who signs in as a new student with that code starts a pending referral. A job decides, every 5 minutes, whether it is valid: the friend finished a fresh check of all 18 questions, saw the report and left genuine feedback, all by the deadline. The server checks every step; the browser cannot create or change a referral.

## Requirements

**User stories**:
- As a referrer, I want each friend who really completes the check to count, so that my effort is fairly counted.
- As a friend, I want a bad or old code to never stop me signing in.
- As the team, I want returning students, farmed sign ups and imported checks not to count.

**Acceptance criteria**:
- **AC-1**: A code is 7 characters matching one shared `CODE_RE`: 3 capital letters then 4 from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The letters come from the first word of the name after accents are removed (NFKD) and only A to Z kept, padded with `X`. If the three letters are on a small blocklist of unfriendly words, or the name has no Latin letters, they are `DHI`. The 4 characters are drawn by rejection sampling (no modulo bias) with Web Crypto. Uniqueness is checked in the same transaction as the insert, so no retry loop is needed beyond one extra draw on a clash.
- **AC-2**: `GET /api/referral/validate?code=` is public, rate limited and always answers 200 with `{ ok: true, referrerFirstName }` or `{ ok: false, reason }` where `reason` is `format`, `unknown` or `ended`. The first name is the owner's first word, or `"a friend"` when the owner chose `hideName`. It has no `self` reason. The Pages forwarder passes a hashed `cf-connecting-ip` as the limiter key (a sharded limit with `start: 0`), so one visitor cannot blank the hint for everyone.
- **AC-3**: When a new student profile is created with a code (`students.createProfile`), the server creates a `pending` referral if the code belongs to a joined student, the challenge is live and not ended, and the owner is not the same person. Otherwise the profile is created with no referral. A bad code is dropped, never an error. First code wins: a code is considered only at profile creation, once.
- **AC-4**: A student who already has a profile and opens a `?ref=` link creates no referral and nothing changes for the referrer (`createProfile` returns early for them). The landing page says in plain words that an invite counts when you are new to DhiRise; the code check cannot tell new from existing, so this line is shown for any valid code. Existing students stay eligible to join and refer.
- **AC-5**: The 5 minute job (umbrella) makes a `pending` referral `valid` when the friend's check is `fresh` and complete, the report was seen, and a genuine note exists with a `genuineAt`, and the latest of the three times (`validAt`) is at or before the deadline. It stores `validAt`. Feedback that is not genuine leaves the referral `pending`.
- **AC-6**: A referral with a required step after the deadline, or with a step still missing once the deadline has passed, becomes `rejected (deadline)` on the next run. An imported check never counts.
- **AC-7**: A referrer's `validCount` and `lastValidAt` are written only by the job (and the team commands) through one `recount(referrerId)`, which counts that referrer's `valid` referrals and takes the maximum `validAt`. The read is bounded; an unusually heavy referrer is paged.
- **AC-8**: `challenge.me` returns for a referrer: `code`, `link`, `valid` (from the entry, up to 5 minutes behind) and `pending` (live count from `referrals`). A friend's name or email is never shown to the referrer.
- **AC-9**: Feedback changes in `feedback.submit`: when the saved note is not genuine and a later note is genuine, and it is before the deadline, the later note replaces it, `genuineAt` is set, and the Sheet row is queued again. A genuine note is never replaced. A note saved genuine first time gets `genuineAt` at that time.
- **AC-10**: BACKEND.md scenarios 1 to 9 pass as tests, plus: the same friend cannot create a second referral, a code that does not exist leaves sign in untouched, a hidden owner shows "a friend", and the job is safe to run twice in a row.

## Decision

**Chosen option**: Option 1 of the umbrella: server owned referral rows settled by the 5 minute job.

## Feature design

**Data**: `referrals` and the `challengeEntries` counters from the umbrella; `feedback.genuineAt`.

**API surface**

| Function | Kind | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `GET /api/referral/validate` (Pages forwarder `functions/api/referral/` to a Convex http route) | public http | `code` | `{ ok, referrerFirstName }` or `{ ok:false, reason }` | none (rate limited) | 429 |
| `students.createProfile` (existing) | mutation | existing (the code already travels with the profile form) | existing | signed in | existing |
| `feedback.submit` (existing) | mutation | existing | existing, plus the replacement rule | signed in | existing |
| `challengeBoard.run` | internal mutation (cron, 5 minutes) | none | none | cron | none |
| `challengeCore.recount` | internal helper | referrerId | none | server only | none |

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Code letters | first 3 letters | `students.name` first word, NFKD, A to Z only, padded `X`, or `DHI` (blocklist or no Latin letters) |
| Code characters | the 4 characters | Web Crypto, rejection sampling over the 32 allowed characters |
| Does the code belong to someone | the owner | `challengeEntries` through `by_code` |
| Is the friend new | no earlier profile | `createProfile` makes the row now |
| Is the check fresh and complete | `source`, `completedAt` | the friend's `checks` row |
| Report seen | `reportSeenAt` | the friend's `checks` row |
| Genuine note and its time | `genuine`, `genuineAt` | `feedback` row, set by `feedback.submit` |
| The deadline | `ENDS_AT_MS` | `convex/challengeRules.ts` |
| First name for the hint | first word, or "a friend" | `students.name` and `hideName` |

**Key invariants**: one referral per friend (a `by_friendId` lookup before insert); referrer and friend never the same student; a referral leaves `valid` only through a team reject or the friend's erase; counters follow the referrals.

**Edge cases and failures**: a code in the wrong format or with no owner is dropped; `CHALLENGE_LIVE` off means no referral; a name with no Latin letters gets `DHI`; two job runs overlapping are harmless (each referral is settled by reading the same data); a friend who erases (spec 0014) loses the referral and the referrer is recounted; the validate route is slow-guessable (about 32^4 guesses per prefix), so it only ever reveals what the owner chose to show.

**Browser path**: the landing page keeps the code in `dhirise.ref.v1` until sign in, the profile form sends it to `createProfile`, and `gate.js` no longer calls `recordReferralUse`.

**Critical test scenarios**: the twelve scenarios in `BACKEND.md` section 15 (1 to 9 here), verifies **AC-3 to AC-10**; code format, blocklist, non Latin name, clash, verifies **AC-1**; validate route reasons, hidden owner, the limit, verifies **AC-2**; an imported check never counts, verifies **AC-5, AC-6**; weak note replaced by a genuine one, verifies **AC-9**.

## Build plan

1. Add `challengeRules.ts`, `referrals`, `by_code`, `feedback.genuineAt`, and the job's settle and `recount`, satisfies **AC-5, AC-6, AC-7**.
2. Record a pending referral in `createProfile`, satisfies **AC-3, AC-4**.
3. The note replacement in `feedback.submit`, satisfies **AC-9**.
4. The validate route, forwarder and limit, and switch the landing page's code check to it, satisfies **AC-2**.
5. Code generation rules, satisfies **AC-1**.
6. Tests, satisfies **AC-10**.

## Consequences

**Positive**: one set of rules in one place; sign in is never harmed by a code; no changes to the three busy functions beyond one time field.

**Negative / tradeoffs**: a count can be 5 minutes behind; a friend of an existing student's link sees "Invited by" but nothing counts (explained on the landing page); a person with many real Google accounts is caught only by the top 10 review.

## Rationale

Deriving validity from times we already keep removes the risk of counters drifting and the need to touch three busy functions, and the deadline rule becomes exact because it compares stored step times with the deadline whenever the job runs.
