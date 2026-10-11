# 0019. Winner review tools (scope row 13)

## Summary

After the deadline the team reviews the top 10 referrers by hand before announcing a winner. They use checked terminal commands: one prints the top 10 and writes a CSV with every referral's checks and warnings, one rejects or restores a referral with a reason, and one prints the ranking after review. The public board stays frozen as it was; the winner is chosen from the review ranking.

## Requirements

**User stories**:
- As a reviewer, I want to see each top referrer's referrals with their steps, feedback text and warnings, so that I can spot farming.
- As a reviewer, I want to reject a referral with a reason and see the new ranking.
- As the owner, I want a winner decided from a reviewed ranking and a record of what was changed.

**Acceptance criteria**:
- **AC-1**: `challengeAdmin:top10` (an internal query, run by `npx convex run`) lists the 10 best referrers by live data: display name, class, valid count, and for each referral its status, the three step times, whether the feedback was genuine, the feedback text, the friend's email (internal only) and these warnings: more than 5 referrals in any one hour, the same feedback text as another referral, and a gap of under 3 minutes between the friend's first answer and finish.
- **AC-2**: `challengeAdmin:exportCsv` returns the same data as CSV text for all of the top 10; the procedure says to redirect it to a file. No command is ever run in an AI session.
- **AC-3**: `challengeAdmin:reject` takes a `referralId` or the friend's email, a `reason` and a `note`. It works on a `pending` or `valid` referral: it sets `status: rejected`, `rejectReason: review`, `reviewNote`, `reviewedAt` and keeps `validAt`, then recounts the referrer with the shared `recount`. `challengeAdmin:restore` puts a reviewed referral back to `pending`, and the next job run settles it again (so a referral that really qualifies returns to `valid`, and one past the deadline stays `rejected (deadline)`).
- **AC-4**: `challengeAdmin:ranking` prints the top 10 again from live data after review. The public board is not changed; the winner is the top valid referrer of this ranking.
- **AC-5**: Every change is kept on the referral (`reviewNote`, `reviewedAt`); nothing else is deleted. A production run needs `--prod` and the owner's yes.
- **AC-6**: A written procedure `tools/WINNER-REVIEW.md` covers who runs it, what to look for (the warnings above, and the whole referral timeline of each referrer, not just the feedback text), how to contact the winner (email, phone, and a parent or guardian if under 18), and that the CSV is deleted after the announcement.
- **AC-7**: Tests: the ranking after a reject changes the order; restore puts it back; a reject never touches another referrer; the warnings count correctly; the CSV has the right columns; a reject of an unknown referral changes nothing; `recount` takes the maximum `validAt`.

## Decision

**Chosen option**: Option 1 of the umbrella: terminal commands and a CSV (your choice), built last.

## Feature design

**Data**: `referrals.reviewNote`, `reviewedAt`, `rejectReason` and `validAt` from the umbrella. No new table.

**API surface** (all internal, run with `npx convex run`)

| Function | Kind | Inputs | Output | Key errors |
|---|---|---|---|---|
| `challengeAdmin:top10` | internal query | none | the top 10 with their referrals and warnings | none |
| `challengeAdmin:exportCsv` | internal query | none | CSV text | none |
| `challengeAdmin:reject` | internal mutation | `referralId` or `friendEmail`, `reason`, `note` | counts only | `no_match` |
| `challengeAdmin:restore` | internal mutation | same | counts only | `no_match` |
| `challengeAdmin:ranking` | internal query | none | the top 10 after review | none |

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| The top 10 | referrers by count, `lastValidAt`, `joinedAt` | `challengeEntries` |
| A referral's checks | step times and genuine flag | `checks.completedAt`, `checks.reportSeenAt`, `feedback.genuineAt`, `feedback.genuine` |
| Friend email, feedback text | internal only | `students.email`, `feedback.text` |
| Hourly burst, duplicate text, quick finish | warnings | computed in the query from the times and texts above |
| Who changed it | the note | typed by the reviewer in the command |

**Key invariants**: a command never changes a student's own data; counts follow referrals through `recount`.

**Security model**: CLI with the deployment's admin access; the output holds personal data (friend emails, feedback text), so the procedure forbids AI sessions, says to keep the file private and to delete it after the announcement.

**Critical test scenarios**: as AC-7, verifies **AC-1 to AC-7**.

## Build plan

1. Add `top10`, `ranking` and the CSV, satisfies **AC-1, AC-2, AC-4**.
2. Add `reject` and `restore`, satisfies **AC-3, AC-5**.
3. Write `tools/WINNER-REVIEW.md`, satisfies **AC-6**.
4. Tests, satisfies **AC-7**.

## Consequences

**Positive**: a fair, recorded review with no new screen, buildable after the deadline.

**Negative / tradeoffs**: reviewers need a terminal; row 14's admin view can add a screen later; the winner may differ from the frozen public board if a referral is rejected, so the announcement must say the result is after review (the terms already say this).

## Rationale

A command and a file is the smallest thing that gives a reviewer the facts and a recorded way to reject, and it fits the window because it is needed only after 30 October. The warnings replace the cut device marker with signals that need no extra identifier.
