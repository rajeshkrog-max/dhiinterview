# 0017. Challenge join with parent consent (scope row 11)

## Summary

A signed in student joins the challenge by ticking that they accept the rules. A student under 18 must also tick that a parent or guardian agrees. The server records the tick as a consent (with its text version, the age and the time), makes the student's code, and can be switched on and off with one setting. A student can hide their name on the board, and can leave the challenge as easily as they joined.

## Requirements

**User stories**:
- As a student, I want to join with one clear step and get my code and link.
- As a parent or guardian, I want my agreement to be asked for and recorded when my child joins.
- As a student, I want to take part without my name being public, and to leave whenever I want.
- As the team, I want to deploy before the go live moment and switch the challenge on later.

**Acceptance criteria**:
- **AC-1**: `challenge.join` creates the student's entry and returns their code. A second join returns the same code and changes nothing. Existing students (every current student) can join.
- **AC-2**: Joining needs the rules tick (`rulesAccepted: true`). For a student under 18 (age from `students.age` on the server) it also needs `parentConsent: true`. Without them it answers `{ ok: false, code: "rules" }` or `"parentConsent"`. An adult does not see or need the parent tick.
- **AC-3**: A successful join adds one `consents` row of kind `challenge` with the text version `challenge-v1`, the age at consent, the guardian tick and the time, and the entry points to it (`consentId`). `challenge-v1` holds the rules summary and the parent line and is stored verbatim like other consent texts. The consent kind union, `ConsentKind` and `CONSENT_KINDS` all gain `challenge` (the other readers filter by kind and are unaffected).
- **AC-4**: Joining after the deadline answers `{ ok: false, code: "ended" }`. With `CHALLENGE_LIVE` off it answers `{ ok: false, code: "not_open" }` and creates nothing.
- **AC-5**: The join form has a tick "Show me as Anonymous <my style> on the leaderboard" (`hideName`); `challenge.setHideName` changes it until the deadline.
- **AC-6**: `challenge.leave` deletes the student's entry (and its code, which then answers `unknown`), keeps the consent row and the referral history, and drops the student from the next snapshot. Their friends' referrals keep their own status but no longer count for anyone. A student can join again before the deadline and gets a new code.
- **AC-7**: A student can join only once they have a finished check (the entry needs a style for the board). Before that the join answers `{ ok: false, code: "no_result" }` and the page shows its existing "finish first" state.
- **AC-8**: Joins are limited to 5 tries an hour per student.
- **AC-9**: BACKEND.md scenario 11 passes, and so do the adult join, the repeat join, ended, not open, no result, hide name and leave.

## Decision

**Chosen option**: Option 1 of the umbrella: a tick recorded as a `challenge` consent, a server switch, `hideName` on the entry, and a leave function.

## Feature design

**Data**: `challengeEntries` from the umbrella; the `consents` kind union gains `challenge`.

**API surface**

| Function | Kind | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `challenge.join` | mutation | `rulesAccepted`, `parentConsent` (opt), `hideName` | `{ ok: true, code }` or `{ ok: false, code }` | signed in | `rules`, `parentConsent`, `ended`, `not_open`, `no_result`, rate limited |
| `challenge.setHideName` | mutation | `hideName` | `{ ok: true }` | signed in | `not_joined`, `ended` |
| `challenge.leave` | mutation | none | `{ ok: true }` | signed in | `not_joined` |
| `challenge.me` | query | none | `{ joined, code, link, hideName, valid, pending, rank, toNext, nextRank, endsAt, frozen }` | signed in | none |

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Under 18 | age | `students.age` |
| The link | share address plus `/landing.html?ref=` plus the code | `shareUrl` in `js/funnel-config.js` at deploy time, built in the browser from `code` |
| The style for the board | `styleKey` | the student's saved result (`results.styleKey`) |
| Consent text and version | `challenge-v1` | `convex/consentText.ts` (a new, frozen version) |
| Age at consent | age at that moment | `students.age` |
| Rank, `toNext`, `nextRank` | the job's last values | the entry (written by the job, up to 5 minutes old) |
| `endsAt`, `frozen` | deadline and freeze state | `convex/challengeRules.ts` and the snapshot |

**Key invariants**: one entry per student; a consent row is added, never edited; the parent tick comes only from the browser's explicit `parentConsent` and is required for under 18s.

**Security model**: `requireStudent` (no student id input); the server decides the age, the browser never sends "under 18".

**Critical test scenarios**: adult join; under 18 without the tick refused and with the tick accepted and stored; repeat join returns the same code; ended and not open refuse; no result refuses; hide name stored and changeable; leave removes the entry, keeps the consent, and the code answers `unknown`; the consent row has the right version and age, verifies **AC-1 to AC-9**.

## Build plan

1. Add `challengeEntries`, the `challenge` consent kind and `challenge-v1` text, and `challenge.join` for an adult with the switch, satisfies **AC-1, AC-3, AC-4**.
2. Add the rules and parent ticks, no result check, rate limit, satisfies **AC-2, AC-7, AC-8**.
3. Add `hideName`, `setHideName` and `leave`, satisfies **AC-5, AC-6**.
4. Switch `js/done.js` `#join` and the challenge page to the bridge, add the ticks to the form, satisfies **AC-2, AC-5**.
5. Tests, satisfies **AC-9**.

## Consequences

**Positive**: a recorded, versioned consent for the contest and for a child's parent; an off switch; leaving is as easy as joining.

**Negative / tradeoffs**: the parent tick is a tick, not a verified guardian; a child can tick it alone. This is the same level as the landing consent and is on the lawyer list.

## Rationale

Reusing `consents` gives an audit trail (version, age, time, guardian tick) with no new table. A tick matches the timeline; email or one time code verification needs a service that does not exist yet. A leave function matches the data protection expectation that withdrawing consent is as easy as giving it.
