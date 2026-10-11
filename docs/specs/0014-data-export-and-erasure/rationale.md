# 0014. Rationale

## Context

> ⚠️ Premise note: erasure sits against three things you also want: the consent proof, the team access log, and a block on re-joining. Each is defensible, but each leaves something behind after a student asks for deletion, and some of it (ages, times, a hashed email for 30 days) can still point to a person in a small group. This spec keeps all three as you chose, keeps them as thin as possible (ids and times only, a keyed hash instead of an email), and lists the lawyer check as owed. The privacy page must say what stays and why.

Students are in Class 8 to college, many under 18. The app holds sign in data, answers, a result with sensitive flags (low mood, self doubt and so on), a phone number, feedback, a saved PDF of the report, a profile picture and a private report link. Copies also live in the team's Google Sheet. Compliance scope: India's Digital Personal Data Protection Act, 2023, which gives people access and erasure rights and treats children's data with extra care. Google's consent screen also asks for a way to remove data.

Earlier specs already point here (0006 for report files, 0008 for the access log, 0010 for share rows, 0011 for pictures and their files), and several tables carry a comment "for erasing a student's data (scope row 15)", so the indexes exist. No function deletes a student yet. The convention in `convex/AGENTS.md` says results and consents are never deleted by app code, and a source scan enforces it for results.

A student holds a few dozen rows (18 answers, one check, one result, one flags row, at most one of each other kind) so a single transaction is enough.

## Options considered

### Option 1: One all or nothing erase function, one export function, a checked team command
`convex/dataRights.ts` with the student's functions, internal team functions run from the terminal, and a daily sweep.

**Pros**:
- No half erased state; easy to test and to explain.
- Reuses the existing Sheet delete queue, the rate limiter and the `purge.ts` pattern for the auth component.
- The team path needs no new screen or role system.

**Cons**:
- A team command is manual, so a parent waits for a person.
- Relies on a student holding few rows; a very unusual student could hit transaction limits (the test covers a full student with margin).

### Option 2: A request queue with team approval
Every request becomes a ticket the team approves, then a background job erases in stages.

**Pros**:
- A person checks every request; resumable for huge accounts.

**Cons**:
- Needs a queue, a screen and statuses (row 14's work), and leaves half erased states to reason about. Slower for a student who just wants their data gone.

### Option 3: A grace period before deletion
Mark for deletion, wait 7 days for a cancel, then erase.

**Pros**:
- Protects against a mistaken tap.

**Cons**:
- Keeps data for a week after the request, awkward for a parent, and adds a state and a daily job. Not chosen.

## Rationale

Option 1 wins on the forces above: a student's data is small, the product is small, and the two things that go wrong with erasure are partial deletion and the wrong person asking. A single transaction removes the first, and the two fact check with a reply to the student's own email addresses the second as far as a small team can. A button for the team and a queue (Option 2) belong to row 14, which widens team access into roles and auditing.

Choices where you overrode or extended my recommendation: you chose to keep the consent proof and a 30 day email block (my recommendation was to keep only the receipt and the access log, and to let a returning student start fresh). The block is kept thin: a keyed hash, 30 days, deleted by the daily job, never in plain. The consent proof is kept as is (rows with age, guardian tick, text version and time, but no name or email) and flagged for the lawyer. Runner up on the block was "start fresh"; the cost of your choice is that a hashed email lives for a month and a student who deleted by mistake waits 30 days. The cross check called the block the weakest piece (it keeps a pseudonymous identifier and could lock a child out), so it applies only to a student's own erase and not to a team erase for a parent.

Student export keeps the sensitive flags because they are the student's own data and the app already returns them to the owner; a parent's export omits them because a child may not have shared those answers and the team cannot be sure the request is a child's wish.

## Evidence: where a student's data lives today

| Store | Holds | Handling in this spec |
|---|---|---|
| `students` | name, age, class, email, referral code, notice flag | deleted |
| `checks`, `answers` | the check, 18 option ids | deleted |
| `results`, `resultFlags` | score, style, detail; the sensitive flags | deleted (flags in the student's export only) |
| `leads` | phone, WhatsApp choice | deleted |
| `feedback` | rating, text | deleted |
| `consents` | what was agreed, when, age at consent, guardian tick | kept (consent proof) |
| `reportFiles` + stored PDF | saved report | deleted |
| `avatars` + stored image | profile picture copy | deleted |
| `reportShares` | private link state | deleted (link stops at once) |
| `sheetSync` + the Sheet | copy queue; Leads and Feedback rows; report link | Sheet rows deleted through the existing delete op; the finished queue rows are swept 7 days later |
| `reportViews` | ids, fingerprint, team email | kept (team access log) |
| Better Auth user, session, account, verification | email, name, picture address, encrypted Google tokens | deleted through the component |
| rate limiter component | counters keyed by student id, no other personal data | left to expire |
| Device `localStorage` (`dhirise.*`) | a copy of answers and result | wiped on that device after erase |
| Edge cache | a picture, up to 50 minutes | cannot be recalled; stated on the privacy page |
| Google Sheet version history, Convex backups | old values | cannot be removed by us; stated on the privacy page |
