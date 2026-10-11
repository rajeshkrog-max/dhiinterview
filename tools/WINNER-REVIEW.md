# Winner review (after the challenge ends)

For the Founding Circle Challenge (spec 0015, child 0019). The challenge ends at **23:59 India time on 30 October 2026**. The public board freezes by itself within about 5 minutes (the footer of `leaderboard.html` then says "Final board"). The winner is **not** read off that board: the team first reviews the top 10 referrers by hand, and the winner is the first line of the ranking after review. The terms already say the result is announced after review.

## Who runs it, and where

- The owner, or one team member the owner names. Nobody else.
- On your own computer, in a terminal in the project folder, signed in to Convex (`npx convex login`).
- **Never in an AI session** (Claude Code, a chat assistant, anything that reads your screen). The output holds students' email addresses and what they wrote.
- Production needs `--prod` on every command and the owner's yes. Without `--prod` a command runs on the dev deployment, which holds test students only.
- Quoting: in Git Bash or a Mac terminal put the JSON in single quotes, as below. In Windows PowerShell put it in single quotes **and write each inner double quote as `\"`**, for example `'{\"friendEmail\":\"a@b.com\",\"reason\":\"x\",\"note\":\"y\"}'`.

## Steps

1. **Check the board is final.** Open the leaderboard: it says "Challenge ended" and "Final board". If it does not after 10 minutes, run `npx convex run challengeBoard:run '{}' --prod` once and look again.
2. **Read the top 10.** `npx convex run challengeAdmin:top10 --prod`. For each of the 10 referrers it shows the name, class, email, valid count, and every referral with: status, when the friend signed up, finished, saw the report and left a genuine note, the note itself, the friend's email, and the warnings.
3. **Write the CSV** (easier to read in a spreadsheet): `node tools/winner-csv.mjs review-2026-10-31.csv --prod`. It makes a new file (it never overwrites one) with one line per referral. Keep it in a private folder. Files named `review-*.csv` are git ignored; keep that name.
4. **Look at every referrer, not only the first.** See "What to look for".
5. **Reject what is not genuine.** `npx convex run challengeAdmin:reject '{"friendEmail":"friend@example.com","reason":"same feedback text","note":"matches 3 other notes"}' --prod`. You can use `"referralId"` from the output instead of the email. The referral stays on record with your words and the time; the referrer's count goes down at once. Give the reason every time.
6. **Undo a mistake.** `npx convex run challengeAdmin:restore '{"friendEmail":"friend@example.com","reason":"checked by phone","note":"a real student"}' --prod`. The referral is checked again by the same rule as before: it comes back valid if all three steps were done by the deadline, and stays rejected (deadline) if one came after. Your earlier words stay and the restore is added to them. Only a referral that you rejected can be restored.
7. **Read the ranking.** `npx convex run challengeAdmin:ranking --prod`. Order: more valid referrals first, then whoever reached that count first, then the earlier join. **The first line is the winner.** The public board does not change; it still shows the order from 30 October.
8. **Contact the winner.** The email is in the ranking. The phone number is in the Leads sheet (search the email). If the winner is **under 18** (the age is on their row in the dashboard `students` table), write to or call the **parent or guardian**, not only the student; the guardian tick for the challenge is kept in the `consents` table (kind `challenge`, `guardianPresent`). Say that the result is after review.
9. **Delete.** After the announcement delete the CSV and any pasted copy of the output. The record of what you changed stays on the referrals, which is enough.

## What to look for

A warning is a reason to look closer, never proof, and nothing is rejected for you.

| Warning | Meant by | Often innocent when |
|---|---|---|
| `burst` | More than 5 of one referrer's friends signed up within one hour | a class or a hostel floor joined together; then look at the notes and the finish times |
| `same_text` | The same note (ignoring capitals and spaces) on another referral in the top 10 | rare; real students seldom write the same 30 characters |
| `fast_finish` | The friend finished within 3 minutes of the first answer | a student who clicked through; 18 questions are not read in 3 minutes |

Then look at the **whole timeline** of each referrer, because a clever farmer avoids the three warnings:

- Sign up, finish, report and note all within a few minutes of each other, again and again.
- Friend emails that look made up in a row (similar names or numbers), or many friends who share a note style.
- Many friends who finished and left a note in the last hours before the deadline.
- The referrer and the friends sharing a family name or a school when the notes read alike.
- A friend with `check` other than `fresh` never counts (the server already refuses it).

When in doubt, ask the student or the parent for a short call before rejecting. A reject without a reason is refused.

## What a command answers

`reject` and `restore` answer `{ ok: true, status, referrerValid }` (the new count), or `{ ok: false, code }` with `no_match` (no such referral or email), `give_one` (give `referralId` or `friendEmail`, not both and not neither), `no_reason`, or `bad_state` (already rejected; or, for restore, not rejected by review). A refused command changes nothing.

## Records

Every change is kept on the referral (`reviewNote`, `reviewedAt`); nothing is deleted. The commands do not log names, emails or notes. They never touch a student's own answers, result or note.
