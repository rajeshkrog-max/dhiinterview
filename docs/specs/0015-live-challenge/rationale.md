# 0015. Rationale

## Context

> ⚠️ Premise note: the challenge ends on 30 October 2026 at 23:59 India time, 19 days from this design, and the plan also calls 30 October launch day. Everything here (join, referral checks on the server, the leaderboard and the guard against cheating) has to be built, checked and switched on inside that window, or the challenge runs for only a few days. The design keeps to what the date allows: winner review is a command and a CSV (needed only after the deadline), the leaderboard is a 5 minute snapshot (cheap and matches what the screen already says), and the server switch lets everything be deployed before the go live moment.

The funnel (sign in, 18 questions, report) is live. The challenge screens (`challenge.html`, `leaderboard.html`, the report invite) and the whole data layer are a localStorage mock (`js/api.js`) with 30 demo rows. `BACKEND.md` section 8 and 15 hold the referral rules and twelve test scenarios; they are a plan, not code. `students.referralCodeEntered` already stores a format checked code. The prize is a gift hamper worth up to ₹5,000, one winner, no cash swap (`terms.html`).

Students are in Class 8 to college and many are under 18, so the data protection rules for children apply to anything public about them (names on a board) and to consent (a parent's tick, and withdrawing it). The scope header says live referrals, join and the leaderboard stayed out of the earlier pass and that demo rows stood in; this design replaces them.

## Options considered

### Option 1: Server owned referral rows, a 5 minute job, a command based review
Three tables, a cron job that settles which referrals are valid from data we already keep, ranks everyone and writes a top 50 snapshot, and terminal commands for the top 10 review.

**Pros**:
- All rules in one place on the server; the browser cannot fake anything.
- No change to the three busy functions (finish, report seen, feedback) beyond one time field, and no counters that can drift.
- Cheap to read (the board is one row), fast to build, easy to test with the twelve scenarios.
- Review needs no new screen or role system.

**Cons**:
- The board and a student's own rank can differ by up to 5 minutes.
- The team runs the review from a terminal.

### Option 2: A live reactive leaderboard
Compute rank on every read so the board is always current.

**Pros**:
- Always up to date.

**Cons**:
- Reads every entry on every view (costly as the crowd grows), and the screen already promises "updated every 5 minutes". Not worth it for a few days of contest.

### Option 3: Compute everything from the existing tables with no new tables
Count valid friends by scanning `students`, `checks`, `feedback` on demand.

**Pros**:
- No new tables.

**Cons**:
- No place for the code, status, rejection reason or review note; slow; and no way to record a manual rejection.

## Rationale

Option 1 fits the forces: a short deadline, a server that must hold every rule, children's data, and a small team. Deciding validity in one job, from the step times the three existing functions already store, means every referral is judged the same way and the deadline rule is exact (stored times against 23:59 IST, whenever the job runs). The snapshot keeps the public read to one document and matches the 5 minute promise already on the screen. A command for winner review is enough because the review happens once, after the deadline, by one or two people.

Where your choices set the shape: you kept the rules in BACKEND.md section 8 as written, chose a tick (not an email or phone check) for the guardian, the manual top 10 review, a "hide my name" option on the board, and a frozen final board after the end. You first chose to add a hashed shared device flag; after the cross check you cut it from this release because private windows defeat it and it would force a consent text bump, a secret and a purge job, and the review uses timing and duplicate text instead. You also chose, on the cross check's advice, to let the job (not a hook) decide validity, and to let a genuine feedback note replace a weak one. Choices that were mine: the leaderboard is visible to signed in students only (the page needs sign in already, and this stops minors' names being on the open internet), the server switch `CHALLENGE_LIVE` lets us deploy early, and a leave function so withdrawing consent is as easy as giving it.

The tie break (earliest to reach the count) and the 50 row size come from `BACKEND.md`; the 5 minute refresh comes from the screen's own promise.

## Evidence: what exists today

| Thing | State |
|---|---|
| `js/api.js` | localStorage mock; every function has a `// BACKEND:` note; 30 demo rows |
| `js/challenge.js`, `js/challenge-ui.js`, `js/leaderboard.js`, `js/gate.js` | screens that call `DhiApi`; the landing page keeps `?ref=` in `dhirise.ref.v1` until sign in |
| `students.referralCodeEntered` | stored by `createProfile` after a format check only |
| `feedback.genuine` | decided on the server by `feedbackRules.ts` (30 characters, 5 different letters, no 5 in a row) |
| `checks.source` (`fresh` or `imported`) | lets "an imported check never counts" be enforced |
| `consents.guardianPresent` and `ageAtConsent` | already store the guardian tick for the landing consent |
| `feedback` | keeps the first note only today; gets `genuineAt` and the replace rule in this design |
| `LEADERBOARD_PICTURES_ENABLED` and `leaderboardPictureFor` | spec 0011 already defines the optional picture on a leaderboard row (off in production) |
